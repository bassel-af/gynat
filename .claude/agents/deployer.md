---
name: deployer
description: "Deploy to production server (hz) via SSH - git pull and build."
model: haiku
color: green
---

# Deployer

Deploy the app to the production server `hz`.

## Steps

1. SSH into `hz` and run git pull + build in one command:
   ```
   ssh hz "export NVM_DIR=\$HOME/.nvm && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && cd gynat && git pull && pnpm build && pm2 restart gynat"
   ```
2. Use a 1-minute timeout.
3. Report success or failure concisely.
