# Encryption Operator Runbook — Gynat

**Audience**: you (the operator), three years from now, at 2 AM during an incident. NOT user-facing. Read top-to-bottom once when calm; jump to section 9 when on fire.

**Last reviewed**: Phase 10b ship.

> Last security review: T9 second pass (April 2026) — APPROVED with 4 non-blocking LOW notes on operator hardening; all addressed in the same session. See PRD Phase 10 "Hardening follow-ups" for the trail.

---

## 1. Overview

Gynat encrypts family data at rest with **two complementary layers**:

| Layer | What | Phase | Status |
|---|---|---|---|
| 1 | LUKS2 disk encryption on the Hetzner data volume (Argon2id KDF, keyfile-unlocked) | 10a | Complete |
| 2 | Per-workspace AES-256-GCM application encryption, with each workspace's data key wrapped by a single `WORKSPACE_MASTER_KEY` | 10b | Complete |

**What's NOT encrypted at rest, and why**:

- **Place names** (`Place.nameAr`, `Place.nameEn`) — global seed places are publicly known geography; workspace-custom places are a tiny fraction. Conflating two encoding schemes in one column added complexity for marginal privacy benefit. See the comment on the `Place` model in `prisma/schema.prisma`.
- **IDs, foreign keys, timestamps** — needed for joins, layout, ETag/`lastModifiedAt` invalidation, FK integrity.
- **Plaintext flags** — `isPrivate`, `isDeceased`, `sex`, `isUmmWalad`, `isDivorced`. Needed for tree layout, gender validation, queries.
- **Audit log indexable columns** — `action`, `entityType`, `entityId`, `userId`, `timestamp`. Stay plaintext at the top level so audit log queries work; the JSON `payload` and human-readable `description` ARE encrypted as opaque blobs.
- **Junction tables** — `FamilyChild`, `RadaFamilyChild` rows hold only plaintext FKs (no PII).

**Trust model — read this**: This is NOT end-to-end encryption. Platform administrators with live server access can still read data — the running app holds the master key in memory and unwraps workspace keys on demand. We chose layered defense + honest disclosure over E2EE because:

- E2EE doesn't actually prevent admin access (the server controls workspace membership and could silently add itself).
- E2EE breaks branch pointers, magic links, server-side search, GEDCOM export, and audit logs.
- The UX cost (passphrase prompts, lost-key scenarios, new-device bootstrap) is high.

**Layer 1 future work — Phase 10c (Tang-bound unlock) is deferred**. The LUKS keyfile currently sits at `/root/.jeenat-luks.key` on the production server. This means a full root-FS compromise reveals it. Phase 10c will move unlock to a Tang server on a separate host, removing the keyfile from local disk. **Until 10c ships, do not put Layer 1 claims into the public privacy policy.**

---

## 2. The `WORKSPACE_MASTER_KEY`

**What it is**: a base64-encoded 32-byte (256-bit) AES key in the `WORKSPACE_MASTER_KEY` env var. It is used to wrap and unwrap each workspace's individual data key (stored in the `Workspace.encryptedKey` `Bytes?` column).

**Why it matters**:
- **Lose it** → every workspace's data is unrecoverable. AES-256-GCM is not breakable.
- **Compromise it** → an attacker who also has DB access can decrypt every workspace.

**Where it lives**:
- Dev: `.env.local` (gitignored).
- Production: `.env` (gitignored), loaded by the Next.js process.
- Validated at module load by `src/lib/db.ts` → `getMasterKey()`. Server fails fast if missing or malformed instead of crashing on the first request that hits encrypted data.

**Production file permissions**:
- `.env` should be mode `600`, owned by the application user.
- `chmod 600 /path/to/app/.env && chown app:app /path/to/app/.env`.

**Don't**:
- Commit it to git.
- Email it.
- Paste it into Slack / Discord / chat.
- Reuse it across environments (dev, staging, prod each get their own).
- Store it in the same backup as the database dumps — that defeats the purpose of having two layers.

---

## 3. Generating a new master key

```bash
openssl rand -base64 32
```

Verify the decoded length is exactly 32 bytes:

```bash
echo 'YOUR_KEY_HERE' | base64 -d | wc -c   # must print 32
```

If it prints anything other than `32`, regenerate. The app will refuse to start otherwise.

---

## 4. Backing up the master key

The master key is the single piece of state that, if lost, makes the data permanently unrecoverable. Treat it accordingly.

