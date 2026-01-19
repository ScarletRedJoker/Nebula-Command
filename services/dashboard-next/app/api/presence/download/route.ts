import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, accessSync, constants } from 'fs';

const FALLBACK_DIR = "/app/data";
const PRIMARY_DIR = "/opt/homelab/studio-projects";

function getDataDir(): string {
  if (process.env.STUDIO_PROJECTS_DIR) {
    return process.env.STUDIO_PROJECTS_DIR;
  }
  if (process.env.REPL_ID) {
    return "./data/studio-projects";
  }
  try {
    if (existsSync(PRIMARY_DIR)) {
      accessSync(PRIMARY_DIR, constants.W_OK);
      return PRIMARY_DIR;
    }
  } catch {
  }
  return FALLBACK_DIR;
}

const SETTINGS_FILE = "presence-settings.json";

interface UserSettings {
  discordAppId: string;
  enabled: boolean;
  updatedAt: string;
  presenceApiKey?: string;
}

interface PresenceSettings {
  [userId: string]: UserSettings;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'npk_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function loadSettings(): Promise<PresenceSettings> {
  const dir = getDataDir();
  const filePath = path.join(dir, SETTINGS_FILE);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveSettings(data: PresenceSettings): Promise<void> {
  const dir = getDataDir();
  const filePath = path.join(dir, SETTINGS_FILE);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[Presence Settings] Failed to save:', error);
  }
}

const DASHBOARD_URL = process.env.DASHBOARD_PUBLIC_URL || 'https://dash.evindrake.net';

const NEBULA_PRESENCE_JS = `#!/usr/bin/env node
/**
 * Nebula Command - Discord Rich Presence Daemon
 * 
 * Polls the Nebula Command dashboard API and updates your Discord profile
 * with what you're currently watching on Plex/Jellyfin.
 * 
 * Run once, forget about it - your presence updates automatically!
 */

require('dotenv').config();
const RPC = require('discord-rpc');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.evindrake.net';
const API_KEY = process.env.PRESENCE_API_KEY || '';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '15000');

if (!DISCORD_CLIENT_ID) {
  console.error('ERROR: DISCORD_CLIENT_ID is required');
  console.error('Create an app at: https://discord.com/developers/applications');
  console.error('Copy the Application ID and add it to your .env file');
  process.exit(1);
}

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║     NEBULA COMMAND - Discord Rich Presence Daemon     ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');
console.log(\`Dashboard URL: \${DASHBOARD_URL}\`);
console.log(\`Poll Interval: \${POLL_INTERVAL}ms\`);
console.log('');

const rpc = new RPC.Client({ transport: 'ipc' });
let currentActivityKey = null;
let consecutiveErrors = 0;

async function fetchCurrentMedia() {
  try {
    const headers = { 'Accept': 'application/json' };
    if (API_KEY) {
      headers['Authorization'] = \`Bearer \${API_KEY}\`;
    }
    
    const response = await fetch(\`\${DASHBOARD_URL}/api/presence/current\`, { headers });
    
    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}\`);
    }
    
    consecutiveErrors = 0;
    return await response.json();
  } catch (error) {
    consecutiveErrors++;
    if (consecutiveErrors <= 3 || consecutiveErrors % 10 === 0) {
      console.error(\`[\${new Date().toLocaleTimeString()}] API Error (\${consecutiveErrors}x): \${error.message}\`);
    }
    return null;
  }
}

function getStateEmoji(type) {
  switch (type) {
    case 'movie': return '🎬';
    case 'episode': return '📺';
    case 'track': return '🎵';
    default: return '▶️';
  }
}

async function updatePresence() {
  const data = await fetchCurrentMedia();
  
  if (!data || !data.active || data.sessions.length === 0) {
    if (currentActivityKey !== null) {
      rpc.clearActivity();
      currentActivityKey = null;
      console.log(\`[\${new Date().toLocaleTimeString()}] Cleared presence - nothing playing\`);
    }
    return;
  }
  
  const session = data.sessions[0];
  const stateEmoji = session.state === 'paused' ? '⏸️' : '▶️';
  const sourceEmoji = session.source === 'plex' ? '🟠' : '🟣';
  const typeEmoji = getStateEmoji(session.type);
  
  let details = session.title;
  let state = '';
  
  switch (session.type) {
    case 'episode':
      if (session.showName) {
        details = session.showName;
        state = \`\${session.seasonEpisode ? session.seasonEpisode + ' - ' : ''}\${session.title}\`;
      }
      break;
    case 'track':
      if (session.artistAlbum) {
        state = session.artistAlbum;
      }
      break;
    case 'movie':
      if (session.year) {
        state = \`\${typeEmoji} Movie (\${session.year})\`;
      } else {
        state = \`\${typeEmoji} Movie\`;
      }
      break;
    default:
      state = \`\${stateEmoji} \${session.source === 'plex' ? 'Plex' : 'Jellyfin'}\`;
  }
  
  if (!state) {
    state = \`\${stateEmoji} \${session.state === 'paused' ? 'Paused' : 'Playing'}\`;
  }
  
  const activity = {
    details: details.substring(0, 128),
    state: state.substring(0, 128),
    instance: false
  };
  
  if (session.progress && session.duration && session.state !== 'paused') {
    activity.startTimestamp = Date.now() - session.progress;
    activity.endTimestamp = Date.now() - session.progress + session.duration;
  }
  
  if (process.env.USE_CUSTOM_ASSETS === 'true') {
    activity.largeImageKey = session.source === 'plex' ? 'plex_logo' : 'jellyfin_logo';
    activity.largeImageText = session.source === 'plex' ? 'Plex' : 'Jellyfin';
    activity.smallImageKey = session.state === 'paused' ? 'paused' : 'playing';
    activity.smallImageText = session.state === 'paused' ? 'Paused' : 'Playing';
  }
  
  const activityKey = JSON.stringify({ 
    title: session.title, 
    source: session.source, 
    state: session.state,
    type: session.type
  });
  
  if (currentActivityKey !== activityKey) {
    rpc.setActivity(activity);
    currentActivityKey = activityKey;
    
    const progressPct = session.duration > 0 
      ? Math.round((session.progress / session.duration) * 100) 
      : 0;
    
    console.log(\`[\${new Date().toLocaleTimeString()}] \${sourceEmoji} \${stateEmoji} \${details}\`);
    if (session.showName || session.artistAlbum) {
      console.log(\`    └─ \${state}\`);
    }
    console.log(\`    └─ Progress: \${progressPct}%\`);
  }
}

rpc.on('ready', () => {
  console.log('✅ Connected to Discord!');
  console.log(\`   Logged in as: \${rpc.user.username}#\${rpc.user.discriminator}\`);
  console.log('');
  console.log('Watching for media activity...');
  console.log('Press Ctrl+C to stop');
  console.log('');
  
  updatePresence();
  setInterval(updatePresence, POLL_INTERVAL);
});

rpc.on('disconnected', () => {
  console.log('❌ Disconnected from Discord. Attempting reconnect...');
  setTimeout(() => {
    rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(console.error);
  }, 5000);
});

console.log('Connecting to Discord...');
rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(error => {
  console.error('');
  console.error('❌ Failed to connect to Discord:', error.message);
  console.error('');
  console.error('Troubleshooting:');
  console.error('1. Make sure Discord desktop app is running');
  console.error('2. Check that your DISCORD_CLIENT_ID is correct');
  console.error('3. Try restarting Discord');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down...');
  rpc.clearActivity();
  rpc.destroy();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught error:', error.message);
});
`;

