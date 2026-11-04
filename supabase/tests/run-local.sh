#!/usr/bin/env bash
# Verifies the migration and every row-level-security rule on a THROWAWAY local Postgres (no Supabase needed).
# Usage: PGPORT=54329 PGUSER=postgres ./supabase/tests/run-local.sh   (needs a running Postgres and psql)
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
psql -q -c "drop database if exists atlas_test" -c "create database atlas_test"
psql -q -v ON_ERROR_STOP=1 -d atlas_test -f stub.sql
psql -q -v ON_ERROR_STOP=1 -d atlas_test -f ../migrations/0001_init.sql
psql -q -v ON_ERROR_STOP=1 -d atlas_test -f rls_test.sql
