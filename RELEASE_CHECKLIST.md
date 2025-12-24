# Public Release Checklist

## Security
- [x] No hardcoded secrets, API keys, or credentials in code
- [x] .gitignore covers all .env files, backups, and sensitive directories
- [x] .env.example templates created for all services
- [x] Auth flows properly gated (dev bypasses require NODE_ENV=development)
- [x] Production requires SESSION_SECRET or exits
- [x] npm audit - only moderate dev-dependency issues remain (esbuild)

## Code Quality
- [x] No tracked backup files (oauth-*.ts.backup removed)
- [x] attached_assets/ directory ignored
- [x] Logs directories ignored
- [ ] README.md with setup instructions
- [ ] CONTRIBUTING.md with development guidelines
- [ ] LICENSE file

## Git Repository
- [ ] All environments synced to origin/main
- [ ] Run on each server: `git fetch --all && git reset --hard origin/main`
- [ ] Tag release version (e.g., v1.0.0)
- [ ] Remove any remaining sensitive files from history

## Environment Templates
- [x] services/discord-bot/.env.example
- [x] services/stream-bot/.env.example
- [x] services/dashboard/.env.example

## Documentation
- [x] replit.md updated with current architecture
- [x] KVM gaming setup documented (Sunshine/Moonlight)
- [x] Tailscale subnet routing documented
- [x] Storage options documented (disk passthrough, NAS, SMB, virtio-fs)

## Pre-Release Testing
- [ ] Fresh clone and setup works
- [ ] All three services start successfully
- [ ] Database migrations run cleanly
- [ ] OAuth flows work (Discord, Twitch, YouTube, Spotify)

## Services Status
- Dashboard: Flask/Python on port 5000
- Discord Bot: Node.js with discord.js
- Stream Bot: Node.js with Vite frontend

## Deployment
- Linode: ssh root@linode.evindrake.net → deploy/linode/deploy.sh
- Local: ssh evin@host.evindrake.net → deploy/local/deploy.sh
