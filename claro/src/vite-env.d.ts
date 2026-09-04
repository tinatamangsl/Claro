/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Supabase project credentials, baked into the bundle at build time.
   *
   * These are public by design: on a static host there is no server to keep a
   * secret on, and the anon key is meant to be readable. What actually protects
   * the data is row-level security, so the policies in `supabase/schema.sql`
   * are the security boundary, not this key.
   *
   * Both are optional. With either missing, Claro runs exactly as it always
   * has: everything on the device, no account, no network.
   */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
