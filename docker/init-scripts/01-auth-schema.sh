#!/bin/bash
set -e

# This script runs on first database initialization.
# POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB come from Docker env.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  -- GoTrue expects the 'auth' schema to exist.
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE SCHEMA IF NOT EXISTS extensions;

  -- Enable required extensions
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

  -- Roles expected by Supabase Studio, pg-meta, and GoTrue.
  -- The official supabase/postgres image creates these automatically,
  -- but we use plain postgres:15-alpine so we create them here.
  CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD}';
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  CREATE ROLE supabase_auth_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}';

  GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
  GRANT ALL ON SCHEMA public TO postgres, supabase_admin;
EOSQL
