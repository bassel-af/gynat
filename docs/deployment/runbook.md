# Gynat Production Runbook — `hz`

Everything needed to operate and recover the production deployment. For the underlying LUKS setup, see `layer-1-encryption.md`. For application encryption, see `../encryption.md`.

## 1. Topology

| Layer | Where |
|---|---|
| Client | Browser → Cloudflare edge (DNS proxy on, SSL mode: **Full (strict)**, Always Use HTTPS on) |
| Edge → origin | Cloudflare → `37.27.89.14:443` (hz) |
| TLS at origin | Let's Encrypt wildcard cert for `gynat.com`, issued via DNS-01 using the Cloudflare API token in `/root/.cloudflare/credentials.ini`. Auto-renews via certbot's systemd timer. |
| Reverse proxy | `nginx` on 80/443, vhost at `/etc/nginx/sites-enabled/gynat.com` |
| App | Next.js (`pnpm start` on `PORT=4000`) managed by PM2 under `pm2-gynat.service` |
| Auth / DB / gateway | Docker Compose stack: `docker-db-1` (Postgres 15), `docker-gotrue-1` (Supabase Auth), `docker-kong-1` (127.0.0.1:8002 → 8000 container), `docker-pg-meta-1` |
| Email | Gmail SMTP (`smtp.gmail.com:587`) with `bassel@gynat.com` SMTP user, `noreply@gynat.com` as alias + Gmail "Send As" sender |
| Analytics | Umami on `analytics.autoflowa.com` (unchanged by the rebrand) |
| Monitoring | Uptime Kuma on `status.autoflowa.com` watches `https://gynat.com` |

## 2. Encrypted-volume layout

Everything mutable lives on the LUKS volume mounted at `/mnt/encrypted`:

```
/mnt/encrypted/gynat/
├── app/           # git clone of the gynat repo; ~/gynat is a symlink here
├── pm2/           # PM2_HOME for the gynat PM2 daemon (dump.pm2, logs, pids)
├── postgres/      # bind-mounted into docker-db-1 at /var/lib/postgresql/data
└── backups/       # manual backups + archived old deployments
```

The LUKS mapper is still named `jeenat-encrypted` and the fs label is `jeenat` (internal identifiers, not renamed during the rebrand). The keyfile is `/root/.gynat-luks.key` mode 600.

## 3. Two PM2 daemons (important)

```
pm2-root.service  → /root/.pm2              → n8n (only)
pm2-gynat.service → /mnt/encrypted/gynat/pm2 → gynat (only)
```

Both are systemd-enabled; both resurrect on boot. **Never run `pm2` commands without first knowing which daemon you're talking to.**

```bash
# default /root/.pm2 — talks to n8n
unset PM2_HOME && pm2 list

# encrypted daemon — talks to gynat
export PM2_HOME=/mnt/encrypted/gynat/pm2 && pm2 list
```

The `deployer` agent sets `PM2_HOME` explicitly. If you run a manual `pm2 restart gynat` make sure to export the var first.

## 4. Environment files

Both files live on the encrypted volume, mode 600, gitignored:

```
/mnt/encrypted/gynat/app/.env           # DATABASE_URL + SEED_ADMIN_EMAIL + WORKSPACE_MASTER_KEY (for Prisma CLI + tsx scripts)
/mnt/encrypted/gynat/app/.env.local     # Next.js runtime (NEXT_PUBLIC_*, SUPABASE_*, SMTP_*, WORKSPACE_MASTER_KEY)
/mnt/encrypted/gynat/app/docker/.env    # Docker Compose (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, PG_META_CRYPTO_KEY, SMTP_*, GOOGLE_*, KONG_HOST_BIND)
```

**`WORKSPACE_MASTER_KEY` must be backed up out-of-band** (password manager). Losing it means losing every per-workspace encrypted field.

Prod sets `SUPABASE_INTERNAL_URL=http://127.0.0.1:8002` in `.env.local` — the server-side Supabase clients verify tokens against the local Kong listener instead of looping back out through `https://gynat.com` (that round trip timed out at the CDN edge and surfaced as «fetch failed» / random 401s). The browser keeps using `NEXT_PUBLIC_SUPABASE_URL`.

