#!/usr/bin/env bash
# Fail if schema.sql and the migration have drifted apart.
#
# Two copies exist because one is meant to be read and one is meant to be run.
# That is only worth having while they say the same thing.
set -euo pipefail
cd "$(dirname "$0")/.."

MIGRATION="supabase/migrations/20260904000000_claro_state.sql"

# Compare the SQL itself, not the header comments, which differ on purpose:
# each one says where the other is.
strip() { grep -v '^--' "$1" | grep -v '^[[:space:]]*$'; }

if diff <(strip supabase/schema.sql) <(strip "$MIGRATION") > /dev/null; then
  echo "schema.sql and $MIGRATION agree."
else
  echo "schema.sql and $MIGRATION have drifted:" >&2
  diff <(strip supabase/schema.sql) <(strip "$MIGRATION") >&2 || true
  exit 1
fi