**Primary backup**: a password manager (Bitwarden / 1Password / self-hosted Vaultwarden) under a clearly-named entry such as `gynat-prod WORKSPACE_MASTER_KEY (DO NOT LOSE)`. Include the date generated and the environment.

**Secondary backup**: an encrypted printed copy in a fireproof safe. Yes, paper. Paper survives ransomware, account lockouts, and password manager outages.

**Quarterly recovery drill**: every 3 months, restore the key from the password manager into a scratch env file on a dev machine, run `pnpm encrypt:existing` against a DB snapshot, and verify decryption works end-to-end. If you cannot recover the key in a drill, you cannot recover it in an incident. Put this on the calendar.

**Anti-patterns**:
- Storing the master key in the same encrypted backup bundle as the DB dump.
- Storing it in CI environment variables alone (CI provider can be locked out, audited, or compromised).
- Trusting a single password manager account without a recovery contact.

---

## 5. Recovery procedure if the master key is lost

**Honest answer: data is unrecoverable.** AES-256-GCM with a 256-bit key is not breakable by brute force. The wrapped workspace keys in `Workspace.encryptedKey` cannot be unwrapped without the master key.

**What you CAN salvage**:
- Plaintext columns: IDs, foreign keys, place names, flags, timestamps, `sex`, `isPrivate`, audit log indexable columns (`action`, `entityType`, `entityId`, `userId`, `timestamp`).
- Tree structure (parent / child / spouse relationships) — these survive because `FamilyChild`, `husbandId`, `wifeId`, etc. are plaintext FKs.
- Anything in git: code, config, migrations.
- LUKS-encrypted disk content is still readable — the LUKS keyfile is independent of the app master key.

**What you CANNOT recover**:
- Names (given / surname / full / kunya).
- Birth and death dates, places (as text), descriptions, notes.
- Marriage event details (contract, marriage, divorce dates / places / notes).
- Audit log snapshots (`snapshotBefore` / `snapshotAfter`), `description`, `payload`.
- Rada'a family notes.

**If this happens to you**:
1. Tell affected workspace admins immediately. Do not pretend the data still exists.
2. Offer to help them rebuild from any GEDCOM exports they may have downloaded. (This is a good reason to encourage exports going forward — the Phase 6b export route lets workspace admins download a full GEDCOM at any time.)
3. Document the incident in `docs/deployment/` for future-you.

---

## 6. Key rotation procedure

Rotation re-wraps each workspace's data key with a new master key. The data keys themselves do NOT change — only their wrapping. Tree data is not touched. This means:

- All workspaces stay readable throughout the rotation.
- No tree-row writes are needed.
- The only DB updates are the `Workspace.encryptedKey` rows.

**When to rotate**:
- Suspected compromise (operator laptop stolen, hostile former contractor, suspicious access in logs).
- Routine, every 1-2 years.
- After staff turnover involving anyone who had `.env` access.

**Step by step**:

1. Generate the new master key:
   ```bash
   NEW_KEY=$(openssl rand -base64 32)
   echo "$NEW_KEY"
   ```
   Save it to the password manager **right now**, before doing anything else.

2. Stop the Next.js server. The app caches the master key at module load (`getMasterKey()` memoizes), so you cannot rotate while the process is running.

3. **Take a database backup.** If the rotation script fails halfway through, you want a clean snapshot to roll back to.
   ```bash
   pg_dump -Fc gynat > /tmp/gynat-pre-rotation.dump
   ```

4. Set both keys in the env so the rotation script can read both. **Do NOT type `export FOO="..."` directly** — those commands land in `~/.zsh_history` / `~/.bash_history` in plaintext, putting both the old and new master keys on disk for the lifetime of the history file. The "found old AND new key in shell history" pattern is a common forensic finding after server compromise. Write the keys to a mode-600 temp file and `source` it instead:

   ```bash
   umask 077
   cat > /tmp/rotate-keys.env <<'EOF'
   export WORKSPACE_MASTER_KEY_OLD="<current key>"
   export WORKSPACE_MASTER_KEY="<new key>"
   EOF
   source /tmp/rotate-keys.env
   # ... do the rotation in step 5 ...
   shred -u /tmp/rotate-keys.env   # secure-delete the file when done
   ```

   The `umask 077` ensures the temp file is created mode 600 (read/write owner only). `shred -u` overwrites and unlinks. If your distro doesn't have `shred`, fall back to `dd if=/dev/urandom of=/tmp/rotate-keys.env bs=1 count=$(stat -c%s /tmp/rotate-keys.env) && rm /tmp/rotate-keys.env`.

   If you absolutely cannot use a temp file (e.g. read-only `/tmp`), prefix every key-bearing command with a leading space and confirm `HISTCONTROL=ignorespace` (bash) or `setopt HIST_IGNORE_SPACE` (zsh) is active in the current shell. Verify with `history | tail -20` after the rotation to confirm the keys did not land in history.