## 5. Standard deploy

Invoke the `deployer` agent, or run this command:

```bash
ssh hz "export NVM_DIR=\$HOME/.nvm && . \"\$NVM_DIR/nvm.sh\" && export PM2_HOME=/mnt/encrypted/gynat/pm2 && cd gynat && git pull && pnpm install --frozen-lockfile && pnpm build && pm2 restart gynat"
```

What it does:
1. `cd gynat` → follows `~/gynat` symlink into the encrypted app dir
2. `git pull` — no stashing; any local edits must be committed or discarded first
3. `pnpm install --frozen-lockfile` — no-op when lockfile unchanged
4. `pnpm build` — Next.js production build with strict type-check
5. `pm2 restart gynat` — talks to the encrypted PM2 daemon

**Deploy carrying migrations** (back up the DB first, §9): run `npx prisma migrate deploy && npx prisma generate` after `pnpm install` and **before** `pnpm build`, so the build type-checks against the new client. `sharp` (image re-encoding for source uploads) is a direct dependency with a native binary — after install, check it loads: `node -e "require('sharp')"`.

Verify:

```bash
ssh hz 'curl -sI http://127.0.0.1:4000/ | head -3'
curl -sI https://gynat.com/ | head -3
```

## 6. Running Prisma migrations

Prisma CLI reads `DATABASE_URL` from `.env` (not `.env.local`). The `.env` file on hz contains just `DATABASE_URL`, `SEED_ADMIN_EMAIL`, and `WORKSPACE_MASTER_KEY`.

```bash
ssh hz 'export NVM_DIR=$HOME/.nvm && . "$NVM_DIR/nvm.sh" && cd gynat && npx prisma migrate deploy && npx prisma generate && pm2 restart gynat'
```

Regenerate the client if schema types changed; otherwise the app will crash on startup.

## 7. Re-seeding

The seed scripts (`pnpm seed`, `pnpm reseed:*`, `pnpm start:fresh`) require `SEED_ADMIN_EMAIL`'s user to already exist in both `auth.users` (GoTrue) and `public.users`. Create via the GoTrue admin API using the service-role key; see the "Create admin user" section below.

Seeding is idempotent via `upsert` on places, workspaces, and tree data — re-running `pnpm seed` is safe.

## 8. Create a new admin / workspace owner

```bash
ssh hz 'set -a; source /mnt/encrypted/gynat/app/.env.local; set +a
TMP=$(openssl rand -base64 24 | tr -d /+=)
curl -s -X POST http://127.0.0.1:8002/auth/v1/admin/users \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"<email>\",\"password\":\"$TMP\",\"email_confirm\":true}"
# Save $TMP to a mode-600 file, hand to the user, have them reset in /profile'
```

