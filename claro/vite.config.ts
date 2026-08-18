import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Plugin order is load-bearing: tanstackStart() must come before viteReact().
export default defineConfig({
  server: { port: 8080, strictPort: false },
  preview: { port: 8080 },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // Colocated route tests (src/routes/*.test.ts) are tests, not routes — without
    // this the generator scans them and warns that they export no Route.
    tanstackStart({ router: { routeFileIgnorePattern: "\\.test\\.tsx?$" } }),
    viteReact(),
  ],
});