const PACKAGE_JSON = `{
  "name": "nebula-discord-presence",
  "version": "2.0.0",
  "description": "Show Plex/Jellyfin now playing on your Discord profile via Nebula Command",
  "main": "nebula-presence.js",
  "scripts": {
    "start": "node nebula-presence.js"
  },
  "dependencies": {
    "discord-rpc": "^4.0.1",
    "dotenv": "^16.3.1"
  }
}
`;

const INSTALL_BAT = `@echo off
echo ========================================
echo   Nebula Discord Presence - Installer
echo ========================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Installation complete!
echo ========================================
echo.
echo Starting Nebula Discord Presence...
echo Press Ctrl+C to stop
echo.
npm start
pause
`;

const INSTALL_SH = `#!/bin/bash
echo "========================================"
echo "  Nebula Discord Presence - Installer"
echo "========================================"
echo

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

echo
echo "========================================"
echo "  Installation complete!"
echo "========================================"
echo
echo "Starting Nebula Discord Presence..."
echo "Press Ctrl+C to stop"
echo
npm start
`;

const README_TXT = `====================================================
   NEBULA COMMAND - Discord Rich Presence Daemon
====================================================

This daemon shows what you're watching on Plex/Jellyfin
directly on your Discord profile!

QUICK START
-----------
1. Make sure Node.js is installed (https://nodejs.org)
2. Make sure Discord desktop app is running
3. Run the installer:
   - Windows: Double-click install.bat
   - Mac/Linux: Run ./install.sh

The daemon will start automatically and update your
Discord presence whenever you watch something!

TROUBLESHOOTING
---------------
- Discord must be running on your computer
- Make sure you created a Discord Application at:
  https://discord.com/developers/applications
- Your Application ID should match DISCORD_CLIENT_ID in .env

FILES
-----
- nebula-presence.js  - The main daemon script
- .env                - Your configuration (pre-filled)
- package.json        - Node.js dependencies
- install.bat         - Windows installer
- install.sh          - Mac/Linux installer

RUNNING IN BACKGROUND
---------------------
Windows: Use Task Scheduler or create a startup shortcut
Mac: Use launchd or add to Login Items
Linux: Use systemd or add to ~/.profile

Need help? Check the dashboard for more info!
`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const settings = await loadSettings();
    let userSettings = settings[userId];
    
    if (!userSettings || !userSettings.discordAppId) {
      return NextResponse.json({
        error: 'Please save your Discord Application ID first'
      }, { status: 400 });
    }
    
    if (!userSettings.presenceApiKey) {
      userSettings.presenceApiKey = generateApiKey();
      settings[userId] = userSettings;
      await saveSettings(settings);
    }
    
    const zip = new JSZip();
    
    zip.file('nebula-presence.js', NEBULA_PRESENCE_JS);
    zip.file('package.json', PACKAGE_JSON);
    
    const envContent = `# Nebula Command - Discord Rich Presence Configuration
# Generated: ${new Date().toISOString()}

# Dashboard URL - where to fetch media status
DASHBOARD_URL=${DASHBOARD_URL}

# Your unique API key for authentication
PRESENCE_API_KEY=${userSettings.presenceApiKey}

# Your Discord Application ID
DISCORD_CLIENT_ID=${userSettings.discordAppId}

# How often to check for media updates (in milliseconds)
POLL_INTERVAL=15000

# Set to 'true' if you've uploaded custom assets to your Discord app
USE_CUSTOM_ASSETS=false
`;
    zip.file('.env', envContent);
    
    zip.file('install.bat', INSTALL_BAT);
    zip.file('install.sh', INSTALL_SH);
    zip.file('README.txt', README_TXT);
    
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    
    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="nebula-discord-presence.zip"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Presence Download] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate installer' 
    }, { status: 500 });
  }
}
