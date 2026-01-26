import { Client as SSHClient } from "ssh2";
import { db } from "@/lib/db";
import { sslCertificates, NewSSLCertificate, SSLCertificate } from "@/lib/db/platform-schema";
import { getSSHPrivateKey, getServerById } from "@/lib/server-config-store";
import { auditService } from "@/lib/services/audit-service";
import { eq, desc } from "drizzle-orm";

export interface SSLCertificateInfo {
  domain: string;
  status: "pending" | "issued" | "expired" | "revoked" | "error";
  issuedAt?: Date;
  expiresAt?: Date;
  daysUntilExpiry?: number;
  provider: string;
  autoRenew: boolean;
  certificatePath?: string;
  privateKeyPath?: string;
}

export interface SSHConnectionConfig {
  host: string;
  port?: number;
  username: string;
}

interface SSHCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class SSLService {
  private defaultServerId = "linode";

  private async executeSSHCommand(
    command: string,
    config?: SSHConnectionConfig
  ): Promise<SSHCommandResult> {
    const privateKey = getSSHPrivateKey();
    if (!privateKey) {
      throw new Error(
        "SSH private key not available. Check SSH_PRIVATE_KEY_FILE or SSH_PRIVATE_KEY environment variables."
      );
    }

    let connectionConfig: SSHConnectionConfig;

    if (config) {
      connectionConfig = config;
    } else {
      const server = await getServerById(this.defaultServerId);
      if (!server) {
        throw new Error(`Default server '${this.defaultServerId}' not found`);
      }
      connectionConfig = {
        host: server.host,
        port: server.port || 22,
        username: server.user,
      };
    }

    return new Promise((resolve, reject) => {
      const conn = new SSHClient();
      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error("SSH command timeout after 60 seconds"));
      }, 60000);

      conn.on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          stream.on("close", (code: number) => {
            clearTimeout(timeout);
            conn.end();
            resolve({ stdout, stderr, code });
          });

