import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  return createRouter({
    routeTree,
    /*
     * Read from Vite's `base` rather than written out again here. On GitHub
     * Pages the app is served from `/Claro/`, so a router that still believed
     * it was at `/` would build every link one level too high.
     */
    basepath: import.meta.env.BASE_URL,
    /*
     * Off deliberately. Claro's store is null on the server and on the client's
     * first render (invariant 1), so at the moment a restore is attempted the
     * document is still the skeleton and a fraction of its real height. The
     * browser clamps the restored offset to that height, the real content then
     * expands underneath it, and the reader lands at an arbitrary point in the
     * middle of a page they were not looking at: measured at 58px, 98px and
     * 297px for the same 900px scroll, purely as a function of viewport width.
     * A position that cannot be honoured is better not promised.
     */
    scrollRestoration: false,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
};
