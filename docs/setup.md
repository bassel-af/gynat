# Gynat — Setup Guide (Clean Machine)

This guide walks through setting up Gynat from scratch on a new machine or server.

## Prerequisites

- **Node.js** 20+
- **pnpm** 10.28.0: `npm install -g pnpm@10.28.0`
- **Docker** + **Docker Compose**

---

## Step 1: Clone & Install

```bash
git clone <repo-url>
cd gynat
pnpm install
```

---

## Step 2: Configure Environment Files

### `docker/.env` (Docker secrets)

Copy from an existing machine or create it. Required variables:

```env
POSTGRES_PASSWORD=your-db-password
JWT_SECRET=your-jwt-secret-at-least-32-chars
ANON_KEY=your-anon-jwt-token
SERVICE_ROLE_KEY=your-service-role-jwt-token
PG_META_CRYPTO_KEY=your-32-char-encryption-key
API_EXTERNAL_URL=http://localhost:8000
GOTRUE_SITE_URL=http://localhost:3000
GOOGLE_OAUTH_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=Gynat
SMTP_SENDER_EMAIL=noreply@gynat.com
```

The `ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with `JWT_SECRET`. They can be generated via the Supabase CLI or any JWT tool using the HS256 algorithm with the appropriate role claim.

### `.env.local` (Next.js app secrets)

```bash
cp .env.example .env.local
```

Fill in the values — they must match `docker/.env`:

```env
DATABASE_URL="postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/gynat?schema=public"
NEXT_PUBLIC_SUPABASE_URL="http://localhost:8000"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY>"
SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
SUPABASE_JWT_SECRET="<JWT_SECRET>"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

Also create a root `.env` for Prisma CLI (only needs `DATABASE_URL`):

```bash
echo 'DATABASE_URL="postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/gynat?schema=public"' > .env
```

---

## Step 3: Start Docker Services

```bash
cd docker
docker compose up -d
cd ..
```

This starts PostgreSQL (5432), GoTrue auth (9999), Kong API gateway (8000), and Supabase Studio (3001).

Wait until all containers are healthy:

```bash
cd docker && docker compose ps
```

---

## Step 4: Run Database Migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

This applies all migrations in `prisma/migrations/` to create the 20-table schema.

> Use `migrate deploy` (not `migrate dev`) on servers. Use `migrate dev` on development machines.

---

## Step 5: Create Admin User

The seed script expects a user with email **`bassel@autoflowa.com`** to exist in the database. This user is created via the app's signup flow — it is NOT created by the seed.

**Option A — via the browser (recommended for local dev):**

1. Start the dev server: `pnpm dev`
2. Go to `http://localhost:3000/auth/signup`
3. Sign up with `bassel@autoflowa.com` and a password
4. The callback route automatically syncs the user to `public.users`
5. Stop the dev server

**Option B — via GoTrue API directly:**

```bash
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"email": "bassel@autoflowa.com", "password": "your-password"}'
```

Verify the user exists in `public.users`:

```bash
npx prisma studio
# Open http://localhost:5555 → User table
```

---

## Step 6: Seed Workspaces

```bash
pnpm seed
```

This creates workspace records for all family configs in `src/config/families.ts` (excluding `test`) and assigns `bassel@autoflowa.com` as `workspace_admin` on each.

Expected output:

```
Seeding 4 workspaces for admin user bassel@autoflowa.com (...)
  Seeded workspace: saeed (آل سعيّد)
  Seeded workspace: al-dabbagh (آل الدباغ)
  Seeded workspace: al-dalati (آل الدالاتي)
  Seeded workspace: sharbek (آل شربك)
Seed completed successfully.
```

The seed is idempotent — safe to run again, it will upsert without duplicating.

---

## Step 7: Start the App

```bash
pnpm dev
```

Go to `http://localhost:3000`. Login with `bassel@autoflowa.com` and you should land on the dashboard showing the seeded workspaces.

---

## Ongoing Development

| Task | Command |
|------|---------|
| Start Docker | `cd docker && docker compose up -d` |
| Stop Docker | `cd docker && docker compose down` |
| Start app | `pnpm dev` |
| Run tests | `pnpm test` |
| After schema changes | `npx prisma migrate dev && npx prisma generate` |
| Browse database | `npx prisma studio` |

---

## Resetting the Database

To wipe all data and start fresh:

```bash
cd docker
docker compose down -v   # removes the pgdata volume
docker compose up -d
cd ..
npx prisma migrate deploy
# Then repeat Steps 5–6
```
