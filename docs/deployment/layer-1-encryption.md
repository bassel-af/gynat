# Layer 1 Encryption — Hetzner Volume LUKS Setup

## Target

Store all gynat runtime state (PostgreSQL data, `.env` files, application code, PM2 state, local backups) on a LUKS-encrypted block device, so that a stolen Hetzner Volume or disk snapshot reveals only ciphertext. This is **Stage 1** of a two-stage plan: the keyfile currently lives on the unencrypted root filesystem, which is acceptable for infrastructure prep but not a real privacy guarantee until Stage 2 (Tang-bound unlock) is done.

## Current state

| Item | Value |
|---|---|
| Server | `general-server` (Hetzner Cloud, Ubuntu 24.04.3 LTS) |
| Volume | `gynat-encrypted`, 20 GB, attached as `/dev/sdb` |
| Stable device path | `/dev/disk/by-id/scsi-0HC_Volume_105360026` |
| LUKS UUID | `d990223d-1c3d-4d7b-b5fe-f99d2a17d172` |
| LUKS format | LUKS2, AES-256-XTS, Argon2id |
| Keyfile | `/root/.gynat-luks.key` (512 bytes, mode 600) |
| Mapper | `/dev/mapper/gynat-encrypted` |
| Filesystem | ext4, label `gynat` |
| Mount point | `/mnt/encrypted` |
| Directory skeleton | `/mnt/encrypted/gynat/{app,pm2,postgres,backups}` |
| Auto-unlock | `/etc/crypttab` (keyfile + `luks,discard`) |
| Auto-mount | `/etc/fstab` (`defaults,nofail`) |
| Reboot-verified | Yes |

The mapper, filesystem label, and keyfile were originally created with the name `jeenat`. They were renamed to `gynat` in April 2026 when the project was rebranded from Solalah → Gynat.

## Commands executed

```bash
# 1. Create random 512-byte keyfile
dd if=/dev/urandom of=/root/.gynat-luks.key bs=512 count=1
chmod 600 /root/.gynat-luks.key

# 2. LUKS2 format
cryptsetup luksFormat --type luks2 --batch-mode \
  --key-file /root/.gynat-luks.key /dev/sdb

# 3. Open LUKS volume
cryptsetup luksOpen --key-file /root/.gynat-luks.key \
  /dev/sdb gynat-encrypted

# 4. Create filesystem
mkfs.ext4 -L gynat /dev/mapper/gynat-encrypted

# 5. Mount
mkdir -p /mnt/encrypted
mount /dev/mapper/gynat-encrypted /mnt/encrypted

# 6. Directory skeleton
mkdir -p /mnt/encrypted/gynat/{app,pm2,postgres,backups}

# 7. Auto-unlock on boot (/etc/crypttab)
#    <name>  <source>  <keyfile>  <options>
gynat-encrypted UUID=d990223d-1c3d-4d7b-b5fe-f99d2a17d172 /root/.gynat-luks.key luks,discard

# 8. Auto-mount on boot (/etc/fstab)
/dev/mapper/gynat-encrypted /mnt/encrypted ext4 defaults,nofail 0 2

# 9. Reload and verify
systemctl daemon-reload
```

## Recovery — manual unlock

If auto-unlock ever fails, unlock manually:

```bash
cryptsetup luksOpen --key-file /root/.gynat-luks.key /dev/sdb gynat-encrypted
mount /mnt/encrypted
```

If the keyfile is lost, **the encrypted volume is unrecoverable**. There is no passphrase fallback in Stage 1 (only the keyfile slot is populated). Back up `/root/.gynat-luks.key` out of band before relying on this volume for anything you cannot afford to lose.

## What this protects against

- ✅ Volume stolen in isolation (e.g., orphaned volume reassignment by Hetzner)
- ✅ Pure disk-layer attack on `/dev/sdb`
- ❌ Full VPS compromise / root SSH access (keyfile sits on root FS)
- ❌ Hetzner operator with root + disk access

Stage 2 (Tang) closes the last two gaps.
