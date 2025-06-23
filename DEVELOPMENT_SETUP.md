# Development Setup for Docspasta V2

## Quick Fix for QStash Localhost Error

When you see this error:
```
Failed to publish start-crawl job: {"error":"invalid destination url: endpoint resolves to a loopback address: ::1"}
```

This happens because QStash cannot send webhooks to localhost. You need a public URL.

## Solution: Use ngrok

### 1. Install ngrok
```bash
# macOS with Homebrew
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
```

### 2. Start ngrok
```bash
# In a new terminal, expose your local dev server
ngrok http 3000
```

### 3. Copy the HTTPS URL
You'll see output like:
```
Forwarding https://abc123.ngrok-free.app -> http://localhost:3000
```

### 4. Update your .env.development.local
```bash
# Add this line with your ngrok URL
BASE_URL=https://abc123.ngrok-free.app
```

### 5. Restart your dev server
```bash
pnpm dev
```

Now QStash can reach your local development server!

## Alternative: Direct Processing (No QStash)

For quick local testing without ngrok, you can create a development processor that bypasses QStash entirely. This would process jobs synchronously in development mode.

## Vercel Preview Deployments

Another option is to use Vercel preview deployments which provide public URLs automatically:

```bash
vercel --prod=false
```

This gives you a public URL like `https://your-project-abc123.vercel.app` that QStash can access.