          stream.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.connect({
        host: connectionConfig.host,
        port: connectionConfig.port || 22,
        username: connectionConfig.username,
        privateKey,
        readyTimeout: 30000,
      });
    });
  }

  async requestCertificate(
    domain: string,
    options?: {
      userId?: string;
      username?: string;
      email?: string;
      staging?: boolean;
    }
  ): Promise<SSLCertificate> {
    const email = options?.email || "admin@evindrake.net";
    const stagingFlag = options?.staging ? "--staging" : "";

    const [existing] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.domain, domain));

    if (existing && existing.status === "issued") {
      throw new Error(`Certificate already exists for domain: ${domain}`);
    }

    const [certificate] = await db
      .insert(sslCertificates)
      .values({
        domain,
        provider: "letsencrypt",
        status: "pending",
        autoRenew: true,
      })
      .onConflictDoUpdate({
        target: sslCertificates.domain,
        set: {
          status: "pending",
          updatedAt: new Date(),
        },
      })
      .returning();

    try {
      const command = `sudo certbot certonly --nginx -d ${domain} --non-interactive --agree-tos --email ${email} ${stagingFlag} 2>&1`;
      const result = await this.executeSSHCommand(command);

      if (result.code !== 0) {
        await db
          .update(sslCertificates)
          .set({
            status: "error",
            renewalError: result.stderr || result.stdout,
            updatedAt: new Date(),
          })
          .where(eq(sslCertificates.id, certificate.id));

        throw new Error(
          `Certbot failed: ${result.stderr || result.stdout}`
        );
      }

      const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
      const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

      const expiryResult = await this.executeSSHCommand(
        `sudo openssl x509 -enddate -noout -in ${certPath} 2>&1`
      );

      let expiresAt: Date | null = null;
      if (expiryResult.code === 0) {
        const match = expiryResult.stdout.match(
          /notAfter=(.+)/
        );
        if (match) {
          expiresAt = new Date(match[1]);
        }
      }

      const [updated] = await db
        .update(sslCertificates)
        .set({
          status: "issued",
          issuedAt: new Date(),
          expiresAt,
          certificatePath: certPath,
          privateKeyPath: keyPath,
          renewalError: null,
          updatedAt: new Date(),
        })
        .where(eq(sslCertificates.id, certificate.id))
        .returning();

      await auditService.log({
        userId: options?.userId,
        username: options?.username,
        action: "ssl.request",
        resource: "ssl_certificate",
        resourceId: updated.id,
        details: { domain, provider: "letsencrypt" },
        status: "success",
      });

      return updated;
    } catch (error: any) {
      await auditService.log({
        userId: options?.userId,
        username: options?.username,
        action: "ssl.request",
        resource: "ssl_certificate",
        resourceId: certificate.id,
        details: { domain, error: error.message },
        status: "failure",
      });

      throw error;
    }
  }

  async renewCertificate(
    certificateId: string,
    options?: {
      userId?: string;
      username?: string;
      force?: boolean;
    }
  ): Promise<SSLCertificate> {
    const [certificate] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.id, certificateId));

    if (!certificate) {
      throw new Error(`Certificate not found: ${certificateId}`);
    }

    await db
      .update(sslCertificates)
      .set({
        lastRenewalAttempt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sslCertificates.id, certificateId));

    try {
      const forceFlag = options?.force ? "--force-renewal" : "";
      const command = `sudo certbot renew --cert-name ${certificate.domain} ${forceFlag} --non-interactive 2>&1`;
      const result = await this.executeSSHCommand(command);

      if (result.code !== 0 && !result.stdout.includes("Cert not yet due for renewal")) {
        await db
          .update(sslCertificates)
          .set({
            renewalError: result.stderr || result.stdout,
            updatedAt: new Date(),
          })
          .where(eq(sslCertificates.id, certificateId));

        throw new Error(
          `Certificate renewal failed: ${result.stderr || result.stdout}`
        );
      }

      const certPath = certificate.certificatePath || `/etc/letsencrypt/live/${certificate.domain}/fullchain.pem`;
      const expiryResult = await this.executeSSHCommand(
        `sudo openssl x509 -enddate -noout -in ${certPath} 2>&1`
      );

      let expiresAt: Date | null = null;
      if (expiryResult.code === 0) {
        const match = expiryResult.stdout.match(/notAfter=(.+)/);
        if (match) {
          expiresAt = new Date(match[1]);
        }
      }

      const [updated] = await db
        .update(sslCertificates)
        .set({
          status: "issued",
          expiresAt,
          renewalError: null,
          updatedAt: new Date(),
        })
        .where(eq(sslCertificates.id, certificateId))
        .returning();

      await auditService.log({
        userId: options?.userId,
        username: options?.username,
        action: "ssl.renew",
        resource: "ssl_certificate",
        resourceId: certificateId,
        details: { domain: certificate.domain },
        status: "success",
      });

      return updated;
    } catch (error: any) {
      await auditService.log({
        userId: options?.userId,
        username: options?.username,
        action: "ssl.renew",
        resource: "ssl_certificate",
        resourceId: certificateId,
        details: { domain: certificate.domain, error: error.message },
        status: "failure",
      });

      throw error;
    }
  }

  async revokeCertificate(
    certificateId: string,
    options?: {
      userId?: string;
      username?: string;
      reason?: string;
    }
  ): Promise<void> {
    const [certificate] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.id, certificateId));

    if (!certificate) {
      throw new Error(`Certificate not found: ${certificateId}`);
    }

    try {
      const certPath = certificate.certificatePath || `/etc/letsencrypt/live/${certificate.domain}/fullchain.pem`;
      const command = `sudo certbot revoke --cert-path ${certPath} --non-interactive 2>&1`;
      const result = await this.executeSSHCommand(command);

      if (result.code !== 0) {
        throw new Error(
          `Certificate revocation failed: ${result.stderr || result.stdout}`
        );
      }

      await db
        .update(sslCertificates)
        .set({
          status: "revoked",
          updatedAt: new Date(),
        })
        .where(eq(sslCertificates.id, certificateId));

      await auditService.log({
        userId: options?.userId,
        username: options?.username,
        action: "ssl.revoke",
        resource: "ssl_certificate",
        resourceId: certificateId,
        details: { domain: certificate.domain, reason: options?.reason },
        status: "success",
      });
    } catch (error: any) {
      await auditService.log({
        userId: options?.userId,
        username: options?.username,
        action: "ssl.revoke",
        resource: "ssl_certificate",
        resourceId: certificateId,
        details: { domain: certificate.domain, error: error.message },
        status: "failure",
      });

      throw error;
    }
  }

  async checkCertificateStatus(
    certificateId: string
  ): Promise<SSLCertificateInfo> {
    const [certificate] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.id, certificateId));

    if (!certificate) {
      throw new Error(`Certificate not found: ${certificateId}`);
    }

    let status = certificate.status as SSLCertificateInfo["status"];
    let expiresAt = certificate.expiresAt;
    let daysUntilExpiry: number | undefined;

    if (certificate.certificatePath && certificate.status === "issued") {
      try {
        const expiryResult = await this.executeSSHCommand(
          `sudo openssl x509 -enddate -noout -in ${certificate.certificatePath} 2>&1`
        );

        if (expiryResult.code === 0) {
          const match = expiryResult.stdout.match(/notAfter=(.+)/);
          if (match) {
            expiresAt = new Date(match[1]);
            const now = new Date();
            daysUntilExpiry = Math.ceil(
              (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysUntilExpiry <= 0) {
              status = "expired";
              await db
                .update(sslCertificates)
                .set({ status: "expired", updatedAt: new Date() })
                .where(eq(sslCertificates.id, certificateId));
            } else if (expiresAt !== certificate.expiresAt) {
              await db
                .update(sslCertificates)
                .set({ expiresAt, updatedAt: new Date() })
                .where(eq(sslCertificates.id, certificateId));
            }
          }
        }
      } catch (error) {
        console.error("[SSL] Error checking certificate expiry:", error);
      }
    }

    return {
      domain: certificate.domain,
      status,
      issuedAt: certificate.issuedAt || undefined,
      expiresAt: expiresAt || undefined,
      daysUntilExpiry,
      provider: certificate.provider || "letsencrypt",
      autoRenew: certificate.autoRenew || false,
      certificatePath: certificate.certificatePath || undefined,
      privateKeyPath: certificate.privateKeyPath || undefined,
    };
  }

  async listCertificates(): Promise<SSLCertificate[]> {
    return db
      .select()
      .from(sslCertificates)
      .orderBy(desc(sslCertificates.createdAt));
  }

  async getCertificateById(id: string): Promise<SSLCertificate | null> {
    const [certificate] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.id, id));

    return certificate || null;
  }

  async getCertificateByDomain(domain: string): Promise<SSLCertificate | null> {
    const [certificate] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.domain, domain));

    return certificate || null;
  }

  async deleteCertificateRecord(
    certificateId: string,
    options?: {
      userId?: string;
      username?: string;
    }
  ): Promise<void> {
    const [certificate] = await db
      .select()
      .from(sslCertificates)
      .where(eq(sslCertificates.id, certificateId));

    if (!certificate) {
      throw new Error(`Certificate not found: ${certificateId}`);
    }

    await db.delete(sslCertificates).where(eq(sslCertificates.id, certificateId));

    await auditService.log({
      userId: options?.userId,
      username: options?.username,
      action: "ssl.revoke",
      resource: "ssl_certificate",
      resourceId: certificateId,
      details: { domain: certificate.domain, action: "record_deleted" },
      status: "success",
    });
  }

  async getExpiringCertificates(daysThreshold = 30): Promise<SSLCertificate[]> {
    const certificates = await this.listCertificates();
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    return certificates.filter((cert) => {
      if (!cert.expiresAt || cert.status !== "issued") return false;
      return new Date(cert.expiresAt) <= thresholdDate;
    });
  }

  async autoRenewCertificates(options?: {
    userId?: string;
    username?: string;
  }): Promise<{ renewed: string[]; failed: string[] }> {
    const expiringCerts = await this.getExpiringCertificates(30);
    const autoRenewCerts = expiringCerts.filter((cert) => cert.autoRenew);

    const renewed: string[] = [];
    const failed: string[] = [];

    for (const cert of autoRenewCerts) {
      try {
        await this.renewCertificate(cert.id, {
          userId: options?.userId,
          username: options?.username,
        });
        renewed.push(cert.domain);
      } catch (error: any) {
        console.error(`[SSL] Auto-renewal failed for ${cert.domain}:`, error.message);
        failed.push(cert.domain);
      }
    }

    return { renewed, failed };
  }
}

export const sslService = new SSLService();