5. Run the rotation. A dedicated rotation script does NOT yet ship — until one does, drive it manually via `tsx`:
   ```ts
   // pseudo-code, run via tsx — actually wire this through the real prisma client
   import { unwrapKey, wrapKey } from '@/lib/crypto/workspace-encryption';
   const oldKey = Buffer.from(process.env.WORKSPACE_MASTER_KEY_OLD!, 'base64');
   const newKey = Buffer.from(process.env.WORKSPACE_MASTER_KEY!, 'base64');
   // Each row update is atomic. If this loop is interrupted (Ctrl-C, OOM,
   // network blip, server reboot), re-run it. Rows already rotated will
   // fail unwrapKey(...oldKey) on the second pass and skip cleanly.
   for (const ws of await prisma.workspace.findMany({ select: { id: true, encryptedKey: true } })) {
     if (!ws.encryptedKey) continue;
     let dataKey: Buffer;
     try {
       dataKey = unwrapKey(Buffer.from(ws.encryptedKey), oldKey);
     } catch {
       // Already rotated under the new key, OR this workspace has a corrupt
       // wrapped key. Skip and log; manually inspect any non-zero skip count
       // after the rotation completes.
       console.log(`[skip] workspace ${ws.id} — already rotated or unwrap failed`);
       continue;
     }
     const newWrapped = wrapKey(dataKey, newKey);
     await prisma.workspace.update({ where: { id: ws.id }, data: { encryptedKey: newWrapped } });
   }
   ```
   Build a one-shot script when you first need it; reuse on every subsequent rotation. Re-run the loop after any interruption — it is idempotent. The first pass after a clean run should report 0 updates (every workspace either skipped or was rewrapped already).

6. Update production `.env` with `WORKSPACE_MASTER_KEY=<new key>`. Remove `WORKSPACE_MASTER_KEY_OLD`.

7. Restart the Next.js server.

8. **Smoke-test**:
   - Load any workspace's tree page in a browser → confirm names render.
   - Run `pnpm smoke` → all endpoints 2xx.
   - Spot-check the audit log page on a workspace with `enableAuditLog=true` → confirm Arabic descriptions render.

9. Once verified, securely destroy the old key from the password manager (or move it to an `Old keys` vault labelled with the rotation date — useful if you need to read an old offline backup).

**Rollback**: if anything goes sideways before step 6, restore the DB snapshot from step 3 and revert the env to the old key. The rotation is idempotent per row, so a partial rotation is also re-runnable.

---

## 7. Running `scripts/encrypt-existing-data.ts`

Used to migrate legacy plaintext rows to AES-256-GCM after a schema migration that converts a `String?` column to `Bytes?`. Phase 10b shipped two such migrations; future schema changes that move new columns into the encrypted set will need a similar pass.

```bash
pnpm encrypt:existing
```

**What it does**:
- Walks every workspace.
- Generates and wraps a fresh data key for any workspace missing `encryptedKey`.
- For `Individual` / `Family` / `RadaFamily` rows: tries to decrypt each `Bytes` column under the workspace key. If decryption fails, treats the bytes as legacy UTF-8 plaintext and re-encrypts.
- For `TreeEditLog` rows: re-wraps `snapshotBefore` / `snapshotAfter` JSON envelopes; re-encrypts `description` and `payload` `Bytes` columns under the same gate. The `description` branch has a UTF-8 sanity guard (`scripts/lib/utf8-guard.ts`) that skips rows whose bytes contain binary control bytes — these get a `[skip]` warning in the log naming only the row id, never the row content.

**Idempotent**: running it twice is a no-op on the second pass. Every field is checked via the "already decrypts?" gate before re-encryption.

**When to run**:
- After a schema migration that converts a `String` column to `Bytes`.
- On a fresh local install with seeded test data, BEFORE the read paths exercise the new columns.
- NOT needed on a fresh production deployment — Phase 10b ensured the very first production write lands already encrypted, so production starts clean.

**Safety**:
- Take a DB backup before running.
- Run against dev first.
- The script reads `WORKSPACE_MASTER_KEY` from `.env.local` via `tsx --env-file=.env.local --env-file-if-exists=.env`. **Wrong key = corrupted rows**: the script will treat existing ciphertext as garbage and try to re-encrypt with the wrong key. DOUBLE-CHECK the env file before running.
- The script fails fast if `WORKSPACE_MASTER_KEY` is missing or malformed.

