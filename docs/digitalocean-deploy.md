# DigitalOcean droplet deployment

This deploys Project Vector Backend to a small DigitalOcean droplet with Docker Compose. PostgreSQL is external; use the existing DigitalOcean managed Postgres cluster, but create a separate database for this app.

## Database target

Use a separate database on the existing cluster:

```text
pathshalax_db   -> Pathshalax
vector_app_db   -> Project Vector Backend
```

Do not point this app at the Pathshalax database/schema.

For a small shared DB cluster, keep the Prisma pool low:

```env
DATABASE_URL=postgresql://vector_app_user:REPLACE_ME@DB_HOST:25060/vector_app_db?schema=public&sslmode=require&connection_limit=3
```

## Droplet prerequisites

Install Docker on the new droplet:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## Configure production env

On your local machine:

```bash
cp .env.production.example .env.production
```

Fill at minimum:

```env
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
GOOGLE_CLIENT_ID=
# or GOOGLE_CLIENT_IDS=
CORS_ORIGINS=
```

Generate secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

## Deploy

From this repo:

```bash
npm run deploy:prod
```

The script defaults to:

```text
DEPLOY_HOST=168.144.69.57
DEPLOY_USER=root
DEPLOY_PORT=22
DEPLOY_TARGET_DIR=/opt/project-vector-backend
DEPLOY_ENV_FILE=.env.production
DEPLOY_SSH_KEY=/home/amit/Documents/project vector/do_sshkey
```

Optional overrides:

```bash
DEPLOY_HOST=<droplet-ip>
DEPLOY_USER=root
DEPLOY_PORT=22
DEPLOY_TARGET_DIR=/opt/project-vector-backend
DEPLOY_ENV_FILE=.env.production
DEPLOY_SYNC_ENV=true
DEPLOY_SSH_KEY=/path/to/private-key
```

The deploy script syncs this repo to the droplet, builds the Docker image, runs `prisma migrate deploy` on container start, starts the app, and checks:

```text
http://127.0.0.1:3000/api/health
```

## Operations

Check logs on the droplet:

```bash
cd /opt/project-vector-backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs app --tail=200
```

Restart:

```bash
cd /opt/project-vector-backend
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
