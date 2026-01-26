import SftpClient from "ssh2-sftp-client";
import { Client as SSHClient, SFTPWrapper } from "ssh2";
import { db } from "@/lib/db";
import { sftpTransfers, NewSFTPTransfer, SFTPTransfer } from "@/lib/db/platform-schema";
import { getSSHPrivateKey } from "@/lib/server-config-store";
import { eq, desc } from "drizzle-orm";

export interface SFTPConnectionConfig {
  host: string;
  port?: number;
  username: string;
  connectionId?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory" | "link" | "unknown";
  size: number;
  modifyTime: number;
  accessTime: number;
  rights?: {
    user?: string;
    group?: string;
    other?: string;
  };
  owner?: number;
  group?: number;
}

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
}

export type TransferProgressCallback = (progress: TransferProgress) => void;

export class SFTPService {
  private sftp: SftpClient | null = null;
  private config: SFTPConnectionConfig | null = null;

  async connect(config: SFTPConnectionConfig): Promise<void> {
    const privateKey = getSSHPrivateKey();
    if (!privateKey) {
      throw new Error("SSH private key not available. Check SSH_PRIVATE_KEY_FILE or SSH_PRIVATE_KEY environment variables.");
    }

    this.sftp = new SftpClient();
    this.config = config;

    await this.sftp.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      privateKey,
      readyTimeout: 30000,
      retries: 3,
      retry_minTimeout: 2000,
    });
  }

  async disconnect(): Promise<void> {
    if (this.sftp) {
      try {
        await this.sftp.end();
      } catch (err) {
        console.error("[SFTP] Error disconnecting:", err);
      }
      this.sftp = null;
    }
  }

  private ensureConnected(): void {
    if (!this.sftp) {
      throw new Error("SFTP connection not established");
    }
  }

  async listDirectory(remotePath: string): Promise<FileInfo[]> {
    this.ensureConnected();
    const items = await this.sftp!.list(remotePath);
    
    return items.map((item): FileInfo => ({
      name: item.name,
      path: `${remotePath}/${item.name}`.replace(/\/+/g, "/"),
      type: item.type === "d" ? "directory" : item.type === "l" ? "link" : item.type === "-" ? "file" : "unknown",
      size: item.size,
      modifyTime: item.modifyTime,
      accessTime: item.accessTime,
      rights: item.rights,
      owner: item.owner,
      group: item.group,
    })).sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === "directory") return -1;
        if (b.type === "directory") return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async stat(remotePath: string): Promise<{ isDirectory: boolean; size: number }> {
    this.ensureConnected();
    const stat = await this.sftp!.stat(remotePath);
    return {
      isDirectory: stat.isDirectory,
      size: stat.size,
    };
  }

  async exists(remotePath: string): Promise<boolean | string> {
    this.ensureConnected();
    return this.sftp!.exists(remotePath);
  }

  async upload(
    localData: Buffer,
    remotePath: string,
    options?: {
      userId?: string;
      fileName?: string;
      onProgress?: TransferProgressCallback;
    }
  ): Promise<SFTPTransfer | null> {
    this.ensureConnected();
    
    const totalBytes = localData.length;
    let transfer: SFTPTransfer | null = null;

    try {
      if (options?.userId) {
        const [created] = await db.insert(sftpTransfers).values({
          connectionId: this.config?.connectionId ? this.config.connectionId as any : null,
          direction: "upload",
          localPath: options.fileName || "memory",
          remotePath,
          status: "in_progress",
          size: totalBytes,
          bytesTransferred: 0,
          startedAt: new Date(),
          createdBy: options.userId as any,
        }).returning();
        transfer = created;
      }

      await this.sftp!.put(localData, remotePath);

      if (transfer) {
        const [updated] = await db.update(sftpTransfers)
          .set({
            status: "completed",
            progress: "100.00",
            bytesTransferred: totalBytes,
            completedAt: new Date(),
          })
          .where(eq(sftpTransfers.id, transfer.id))
          .returning();
        transfer = updated;
      }

      return transfer;
    } catch (error: any) {
      if (transfer) {
        await db.update(sftpTransfers)
          .set({
            status: "failed",
            errorMessage: error.message,
            completedAt: new Date(),
          })
          .where(eq(sftpTransfers.id, transfer.id));
      }
      throw error;
    }
  }

  async download(
    remotePath: string,
    options?: {
      userId?: string;
      onProgress?: TransferProgressCallback;
    }
  ): Promise<{ data: Buffer; transfer: SFTPTransfer | null }> {
    this.ensureConnected();
    
    const stat = await this.sftp!.stat(remotePath);
    const totalBytes = stat.size;
    let transfer: SFTPTransfer | null = null;

    try {
      if (options?.userId) {
        const [created] = await db.insert(sftpTransfers).values({
          connectionId: this.config?.connectionId ? this.config.connectionId as any : null,
          direction: "download",
          localPath: "memory",
          remotePath,
          status: "in_progress",
          size: totalBytes,
          bytesTransferred: 0,
          startedAt: new Date(),
          createdBy: options.userId as any,
        }).returning();
        transfer = created;
      }

      const content = await this.sftp!.get(remotePath);
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content as string);

      if (transfer) {
        const [updated] = await db.update(sftpTransfers)
          .set({
            status: "completed",
            progress: "100.00",
            bytesTransferred: buffer.length,
            completedAt: new Date(),
          })
          .where(eq(sftpTransfers.id, transfer.id))
          .returning();
        transfer = updated;
      }

      return { data: buffer, transfer };
    } catch (error: any) {
      if (transfer) {
        await db.update(sftpTransfers)
          .set({
            status: "failed",
            errorMessage: error.message,
            completedAt: new Date(),
          })
          .where(eq(sftpTransfers.id, transfer.id));
      }
      throw error;
    }
  }

  async delete(remotePath: string): Promise<void> {
    this.ensureConnected();
    const stat = await this.sftp!.stat(remotePath);
    
    if (stat.isDirectory) {
      await this.sftp!.rmdir(remotePath, true);
    } else {
      await this.sftp!.delete(remotePath);
    }
  }

  async mkdir(remotePath: string, recursive = true): Promise<void> {
    this.ensureConnected();
    await this.sftp!.mkdir(remotePath, recursive);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureConnected();
    await this.sftp!.rename(oldPath, newPath);
  }

  async getTransferHistory(limit = 50): Promise<SFTPTransfer[]> {
    return db.select()
      .from(sftpTransfers)
      .orderBy(desc(sftpTransfers.createdAt))
      .limit(limit);
  }

  async getTransfersByUser(userId: string, limit = 50): Promise<SFTPTransfer[]> {
    return db.select()
      .from(sftpTransfers)
      .where(eq(sftpTransfers.createdBy, userId as any))
      .orderBy(desc(sftpTransfers.createdAt))
      .limit(limit);
  }
}

export async function withSFTPConnection<T>(
  config: SFTPConnectionConfig,
  operation: (sftp: SFTPService) => Promise<T>
): Promise<T> {
  const sftp = new SFTPService();
  try {
    await sftp.connect(config);
    return await operation(sftp);
  } finally {
    await sftp.disconnect();
  }
}

export const sftpService = new SFTPService();
