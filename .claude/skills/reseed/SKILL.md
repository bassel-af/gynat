---
name: reseed
description: Clear tree data and reseed all workspaces from GEDCOM files
---

# Reseed Tree Data

Run these two commands sequentially:

1. Truncate tree tables:
```bash
docker exec docker-db-1 psql -U postgres -d gynat -c "TRUNCATE family_children, tree_edit_logs, families, individuals, family_trees CASCADE;"
```

2. Run seed script:
```bash
npx prisma db seed
```

If there are pending Prisma migrations, run `npx prisma migrate dev` first.