Then upsert a matching row in `public.users` (needed by the app's FK joins):

```bash
ssh hz 'docker exec -i docker-db-1 psql -U postgres -d gynat -c "
INSERT INTO users (id, email, display_name, created_at)
VALUES (''<uuid-from-admin-api>'', ''<email>'', ''<display name>'', NOW())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name;
"'
```

The callback route also auto-syncs on first sign-in, so if the new user signs in once before you need DB-level access, this step is unnecessary.

## 9. Backups

**Database (Postgres):**

```bash
ssh hz 'docker exec docker-db-1 pg_dump -U postgres -Fc gynat \
  > /mnt/encrypted/gynat/backups/gynat-$(date +%Y%m%d-%H%M%S).dump'
```

The dump file is on the encrypted volume, so it's also LUKS-protected. Rotate by deleting files older than N days.

**Encryption keys** — already in `.env.local` (encrypted volume) + backed up off-host in a password manager. No additional backup step needed.

## 10. Restore

**From a Postgres dump** (assumes the docker stack is up):

```bash
ssh hz 'docker exec -i docker-db-1 psql -U postgres -c "DROP DATABASE IF EXISTS gynat"
docker exec -i docker-db-1 psql -U postgres -c "CREATE DATABASE gynat"
docker exec -i docker-db-1 pg_restore -U postgres -d gynat \
  < /mnt/encrypted/gynat/backups/<dump-file>.dump
pm2 restart gynat'
```

GoTrue's `auth` schema is in the same database, so a full dump/restore round-trips auth state as well.

## 11. TLS renewal

Certbot has a systemd timer (`systemctl list-timers | grep certbot`). The wildcard cert renews automatically via DNS-01 using `/root/.cloudflare/credentials.ini`. To test:

```bash
ssh hz 'certbot renew --dry-run'
```

If the Cloudflare API token ever gets revoked, regenerate at Cloudflare → My Profile → API Tokens and replace the contents of `/root/.cloudflare/credentials.ini`.

## 12. Common gotchas

- **Templates 504 in password-reset / invite emails** — the gotrue container fetches branded Arabic templates from `http://host.docker.internal:4000/templates/*.html`. UFW must allow `172.16.0.0/12 → any port 4000` (already configured). If it's ever lost, `ufw allow from 172.16.0.0/12 to any port 4000 proto tcp`.
- **Redirects pointing at `localhost:4000`** — Next.js `request.url` uses the upstream listen address behind a proxy. Any new redirect code should use `new URL(path, process.env.NEXT_PUBLIC_SITE_URL)` instead of `request.url`. See `src/app/auth/callback/route.ts` and `src/middleware.ts` for the pattern.
- **Docker Compose `restart` doesn't re-read `.env`** — use `docker compose up -d <service>` after editing `docker/.env` to actually pick up new values. Applies to GoTrue env changes like `GOOGLE_CLIENT_SECRET`.
- **Port 8000 conflict** — some other docker-proxy on hz binds `0.0.0.0:8000`. Kong must bind to `127.0.0.1:8002` instead (set via `KONG_HOST_BIND` in `docker/.env`). nginx proxies `/auth/v1/*` to `127.0.0.1:8002`.
- **PM2 daemon confusion** — see §3.
- **Source uploads fail over 1 MB (413 from nginx)** — the gynat.com vhost needs `client_max_body_size 9m;` (source files are capped at 8 MB). Set 2026-09-26; the pre-change config is backed up at `/root/gynat.com.nginx.bak-20260926-072703`. Re-add it if the vhost is ever regenerated, then `nginx -t && systemctl reload nginx`.

## 13. First-time deployment (reference)

For standing up a fresh production environment from scratch — e.g., new server, rebrand, or disaster recovery beyond the DB dump:

1. Provision hz with LUKS volume per `layer-1-encryption.md`, keyfile at `/root/.gynat-luks.key`
2. Skeleton dirs: `/mnt/encrypted/gynat/{app,pm2,postgres,backups}`
3. `git clone git@github.com:bassel-af/gynat.git /mnt/encrypted/gynat/app && ln -s /mnt/encrypted/gynat/app ~/gynat`
4. Generate secrets + write `.env`, `.env.local`, `docker/.env` (all mode 600). Back up `WORKSPACE_MASTER_KEY`.
5. `cd docker && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
6. `pnpm install --frozen-lockfile && npx prisma migrate deploy && npx prisma generate && pnpm build`
7. Create admin user via GoTrue admin API (§8), sync to `public.users`, then `pnpm seed`
8. `PM2_HOME=/mnt/encrypted/gynat/pm2 pm2 start pnpm --name gynat --cwd /mnt/encrypted/gynat/app -- start`, then `pm2 save` and `pm2 startup systemd -u root --hp /root --service-name pm2-gynat`
9. nginx vhost (with `client_max_body_size 9m;`, see §12) + Let's Encrypt cert (DNS-01 with Cloudflare token)
10. Set Cloudflare SSL mode to **Full (strict)**, enable **Always Use HTTPS**
11. Add UFW rule for docker→host:4000: `ufw allow from 172.16.0.0/12 to any port 4000 proto tcp`
