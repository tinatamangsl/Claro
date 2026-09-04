import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, or null when Claro has not been given a project.
 *
 * **Everything downstream must treat null as normal, not as an error.** Claro
 * worked entirely on the device for its whole life before this, and it still
 * does when the two environment variables are absent: no account, no network,
 * no sync, and every existing test running against a store that never leaves
 * `localStorage`. A build without credentials is a valid build, not a broken
 * one, which is also what keeps `npm run dev` working for anybody who has not
 * set a project up.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const syncAvailable = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = syncAvailable
  ? createClient(url as string, anonKey as string, {
      auth: {
        // The session belongs in this browser, and it has to survive a reload
        // or somebody is signed out every time they open the app.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
