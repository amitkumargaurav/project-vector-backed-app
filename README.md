# Project Vector Backend

Phase 0 NestJS backend for the local-first Vector client.

## Implemented Scope

- Google auth, JWT access tokens, refresh sessions, logout, and `/auth/me`
- Profile, privacy settings, notification settings, and device registration
- Goals and `GoalTrack` sub-goal/area model with one active goal guard
- Task CRUD and lifecycle actions: start, complete, skip, reschedule, undo
- Raw `ProgressEvent` capture and batch event ingestion
- Local-first sync: bootstrap, change-log pull, idempotent push, sync status
- Calendar, history date/range, selected-date context window, append-only past notes/reviews
- Analytics dashboard, consistency, probability, risk, time usage, daily/weekly/monthly graph rows
- Roadmap versioning and plan-adjustment accept/reject flow
- Daily, weekly, and monthly reviews
- Notification preferences/log records and direct FCM send hook
- AI suggestion records with backend validation boundary; no direct AI mutations
- Privacy export, account-delete request/confirm, goal delete, data-sharing preferences
- Inline background-task boundary for recalculation, probability, notifications, and AI jobs
- Minimal subscription status endpoint for feature gating defaults

Payment creation, verification, cancellation, payment tables, and payment webhooks are intentionally deferred.

## Configuration

Runtime config is split into `.env.development` and `.env.production`.
Both files are ignored by Git, along with every `.env*` file, so API keys and secrets stay local.

For local development, edit `.env.development`.
For production, set `NODE_ENV=production` and provide `.env.production` on the server.

Google sign-in accepts ID tokens whose `aud` claim matches the configured OAuth client ID. Set
`GOOGLE_CLIENT_ID` for a single web client, or set `GOOGLE_CLIENT_IDS` to a comma-separated list when
the app has separate web, Android, or iOS OAuth clients. `GOOGLE_CLIENT_ID` is still accepted and can
be used together with `GOOGLE_CLIENT_IDS`.

Google login expects a Google ID token, not a Google access token or auth code:

```http
POST /api/auth/google
Content-Type: application/json

{ "idToken": "<google-id-token>" }
```

The response contains this backend's `accessToken` and `refreshToken`. Use the backend `accessToken`,
not the original Google token, for protected endpoints:

```http
GET /api/auth/me
Authorization: Bearer <backend-access-token>
```

Access tokens expire after `24h` by default. Refresh tokens expire after `30d`.

If `/api/auth/google` returns `401`, decode the Google ID token payload and compare its `aud` claim
with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_IDS`. After changing any `.env` value, restart the dev server.

## Development

Use Node 24 before installing or running commands.

If `nvm` is not installed, install it first:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
```

Then install and activate the project Node version:

```bash
nvm install
nvm use
node -v
npm -v
```

Expected major versions are Node `24.x` and npm `11.x`.

Install dependencies:

```bash
npm install
```

## Local Database

Prisma migration and app startup require PostgreSQL.

The default local credentials in `.env.development` are:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/vector?schema=public
```

Recommended Docker setup:

```bash
docker compose -f docker-compose.dev.yml up -d
npm run prisma:migrate
```

If Docker needs sudo on your machine:

```bash
`sudo docker compose -f docker-compose.dev.yml up -d`
```

Native PostgreSQL alternative:

```bash
sudo -u postgres psql
```

Then run inside `psql`:

```sql
ALTER USER postgres WITH PASSWORD 'postgres';
CREATE DATABASE vector OWNER postgres;
\q
```

If your machine already uses port `5432`, the included Docker setup maps Postgres to host port `5433`.

## Run Dev Server

```bash
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

The dev server runs on port `3000` by default.

Local URLs:

```text
API base: http://localhost:3000/api
Swagger:  http://localhost:3000/docs
```

## Validation

```bash
npm run prisma:generate
npm run build
```
