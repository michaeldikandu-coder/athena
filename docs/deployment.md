# Deploying Athena

Athena deploys as three parts: MongoDB, the API (long-running Node process with WebSockets), and the dashboard (Next.js).

## 1. MongoDB

Create a MongoDB Atlas cluster (or any MongoDB 6+) and copy the connection string into `MONGODB_URI`. Indexes are created by Mongoose on startup.

## 2. API (Railway, Render, Fly.io, or any Node host)

The API needs a persistent process because executions, approvals, and WebSockets live in it. Serverless platforms are not suitable. Run one instance.

- Build command: `npm ci && npm run build:backend`
- Start command: `npm run start:api`
- Required environment:
  - `NODE_ENV=production`
  - `MONGODB_URI`
  - `JWT_SECRET` (32+ random characters; startup fails otherwise)
  - `WEBHOOK_SIGNING_SECRET`
  - `API_URL` (public HTTPS URL of the API)
  - `CORS_ORIGINS` (the dashboard origin, e.g. `https://athena.vercel.app`)
  - `ANTHROPIC_API_KEY` and/or `GROQ_API_KEY`
  - Integration settings from `.env.example`
- Health check path: `/api/health`

## 3. Dashboard (Vercel or any Node host)

The dashboard proxies `/api/*` to the API, so the session cookie is first-party and `COOKIE_SAMESITE=lax` works. These variables are read **at build time**, so set them before building:

- `API_INTERNAL_URL` = the API's public URL (e.g. `https://athena-api.up.railway.app`)
- `NEXT_PUBLIC_WS_URL` = `wss://<api host>/ws`

On Vercel, set the project root to `apps/dashboard`, and set the install command to run from the repo root (`cd ../.. && npm ci`).

## 4. Connections and webhooks

Users connect Bachs, GitHub, Slack and their monitored services themselves under **Build > Connections**. The server needs:

- `ENCRYPTION_KEY`: 32+ random characters (`openssl rand -hex 32`). The API refuses to start in production without it. Changing it later makes stored credentials unreadable, and users have to reconnect.
- `API_URL`: the public API URL, used to build each user's webhook URLs.

Each user gets a personal webhook URL per provider: `https://<api>/api/webhooks/bachs/<token>` and `https://<api>/api/webhooks/github/<token>`. Events run only that user's workflows and are checked with that user's secret. Bachs requires a 2xx within 10 seconds; the API acknowledges immediately and processes asynchronously. The old shared URLs (`/api/webhooks/bachs`, `/api/webhooks/github`) return 410.

## Pre-deploy checklist

- `npm run build` succeeds
- `npm run lint` has no errors
- `JWT_SECRET` and `WEBHOOK_SIGNING_SECRET` are random and not reused from development
- `CORS_ORIGINS` matches the dashboard URL exactly (scheme and host)
- Set `ALLOW_REGISTRATION=false` after creating your accounts if the deployment is public
