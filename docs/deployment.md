# Deploying Athena

Athena deploys as one Next.js app plus MongoDB. The API (`apps/api`, Express) is served from the dashboard's `src/pages/api/[...path].ts`, so the UI and API share one origin and one deployment.

## 1. MongoDB

Create a MongoDB Atlas cluster (or any MongoDB 6+) and copy the connection string into `MONGODB_URI`. Vercel has no fixed outgoing IP, so add `0.0.0.0/0` to the Atlas IP access list and use a long random database password.

## 2. Vercel

1. Import the repository. Set **Root Directory** to `apps/dashboard` and keep "Include files outside the root directory" on. The framework is detected as Next.js; the build script compiles the workspace packages before `next build`.
2. Environment variables (Production):
   - `MONGODB_URI`
   - `JWT_SECRET`, `ENCRYPTION_KEY`, `WEBHOOK_SIGNING_SECRET`, `CRON_SECRET`: 32+ random characters each (`openssl rand -hex 32`). A short `JWT_SECRET` or `ENCRYPTION_KEY` makes the API answer every request with a configuration error.
   - `GROQ_API_KEY` and/or `ANTHROPIC_API_KEY`
   - `ALLOW_REGISTRATION` (`true` while people need to sign up)
   - Optional: `APP_URL` if you use a custom domain (otherwise the Vercel production domain is used for webhook URLs).
3. Deploy, then open `https://<app>/api/health`. It should report `"database": true`.

### How long work runs on Vercel

Vercel functions stop after at most 300 seconds (Hobby). Athena checkpoints every run in MongoDB after each model turn and tool call:

- A run that needs more time hands over to a fresh invocation (`/api/internal/runs/:id/continue`, signed) after `RUN_SLICE_SECONDS` (default 200).
- A run waiting for approval uses no function at all. The decision resumes it.
- Live updates use polling (`/api/realtime`), not WebSockets.
- Maintenance (scheduled workflows, expired approvals, runs whose invocation died) runs at most once a minute while anyone has the dashboard open, and from `/api/internal/cron/tick`. `apps/dashboard/vercel.json` calls the tick daily, which is the most Hobby allows. For the 15-minute health check schedule without the dashboard open, use Vercel Pro (change the cron to `*/5 * * * *`) or a free external cron (e.g. cron-job.org) calling `GET https://<app>/api/internal/cron/tick` with header `Authorization: Bearer <CRON_SECRET>`.
- OpsGuard log search reads files on the server, which Vercel does not have; leave `OPSGUARD_LOG_FILES` empty there.

## 3. Long-lived server (optional)

`npm run start:api` still runs the API as a plain Node server (port 3001) with a one-minute maintenance timer, for container hosts such as Railway. The dashboard in this repo always serves the API itself, so only use this if you deploy the API separately.

## 4. Connections and webhooks

Users connect Bachs, GitHub, Slack and their monitored services themselves under **Build > Connections**. The server needs:

- `ENCRYPTION_KEY`: 32+ random characters (`openssl rand -hex 32`). The API refuses to start in production without it. Changing it later makes stored credentials unreadable, and users have to reconnect.
- `API_URL`: the public API URL, used to build each user's webhook URLs.

Each user gets a personal webhook URL per provider: `https://<api>/api/webhooks/bachs/<token>` and `https://<api>/api/webhooks/github/<token>`. Events run only that user's workflows and are checked with that user's secret. Bachs requires a 2xx within 10 seconds; the API acknowledges immediately and processes asynchronously. The old shared URLs (`/api/webhooks/bachs`, `/api/webhooks/github`) return 410.

## Pre-deploy checklist

- `npm run build` succeeds
- `npm run lint` has no errors
- `JWT_SECRET` and `WEBHOOK_SIGNING_SECRET` are random and not reused from development
- `ENCRYPTION_KEY` is set once and never changed (stored connections depend on it)
- `CRON_SECRET` is set, and a cron calls the tick if you rely on scheduled workflows
- Set `ALLOW_REGISTRATION=false` after creating your accounts if the deployment is public
