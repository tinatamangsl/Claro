#!/usr/bin/env bash
# Apply supabase/migrations to the project named in .env.local.
#
# The connection string lives in a gitignored file and is read here, so it never
# has to be pasted into a chat, a commit or a terminal history. It is also the
# narrowest credential that can do this job: scoped to one database, unlike a
# personal access token, which would grant management access to a whole account.
set -euo pipefail

cd "$(dirname "$0")/.."

# Read the one value, rather than sourcing the file.
#
# `source` would *execute* .env.local, so a stray space after an `=` turns the
# rest of the line into a command, which is exactly what happened the first time
# this ran. It also means a file holding a password gets run as a script, which
# is not something to do to appease a formatting slip.
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -f .env.local ]; then
  SUPABASE_DB_URL=$(
    sed -n "s/^[[:space:]]*SUPABASE_DB_URL[[:space:]]*=[[:space:]]*//p" .env.local |
      tail -n 1 |
      sed -e "s/^['\"]//" -e "s/['\"]$//"
  )
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  cat >&2 <<'MSG'
SUPABASE_DB_URL is not set.

Supabase dashboard -> green "Connect" button -> "Connection string" tab ->
Session pooler. Put it in claro/.env.local, which is gitignored:

  SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'

Replace [YOUR-PASSWORD] including the square brackets, keep the single quotes,
and leave no space either side of the "=".
MSG
  exit 1
fi

echo "Applying migrations..."
npx --yes supabase@latest db push --db-url "$SUPABASE_DB_URL" "$@"
