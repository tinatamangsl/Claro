HearthHub
Household management app built with TanStack Start, React 19, Tailwind v4, and Lovable Cloud (Supabase).

Run locally
You can run the app either with Docker (recommended for a zero-setup experience) or directly with Bun.

Prerequisites
A .env file at the project root with your Supabase credentials:
VITE_SUPABASE_URL="https://<your-project>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-anon-key>"
VITE_SUPABASE_PROJECT_ID="<your-project-id>"
SUPABASE_URL="https://<your-project>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<your-anon-key>"
When running inside Lovable, .env is managed automatically — you only need to set this up for local development outside Lovable.

Option 1 — Docker (recommended)
Requires Docker and Docker Compose.

# Build and start the dev server
docker compose up --build

# Stop
docker compose down
The app will be available at http://localhost:8080 with hot reload.

Notes:

Source code is bind-mounted into the container, so edits on your host trigger Vite HMR.
node_modules lives inside a named volume (app_node_modules) so the host OS doesn't conflict with the container's install.
To re-install dependencies after changing package.json:
docker compose build --no-cache app
Option 2 — Bun (no Docker)
Requires Bun ≥ 1.2 and Node-compatible environment.

bun install
bun run dev
The app will be available at http://localhost:8080.

Useful scripts
Command	Description
bun run dev	Start Vite dev server (port 8080)
bun run build	Production build
bun run preview	Preview production build locally
bun run lint	Run ESLint
bun run format	Format with Prettier
Project structure
src/routes/ — TanStack Start file-based routes
src/components/ — UI components (shadcn/ui + custom)
src/integrations/supabase/ — auto-generated Supabase client and types (do not edit)
src/lib/ — shared utilities and server functions (*.functions.ts)
supabase/migrations/ — database migrations
Stack
Framework: TanStack Start v1 (React 19 + Vite 7)
Styling: Tailwind CSS v4 + shadcn/ui
Backend: Lovable Cloud (Supabase) — Postgres, Auth, Storage, Realtime
Runtime: Cloudflare Workers (production), Bun (local dev)
