import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync } from "fs";
import { getServerById, getAllServers, getDefaultSshKeyPath } from "@/lib/server-config-store";

function escapeShellArg(arg: string): string {
  if (!arg) return "''";
  if (!/[^a-zA-Z0-9_\-./:@]/.test(arg)) {
    return arg;
  }
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

function validateIpmiInput(value: string, fieldName: string): boolean {
  if (!value) return true;
  if (value.length > 255) {
    throw new Error(`${fieldName} exceeds maximum length`);
  }
  if (/[\x00-\x1f]/.test(value)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  return true;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

async function executeSSHCommand(
  host: string,
  user: string,
  keyPath: string,
  command: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!existsSync(keyPath)) {
      resolve({ success: false, error: "SSH key not found" });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "Connection timeout" });
    }, 30000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        let output = "";
        let errorOutput = "";

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          if (code === 0) {
            resolve({ success: true, output: output.trim() });
          } else {
            resolve({
              success: false,
              output: output.trim(),
              error: errorOutput.trim() || `Command exited with code ${code}`,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 30000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    }
  });
}

function parseIpmiSensors(output: string): any[] {
  const sensors: any[] = [];
  const lines = output.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 3) {
      const [name, value, unit, status] = parts;
      sensors.push({
        name,
        value: value || "N/A",
        unit: unit || "",
        status: status || "ok",
      });
    }
  }

  return sensors;
}

function parsePowerStatus(output: string): string {
  const lower = output.toLowerCase();
  if (lower.includes("on")) return "on";
  if (lower.includes("off")) return "off";
  return "unknown";
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = request.nextUrl.searchParams.get("serverId");

  if (!serverId) {
    const allServers = await getAllServers();
    const servers = allServers.filter((s) => s.ipmiHost);
    return NextResponse.json({
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        hasIpmi: !!s.ipmiHost,
        hasVnc: !!s.vncHost || !!s.noVncUrl,
      })),
    });
  }

  const server = await getServerById(serverId);
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  if (!server.ipmiHost) {
    return NextResponse.json(
      { error: "IPMI not configured for this server" },
      { status: 400 }
    );
  }

  const managementServer = await getServerById(server.ipmiManagementServer || "home");
  if (!managementServer) {
    return NextResponse.json(
      { error: "Management server not found" },
      { status: 500 }
    );
  }

  const ipmiUser = server.ipmiUser || "admin";
  const ipmiPass = server.ipmiPassword || process.env.IPMI_PASSWORD || "";
  const mgmtKeyPath = managementServer.keyPath || getDefaultSshKeyPath();

  try {
    validateIpmiInput(server.ipmiHost, "IPMI host");
    validateIpmiInput(ipmiUser, "IPMI user");
    validateIpmiInput(ipmiPass, "IPMI password");

    const safeHost = escapeShellArg(server.ipmiHost);
    const safeUser = escapeShellArg(ipmiUser);
    const safePass = escapeShellArg(ipmiPass);

    const powerCmd = `ipmitool -I lanplus -H ${safeHost} -U ${safeUser} -P ${safePass} power status`;
    const powerResult = await executeSSHCommand(
      managementServer.host,
      managementServer.user,
      mgmtKeyPath,
      powerCmd
    );

    const sensorsCmd = `ipmitool -I lanplus -H ${safeHost} -U ${safeUser} -P ${safePass} sensor list 2>/dev/null | head -50`;
    const sensorsResult = await executeSSHCommand(
      managementServer.host,
      managementServer.user,
      mgmtKeyPath,
      sensorsCmd
    );

    const powerState = powerResult.success
      ? parsePowerStatus(powerResult.output || "")
      : "unknown";
    const sensors = sensorsResult.success
      ? parseIpmiSensors(sensorsResult.output || "")
      : [];

    return NextResponse.json({
      serverId: server.id,
      serverName: server.name,
      ipmiHost: server.ipmiHost,
      powerState,
      sensors,
      lastUpdated: new Date().toISOString(),
      errors: {
        power: powerResult.error,
        sensors: sensorsResult.error,
      },
    });
  } catch (error: any) {
    console.error("IPMI status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get IPMI status" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { serverId, command } = body;

    if (!serverId || !command) {
      return NextResponse.json(
        { error: "Missing serverId or command" },
        { status: 400 }
      );
    }

    const validCommands = ["power on", "power off", "power reset", "power cycle", "power status", "sol activate"];
    if (!validCommands.includes(command)) {
      return NextResponse.json(
        { error: `Invalid command. Valid commands: ${validCommands.join(", ")}` },
        { status: 400 }
      );
    }

    const server = await getServerById(serverId);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!server.ipmiHost) {
      return NextResponse.json(
        { error: "IPMI not configured for this server" },
        { status: 400 }
      );
    }

    const managementServer = await getServerById(server.ipmiManagementServer || "home");
    if (!managementServer) {
      return NextResponse.json(
        { error: "Management server not found" },
        { status: 500 }
      );
    }

    const ipmiUser = server.ipmiUser || "admin";
    const ipmiPass = server.ipmiPassword || process.env.IPMI_PASSWORD || "";
    const mgmtKeyPath = managementServer.keyPath || getDefaultSshKeyPath();

    validateIpmiInput(server.ipmiHost, "IPMI host");
    validateIpmiInput(ipmiUser, "IPMI user");
    validateIpmiInput(ipmiPass, "IPMI password");

    const safeHost = escapeShellArg(server.ipmiHost);
    const safeUser = escapeShellArg(ipmiUser);
    const safePass = escapeShellArg(ipmiPass);

    const ipmiCmd = `ipmitool -I lanplus -H ${safeHost} -U ${safeUser} -P ${safePass} ${command}`;
    const result = await executeSSHCommand(
      managementServer.host,
      managementServer.user,
      mgmtKeyPath,
      ipmiCmd
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `IPMI command '${command}' sent to ${server.name}`,
        output: result.output,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "IPMI command failed",
          output: result.output,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("IPMI command error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