A companion script `scripts/verify-encryption.ts` reads every workspace through the real mapper and reports decrypted sample individuals — use it to confirm a migration succeeded.

---

## 8. How the two layers fit together

```
+----------------------------------------------------------+
|  Hetzner volume (LUKS2, Argon2id, keyfile-unlocked)      |  <- Layer 1 (Phase 10a)
|  Protects: stolen disks, leaked backups, physical theft  |
|  Does NOT protect: live SSH, running app, root access    |
|                                                          |
|  +----------------------------------------------------+  |
|  |  PostgreSQL data files (ext4 on /mnt/encrypted)    |  |
|  |                                                    |  |
|  |  +----------------------------------------------+  |  |
|  |  |  Workspace.encryptedKey (Bytes, wrapped key) |  |  |  <- Layer 2 (Phase 10b)
|  |  |  Individual / Family / RadaFamily / Audit    |  |  |  AES-256-GCM, per-workspace key
|  |  |  log columns (Bytes, AES-256-GCM ciphertext) |  |  |  Wrapped by WORKSPACE_MASTER_KEY
|  |  +----------------------------------------------+  |  |
|  +----------------------------------------------------+  |
+----------------------------------------------------------+
```

**Independence**:
- LUKS keyfile lives at `/root/.jeenat-luks.key` on production, mode 600. Independent of the app master key.
- App master key lives in `.env`, loaded by Node at startup. Independent of LUKS.
- Per-workspace data keys live in `Workspace.encryptedKey`, unwrapped on demand by `getWorkspaceKey()`.

**What each layer protects**:

| Scenario | Layer 1 helps? | Layer 2 helps? |
|---|---|---|
| Stolen disk / physical drive | Yes | Yes |
| Stolen DB dump from off-site backup | No (dump is plaintext SQL) | Yes (Bytes columns are ciphertext) |
| Live SSH access by attacker | No | Partial (until Phase 10c — keyfile is on root FS) |
| Running app compromise (RCE in Next.js) | No | No (the app holds the master key in memory) |
| Application bug leaking another workspace's data | No | Yes (cross-workspace decrypt fails the auth tag) |

If LUKS is compromised but the app master key is safe, individual rows still need decryption — Layer 2 holds.
If the app master key is compromised but LUKS is safe, an attacker still needs DB access to use it.
If BOTH are compromised, all data is readable.

---

## 9. Incident response

This section is the "what do I do at 2 AM" runbook. Each scenario assumes you have already paged whoever else needs to know.

### 9a. Master key suspected compromised

1. **Don't panic.** A master key compromise only matters if the attacker also has DB access. Audit DB access logs first to determine actual exposure.
2. Rotate the master key (section 6) immediately. Old wrapped keys become useless once rotated.
3. Check every place the old key may have leaked, in this order (most-likely first):
   - Shell history files: `~/.zsh_history`, `~/.bash_history`, `~/.history`, root's history files (`/root/.zsh_history` etc.).
   - tmux/screen capture buffers, terminal scrollback recordings, asciinema casts.
   - IDE terminal panes (VS Code, JetBrains) — these often persist scrollback to disk.
   - `systemd-journal` logs (`journalctl -u <unit>` may have captured stdout from an env-loading script).
   - Git history of `.env` files, even if the file was later removed (`git log --all --full-history -- .env*`, then `git show <commit>:.env` on each match).
   - CI/CD secret stores (GitHub Actions, GitLab CI, Hetzner Cloud secrets) — rotate the secret value, not just the key file.
   - Deployment scripts and Ansible / Terraform vars files.
   - Dotfile backup tarballs and home-directory backups.
   - Cloud provider VM snapshots taken during the exposure window — destroy them.

   Treat each location as potentially compromised: assume the key was read, not just stored.
4. Audit the `AdminAccessLog` table (helper at `src/lib/audit/admin-access.ts`, currently scaffolded but not yet wired to routes) for unusual access patterns in the last 90 days, plus `TreeEditLog` for unexpected mutations.
5. If PII was potentially exposed, notify all workspace admins. Legal disclosure obligations depend on your jurisdiction — consult a lawyer if you have any users in the EU (GDPR) or California (CCPA).

### 9b. A workspace data key suspected compromised

The data key sits in DB (`Workspace.encryptedKey`, wrapped). To extract it from the DB an attacker needs the master key first — so this scenario reduces to 9a.

