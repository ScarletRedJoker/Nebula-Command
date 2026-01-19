# Google OAuth Setup Runbook

## Overview
This runbook covers configuring Google OAuth for `dash.evindrake.net` and other domains in the HomeLabHub project.

---

## Quick Reference

### Current OAuth Redirect URIs Needed
```
https://dash.evindrake.net/api/auth/callback/google
https://dash.evindrake.net/api/auth/login
http://localhost:5000/api/auth/callback/google  (development)
```

---

## Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Navigate to **APIs & Services** → **Credentials**

---

## Step 2: Configure OAuth Consent Screen

If not already configured:

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (unless you have Google Workspace)
3. Fill in required fields:
   - **App name**: `HomeLabHub Dashboard`
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
5. Add test users (if in testing mode):
   - Add your email addresses

---

## Step 3: Create/Update OAuth Client ID

### Create New OAuth Client
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `HomeLabHub Dashboard`

### Add Authorized Redirect URIs

Add ALL of these URIs:

```
# Production
https://dash.evindrake.net/api/auth/callback/google
https://dash.evindrake.net/api/auth/login
https://evindrake.net/api/auth/callback/google

# Development (Replit)
https://<your-repl-name>.<username>.repl.co/api/auth/callback/google

# Local Development
http://localhost:5000/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

### Add Authorized JavaScript Origins

```
https://dash.evindrake.net
https://evindrake.net
http://localhost:5000
http://localhost:3000
```

5. Click **CREATE**
6. Copy the **Client ID** and **Client Secret**

---

## Step 4: Configure Environment Variables

### Required Environment Variables

```bash
# Google OAuth credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Application URL (for callback)
NEXTAUTH_URL=https://dash.evindrake.net
NEXT_PUBLIC_APP_URL=https://dash.evindrake.net

# NextAuth secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-random-secret-here
```

### Set in Replit Secrets

1. Go to your Replit project
2. Click **Tools** → **Secrets**
3. Add each variable:

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxx` |
| `NEXTAUTH_URL` | `https://dash.evindrake.net` |
| `NEXTAUTH_SECRET` | (generate with `openssl rand -base64 32`) |

### Set on Production Server

```bash
# SSH to Linode
ssh root@linode.evindrake.net

# Edit environment file
nano /opt/homelab/HomeLabHub/services/dashboard-next/.env.local

# Add:
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=https://dash.evindrake.net
NEXTAUTH_SECRET=your-secret

# Restart the service
pm2 restart dashboard-next
```

---

## Step 5: Update Application Code

### Verify NextAuth Configuration

Check `services/dashboard-next/app/api/auth/[...nextauth]/route.ts` or equivalent:

```typescript
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Optional: Restrict to specific emails
      const allowedEmails = ['evin@evindrake.net'];
      return allowedEmails.includes(user.email || '');
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

---

## Step 6: Test OAuth Flow

### Test Locally First

```bash
# Start development server
cd services/dashboard-next
npm run dev

# Open browser
open http://localhost:5000/login
```

### Test Production

1. Open `https://dash.evindrake.net/login`
2. Click "Sign in with Google"
3. Complete Google sign-in
4. Verify redirect back to dashboard

### Debug OAuth Issues

```bash
# Check logs on production
ssh root@linode.evindrake.net
pm2 logs dashboard-next --lines 50

# Look for OAuth errors
pm2 logs dashboard-next | grep -i "oauth\|google\|auth"
```

---

## Verification Checklist

### Google Cloud Console
- [ ] OAuth consent screen configured
- [ ] OAuth client ID created
- [ ] All redirect URIs added
- [ ] JavaScript origins added
- [ ] App is in "production" mode (or test users added)

### Environment Variables
- [ ] `GOOGLE_CLIENT_ID` set
- [ ] `GOOGLE_CLIENT_SECRET` set
- [ ] `NEXTAUTH_URL` set to production URL
- [ ] `NEXTAUTH_SECRET` set (random string)

### Application
- [ ] NextAuth configured with Google provider
- [ ] Login page has Google sign-in button
- [ ] Callback route exists (`/api/auth/callback/google`)

### Testing
- [ ] Local login works
- [ ] Production login works
- [ ] User session persists after refresh
- [ ] Logout works correctly

---

## Troubleshooting

### Error: redirect_uri_mismatch

**Cause**: Callback URL doesn't match Google Console configuration

**Fix**:
1. Check exact URL in error message
2. Add that exact URL to Google Console → Credentials → Edit OAuth Client → Authorized redirect URIs
3. Wait 5 minutes for changes to propagate

### Error: 400 Invalid Request

**Cause**: Missing or invalid client credentials

**Fix**:
```bash
# Verify environment variables are set
echo $GOOGLE_CLIENT_ID
echo $GOOGLE_CLIENT_SECRET

# Check for trailing whitespace or newlines
env | grep GOOGLE
```

### Error: Access Blocked - App not verified

**Cause**: OAuth consent screen not published

**Fix**:
1. Go to OAuth consent screen in Google Console
2. Click "PUBLISH APP" (or add test users)

### Cookies Not Being Set

**Cause**: HTTPS/HTTP mismatch or domain issues

**Fix**:
```bash
# Ensure NEXTAUTH_URL matches actual domain
NEXTAUTH_URL=https://dash.evindrake.net  # Must be HTTPS in production

# Check cookie settings in next-auth
```

### Session Not Persisting

**Cause**: Missing or changing `NEXTAUTH_SECRET`

**Fix**:
```bash
# Generate a stable secret
openssl rand -base64 32

# Use the same secret across all deployments
```

---

## Quick Commands

### Generate NEXTAUTH_SECRET
```bash
openssl rand -base64 32
```

### Check Current OAuth Status
```bash
# Test OAuth endpoint
curl -I https://dash.evindrake.net/api/auth/providers
```

### View Google API Quota
1. Go to Google Cloud Console
2. Navigate to **APIs & Services** → **Dashboard**
3. Check OAuth 2.0 quota

---

## Related Documentation

- [NextAuth.js Google Provider](https://next-auth.js.org/providers/google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
