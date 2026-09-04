import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/*
 * Where the built app will be served from.
 *
 * Locally that is the root, and hardcoding anything else breaks
 * `localhost:8080`. GitHub Pages serves a project site from a subfolder
 * (`/Claro/`), and every asset URL and every route has to carry it, so the
 * deploy workflow sets this and nothing else has to know about it. The router
 * reads the same value back through `import.meta.env.BASE_URL`, so the two
 * cannot disagree about where the app lives.
 */
const base = process.env.CLARO_BASE ?? "/";

// Plugin order is load-bearing: tanstackStart() must come before viteReact().
export default defineConfig({
  base,
  server: { port: 8080, strictPort: false },
  preview: { port: 8080 },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // Colocated route tests (src/routes/*.test.ts) are tests, not routes — without
    // this the generator scans them and warns that they export no Route.
    tanstackStart({
      router: { routeFileIgnorePattern: "\\.test\\.tsx?$" },
      /*
       * Static output, because there is nothing here for a server to do.
       *
       * Claro has no server functions, no data loaders and no API: the only
       * `beforeLoad` in the app is a client-side redirect, and every byte of
       * state lives in `localStorage`. The default build emits a Node bundle
       * and no HTML at all, which is unservable by a static host. This
       * prerenders one shell that the router takes over from.
       */
      spa: { enabled: true },
    }),
    viteReact(),
  ],
});
