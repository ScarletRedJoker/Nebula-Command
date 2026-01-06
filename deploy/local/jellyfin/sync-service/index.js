const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const DASHBOARD_URL = process.env.DASHBOARD_URL;
const SYNC_API_KEY = process.env.SYNC_API_KEY;
const COMMUNITY_PATH = '/media/community';
const PORT = 3456;

let nodeInfo = {
  id: null,
  name: process.env.NODE_NAME || 'Local Node',
  storageUsed: 0,
  storageTotal: 0,
  mediaCount: 0,
  online: true,
  lastSeen: new Date().toISOString()
};

function getStorageStats() {
  try {
    const stats = fs.statfsSync(COMMUNITY_PATH);
    nodeInfo.storageTotal = stats.blocks * stats.bsize;
    nodeInfo.storageUsed = (stats.blocks - stats.bfree) * stats.bsize;
  } catch (e) {
    console.log('[Sync] Could not get storage stats:', e.message);
  }
}

function countMedia() {
  try {
    const count = (dir) => {
      let total = 0;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          total += count(path.join(dir, item.name));
        } else if (/\.(mp4|mkv|avi|mov|mp3|flac|jpg|png)$/i.test(item.name)) {
          total++;
        }
      }
      return total;
    };
    nodeInfo.mediaCount = count(COMMUNITY_PATH);
  } catch (e) {
    nodeInfo.mediaCount = 0;
  }
}

function heartbeat() {
  if (!DASHBOARD_URL || !SYNC_API_KEY) {
    console.log('[Sync] No dashboard URL configured, running standalone');
    return;
  }

  getStorageStats();
  countMedia();
  nodeInfo.lastSeen = new Date().toISOString();

  const url = new URL('/api/community/heartbeat', DASHBOARD_URL);
  const data = JSON.stringify(nodeInfo);

  const req = https.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SYNC_API_KEY}`,
      'Content-Length': data.length
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const response = JSON.parse(body);
          if (response.nodeId) nodeInfo.id = response.nodeId;
          console.log('[Sync] Heartbeat sent, node ID:', nodeInfo.id);
        } catch (e) {}
      }
    });
  });

  req.on('error', (e) => {
    console.log('[Sync] Heartbeat failed:', e.message);
  });

  req.write(data);
  req.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', ...nodeInfo }));
    return;
  }

  if (req.url === '/media' && req.method === 'GET') {
    try {
      const listMedia = (dir, base = '') => {
        const results = [];
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = path.join(base, item.name);
          if (item.isDirectory()) {
            results.push(...listMedia(fullPath, relativePath));
          } else if (/\.(mp4|mkv|avi|mov)$/i.test(item.name)) {
            const stat = fs.statSync(fullPath);
            results.push({
              path: relativePath,
              size: stat.size,
              modified: stat.mtime.toISOString()
            });
          }
        }
        return results;
      };
      const media = listMedia(COMMUNITY_PATH);
      res.writeHead(200);
      res.end(JSON.stringify({ media }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Sync] Media sync service running on port ${PORT}`);
  console.log(`[Sync] Jellyfin URL: ${JELLYFIN_URL}`);
  console.log(`[Sync] Community path: ${COMMUNITY_PATH}`);
  
  getStorageStats();
  countMedia();
  console.log(`[Sync] Storage: ${(nodeInfo.storageUsed / 1e9).toFixed(1)}GB / ${(nodeInfo.storageTotal / 1e9).toFixed(1)}GB`);
  console.log(`[Sync] Media files: ${nodeInfo.mediaCount}`);

  heartbeat();
  setInterval(heartbeat, 60000);
});
