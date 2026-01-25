import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { Client } from "ssh2";
import { getSSHPrivateKey } from "@/lib/server-config-store";

export const dynamic = "force-dynamic";

// Home server (Ubuntu) for media downloads - has NAS storage
const HOME_SERVER_HOST = process.env.HOME_SSH_HOST || process.env.HOME_SERVER_HOST || "192.168.0.185";
const HOME_SERVER_USER = process.env.HOME_SSH_USER || process.env.HOME_SERVER_USER || "evin";
// NAS base path on home server (where SMB share is mounted)
const NAS_BASE_PATH = process.env.NAS_BASE_PATH || "/mnt/networkshare";
const HOME_MEDIA_PATH = `${NAS_BASE_PATH}/media`;

// Available NAS directories for downloads
const NAS_DIRECTORIES: Record<string, string> = {
  media: `${NAS_BASE_PATH}/media`,
  music: `${NAS_BASE_PATH}/music`,
  video: `${NAS_BASE_PATH}/video`,
  movies: `${NAS_BASE_PATH}/video/Movies`,
  shows: `${NAS_BASE_PATH}/video/Shows`,
  in: `${NAS_BASE_PATH}/in`,
};

// Windows VM for AI services
const WINDOWS_VM_HOST = process.env.WINDOWS_VM_HOST || "100.118.44.102";
const WINDOWS_VM_USER = process.env.WINDOWS_VM_USER || "Evin";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function executeSSHCommand(
  command: string, 
  target: "home" | "windows" = "home",
  timeoutMs: number = 300000 // 5 min for downloads
): Promise<{ success: boolean; output?: string; error?: string }> {
  const privateKey = getSSHPrivateKey();
  
  if (!privateKey) {
    return { success: false, error: "SSH private key not found" };
  }

  const host = target === "home" ? HOME_SERVER_HOST : WINDOWS_VM_HOST;
  const username = target === "home" ? HOME_SERVER_USER : WINDOWS_VM_USER;

  return new Promise((resolve) => {
    const conn = new Client();
    let output = "";
    let errorOutput = "";

    const timeoutId = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: `SSH command timeout after ${timeoutMs/1000}s` });
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timeoutId);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        stream.on("close", () => {
          clearTimeout(timeoutId);
          conn.end();
          // yt-dlp outputs progress to stderr, so check for actual errors
          const hasError = errorOutput && !errorOutput.includes("[download]") && !errorOutput.includes("[ExtractAudio]");
          if (hasError && !output) {
            resolve({ success: false, error: errorOutput });
          } else {
            resolve({ success: true, output: output || errorOutput });
          }
        });

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr?.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });
      });
    });

    conn.on("error", (err: any) => {
      clearTimeout(timeoutId);
      resolve({ success: false, error: `SSH to ${host}: ${err.message}` });
    });

    conn.connect({
      host,
      username,
      privateKey,
      readyTimeout: 10000,
    });
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { url, type, destination } = body;

    if (!url) {
      return NextResponse.json({ error: "Missing YouTube URL" }, { status: 400 });
    }

    if (!type || !["audio", "video"].includes(type)) {
      return NextResponse.json({ error: "Invalid type. Must be 'audio' or 'video'" }, { status: 400 });
    }

    // Determine destination directory
    const destKey = destination || (type === "audio" ? "music" : "media");
    const destPath = NAS_DIRECTORIES[destKey] || HOME_MEDIA_PATH;

    const timestamp = Date.now();
    const filename = type === "audio" ? `youtube_${timestamp}.flac` : `youtube_${timestamp}.mp4`;
    
    // Download to home server NAS for storage (accessible via SMB)
    const remoteOutputPath = `${destPath}/${filename}`;
    
    // Build yt-dlp command for remote execution
    // First ensure directory exists, then download
    let ytdlpCommand = `mkdir -p "${destPath}" && yt-dlp "${url}"`;
    if (type === "audio") {
      // Use FLAC for lossless audio quality
      ytdlpCommand += ` -x --audio-format flac --audio-quality 0 -o "${remoteOutputPath}"`;
    } else {
      ytdlpCommand += ` -f best -o "${remoteOutputPath}"`;
    }

    console.log(`[YouTube] Downloading to home server: ${remoteOutputPath}`);
    
    // Execute on home server via SSH (where NAS storage is)
    const result = await executeSSHCommand(ytdlpCommand, "home", 600000); // 10 min timeout for large files

    if (!result.success) {
      console.error(`[YouTube] Download failed:`, result.error);
      return NextResponse.json(
        { error: "Download failed", details: result.error },
        { status: 500 }
      );
    }

    console.log(`[YouTube] Download complete: ${filename}`);

    // Build SMB path from destination path
    const smbRelPath = destPath.replace(NAS_BASE_PATH, "");
    const smbPath = `smb://192.168.0.185/networkshare${smbRelPath}/${filename}`;

    return NextResponse.json({
      success: true,
      message: `${type} downloaded successfully to NAS`,
      filename,
      path: remoteOutputPath,
      server: "home",
      smbPath,
      destination: destKey,
      type,
    });
  } catch (error: any) {
    console.error("[YouTube API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "directories") {
      // Return available NAS directories
      return NextResponse.json({
        directories: Object.entries(NAS_DIRECTORIES).map(([key, path]) => ({
          key,
          path,
          smbPath: `smb://192.168.0.185/networkshare${path.replace(NAS_BASE_PATH, "")}`,
        })),
        basePath: NAS_BASE_PATH,
      });
    }

    if (action === "list") {
      // List media files from home server NAS via SSH
      const dir = searchParams.get("dir") || "media";
      const listPath = NAS_DIRECTORIES[dir] || HOME_MEDIA_PATH;
      const listCommand = `ls -la "${listPath}" 2>/dev/null | tail -n +2 | awk '{print $5, $6, $7, $8, $9}'`;
      const result = await executeSSHCommand(listCommand, "home", 10000);
      
      if (!result.success) {
        // Directory might not exist yet
        return NextResponse.json({ files: [], server: "home", path: listPath, directory: dir });
      }

      const filesList = [];
      const lines = (result.output || "").trim().split("\n").filter(Boolean);
      const smbRelPath = listPath.replace(NAS_BASE_PATH, "");
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const size = parseInt(parts[0]) || 0;
          const name = parts.slice(4).join(" ");
          if (name && !name.startsWith(".")) {
            filesList.push({
              name,
              path: `${listPath}/${name}`,
              smbPath: `smb://192.168.0.185/networkshare${smbRelPath}/${name}`,
              size,
              type: (name.endsWith(".flac") || name.endsWith(".mp3")) ? "audio" : name.endsWith(".mp4") ? "video" : "other",
            });
          }
        }
      }

      return NextResponse.json({ files: filesList, server: "home", path: listPath, directory: dir });
    }

    return NextResponse.json({ error: "Invalid action. Use 'list' or 'directories'" }, { status: 400 });
  } catch (error: any) {
    console.error("[YouTube API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

