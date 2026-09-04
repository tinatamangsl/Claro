// Does row-level security actually hold?
//
// This deliberately does not read pg_policies. Policies existing is the
// configuration that is supposed to produce safety; what matters is the
// behaviour, so this asks the question an attacker would: with nothing but the
// public anon key, can I read the table?
//
// The anon key is compiled into a static bundle that anybody can download, so
// this is not a hypothetical. If it ever returns rows, every user's planner and
// their cycle notes are readable by anyone who opens devtools.
import { readFileSync } from "node:fs";

const env = { ...process.env };
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {
  // No .env.local is fine if the values are already in the environment.
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are needed.\n" +
      "Supabase dashboard -> Project Settings -> API. Put them in claro/.env.local,\n" +
      "which is gitignored. Use the anon key, never service_role: that one bypasses\n" +
      "every policy and would make this check pass while proving nothing.",
  );
  process.exit(1);
}

const endpoint = `${url.replace(/\/$/, "")}/rest/v1/claro_state?select=user_id&limit=5`;
const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
const body = await res.text();

// PostgREST answers an RLS-blocked select with 200 and an empty array, because
// the rows are invisible rather than forbidden. Either that or an explicit
// permission error is a pass; rows coming back is the failure.
if (res.status === 401 || res.status === 403) {
  console.log(`Locked down. Anonymous read refused (${res.status}).`);
  process.exit(0);
}

if (!res.ok) {
  // A missing table means the migration has not been applied yet, which is a
  // different problem from an unsafe one, so say which.
  console.error(`Could not check: HTTP ${res.status}\n${body}`);
  console.error(
    body.includes("does not exist")
      ? "\nThe table is not there. Run `npm run db:push` first."
      : "",
  );
  process.exit(1);
}

let rows;
try {
  rows = JSON.parse(body);
} catch {
  console.error(`Unexpected response:\n${body}`);
  process.exit(1);
}

if (Array.isArray(rows) && rows.length === 0) {
  console.log("Read: an anonymous caller sees zero rows.");
  await probeWrite();
  process.exit(0);
}

console.error(
  `UNSAFE: an anonymous caller read ${rows.length} row(s) from claro_state.\n` +
    "Row-level security is not protecting this table. Do not add the repository\n" +
    "secrets or publish the site until this returns nothing.",
);
process.exit(1);

/**
 * The half of the check that works on an empty table.
 *
 * A read returning nothing is ambiguous: it looks identical whether the rows
 * are hidden or simply absent. A write is not. RLS must refuse an insert from
 * an anonymous caller no matter what is in the table, because the policy
 * requires `auth.uid() = user_id` and `auth.uid()` is null here. So this asks
 * for the one answer that cannot be faked by an empty database.
 */
async function probeWrite() {
  const fakeUser = "00000000-0000-4000-8000-000000000000";
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/claro_state`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ user_id: fakeUser, state: { probe: true }, version: 0 }),
  });

  if (res.status === 401 || res.status === 403) {
    console.log(`Write: refused (${res.status}). Row-level security is doing its job.`);
    return;
  }

  if (res.ok) {
    console.error(
      "\nUNSAFE: an anonymous caller inserted a row into claro_state.\n" +
        "Anyone who downloads the site bundle can write to your database.\n" +
        "Do not add the repository secrets or publish until this is fixed.",
    );
    // Best effort tidy-up. If RLS is this broken the delete will work too.
    await fetch(`${url.replace(/\/$/, "")}/rest/v1/claro_state?user_id=eq.${fakeUser}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    process.exit(1);
  }

  // Any other refusal is still a refusal, and worth reading.
  console.log(`Write: refused (${res.status}). ${(await res.text()).slice(0, 160)}`);
}
