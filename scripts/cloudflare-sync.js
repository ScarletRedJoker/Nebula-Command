#!/usr/bin/env node
/**
 * Cloudflare DNS Sync Script
 * Automatically creates/updates DNS records based on domains.yml configuration
 * 
 * Usage: CLOUDFLARE_API_TOKEN=xxx DOMAIN=yourdomain.com node cloudflare-sync.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

class CloudflareSync {
  constructor(apiToken) {
    this.apiToken = apiToken;
  }

  async request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${CLOUDFLARE_API}${endpoint}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.success) {
              resolve(json.result);
            } else {
              reject(new Error(json.errors.map(e => e.message).join(', ')));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async getZoneId(zoneName) {
    const zones = await this.request('GET', `/zones?name=${zoneName}`);
    if (zones.length === 0) {
      throw new Error(`Zone ${zoneName} not found`);
    }
    return zones[0].id;
  }

  async getRecords(zoneId) {
    return await this.request('GET', `/zones/${zoneId}/dns_records?per_page=100`);
  }

  async createRecord(zoneId, record) {
    return await this.request('POST', `/zones/${zoneId}/dns_records`, record);
  }

  async updateRecord(zoneId, recordId, record) {
    return await this.request('PUT', `/zones/${zoneId}/dns_records/${recordId}`, record);
  }
}

function getPublicIP() {
  try {
    return execSync('curl -s https://api.ipify.org', { encoding: 'utf8' }).trim();
  } catch {
    try {
      return execSync('curl -s https://ifconfig.me', { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('Could not determine public IP');
    }
  }
}

// Subdomains to create - hardcoded for reliability
const SUBDOMAINS = [
  { name: 'auth', description: 'Authelia SSO' },
  { name: 'plex', description: 'Plex Media Server' },
  { name: 'jellyfin', description: 'Jellyfin Community Sharing' },
  { name: 'home', description: 'Home Assistant' },
  { name: 'dashboard', description: 'Nebula Command Dashboard' },
  { name: 'api', description: 'API/Webhooks' },
  { name: 'torrent', description: 'qBittorrent (protected)' },
  { name: 'storage', description: 'MinIO Console (protected)' },
  { name: 's3', description: 'MinIO S3 API (protected)' },
  { name: 'vnc', description: 'Remote Desktop (protected)' },
  { name: 'ssh', description: 'Web SSH Terminal (protected)' },
  { name: 'vms', description: 'Cockpit VM Manager (protected)' },
  { name: 'gamestream', description: 'Sunshine Game Streaming (protected)' },
];

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const domain = process.env.DOMAIN;

  if (!apiToken) {
    console.error('Error: CLOUDFLARE_API_TOKEN environment variable required');
    process.exit(1);
  }

  if (!domain || domain === 'example.com') {
    console.error('Error: DOMAIN environment variable must be set to your actual domain');
    process.exit(1);
  }

  console.log('Detecting public IP...');
  const serverIP = getPublicIP();
  console.log(`Server IP: ${serverIP}`);

  const cf = new CloudflareSync(apiToken);

  console.log(`Getting zone ID for ${domain}...`);
  const zoneId = await cf.getZoneId(domain);
  console.log(`Zone ID: ${zoneId}`);

  console.log('Fetching existing DNS records...');
  const existingRecords = await cf.getRecords(zoneId);
  const recordMap = {};
  for (const record of existingRecords) {
    recordMap[record.name] = record;
  }

  console.log('\nSyncing DNS records...');
  for (const subdomain of SUBDOMAINS) {
    const fqdn = `${subdomain.name}.${domain}`;
    const existing = recordMap[fqdn];

    const newRecord = {
      type: 'A',
      name: fqdn,
      content: serverIP,
      ttl: 300,
      proxied: true,
    };

    if (existing) {
      if (existing.content !== serverIP || existing.proxied !== newRecord.proxied) {
        console.log(`  Updating ${fqdn} -> ${serverIP}`);
        await cf.updateRecord(zoneId, existing.id, newRecord);
      } else {
        console.log(`  ${fqdn} - OK (no changes)`);
      }
    } else {
      console.log(`  Creating ${fqdn} -> ${serverIP}`);
      await cf.createRecord(zoneId, newRecord);
    }
  }

  console.log('\nDNS sync complete!');
  console.log(`\nAll subdomains now point to ${serverIP}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