The exception: if a developer accidentally logs `getWorkspaceKey()` output (e.g. a `console.log` left in a route handler), that workspace's plaintext data key is exposed in application logs.

Mitigation:
1. Rotate the data key for the affected workspace ONLY:
   - Generate a new data key (`generateWorkspaceKey()`).
   - Decrypt all `Bytes` columns for that workspace's tree using the OLD key.
   - Re-encrypt with the NEW key.
   - Wrap the NEW key with the master key, save to `Workspace.encryptedKey`.
2. This is invasive — touches every `Individual` / `Family` / `RadaFamily` / `TreeEditLog` row in that tree. No script ships for this yet; write one at incident time using `scripts/encrypt-existing-data.ts` as a template.
3. Audit the application code to find and remove the logging that caused the leak. Add a lint rule to prevent recurrence.

### 9c. Hetzner volume lost (stolen / leaked / orphaned)

LUKS protects against this by design. The keyfile lives on the root filesystem, NOT on the volume — so a volume in isolation is unreadable.

1. Verify the keyfile is still confidential. It lives at `/root/.jeenat-luks.key` on the production server, mode 600.
2. If both the volume AND the root FS were stolen (e.g. the entire server was carted away), the LUKS keyfile is exposed. Assume the data is readable. Layer 2 is now the only line of defense — and Layer 2 holds because the master key is in `.env` on the same server, but only as long as the attacker has not booted the OS. If they boot the stolen server, they have everything.
3. Restore from off-site DB backups (if any) onto a fresh server with a NEW LUKS volume + NEW keyfile + NEW master key.
4. Notify all workspace admins. Phase 10c (Tang-bound unlock) would mitigate this scenario by removing the keyfile from local FS — track its priority after an incident.

### 9d. Production server fully compromised (root SSH access by attacker)

This is the worst case. All defenses are simultaneously bypassed:
- Layer 1 doesn't help — root has the keyfile.
- Layer 2 doesn't help directly — the running app holds the master key in memory and the per-workspace keys via `getWorkspaceKey()`. An attacker with root can extract the master key from the running Node process via `gcore $(pidof node)`, `/proc/<pid>/mem`, or any prior core dump captured during the exposure window. Production should disable core dumps entirely — set `LimitCORE=0` in the systemd unit, `ulimit -c 0` in the shell environment, and verify with `cat /proc/<pid>/limits | grep core`. Step 1's poweroff is time-critical for this reason: the longer the compromised process runs, the larger the window for memory extraction or fresh core dumps.

Procedure:
1. **Pull the plug on the server.** Literally — `hcloud server poweroff` or equivalent. Do not SSH in to "investigate first"; you may tip off the attacker and give them time to exfiltrate more.
2. Rotate ALL credentials: master key, LUKS keyfile, DB password, any API tokens stored in `.env`, SSH host keys, OAuth client secrets.
3. Provision a fresh server. Generate fresh LUKS + master key + workspace keys.
4. Restore from off-site backups onto a temporary box that has BOTH the OLD master key (to decrypt the backup) AND the NEW master key (to re-encrypt before persisting). Run a one-off rotation similar to section 6 but writing into the new DB. Dispose of the temporary box afterwards.
5. Notify all workspace admins. Disclose the breach honestly.
6. Post-mortem: how did the attacker get root? Patch that path before re-opening the service.

---

## 10. Audit access (current state)

- **`TreeEditLog`** captures every tree mutation (Phase 9), with snapshot diffs encrypted under the workspace key. Indexable columns (`action`, `entityType`, `entityId`, `userId`, `timestamp`) stay plaintext so the admin audit log page can query and filter without decryption.
- **`AdminAccessLog`** (scaffolded in this phase) is the model for capturing server-side admin reads of workspace data outside the normal authenticated member request path. Helper at `src/lib/audit/admin-access.ts`:
  ```ts
  await logAdminAccess({
    userId,
    action: 'workspace_data_read',
    workspaceId,
    entityType: 'individual',
    entityId,
    reason: 'support ticket #123',
    ipAddress,
    userAgent,
  });
  ```
  The helper truncates `reason` and `userAgent` to 500 characters, swallows DB errors so audit-write failures never break the operation being logged, and reports failures via a generic PII-free `console.error` line.

  **Currently NOT wired to any route** because there are no admin-only read routes yet. When such routes are added (admin dashboard, support tooling, cross-workspace search, etc.), wire each one through this helper.
- See `docs/deployment/layer-1-encryption.md` for the LUKS-side audit trail and operational notes.
