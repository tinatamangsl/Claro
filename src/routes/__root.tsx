import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { HearthProvider } from "@/lib/hearth-context";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="paper-card max-w-md p-10 text-center">
        <div className="text-6xl">🧭</div>
        <h1 className="mt-4 text-3xl">We can't find that room</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for isn't part of this household.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="paper-card max-w-md p-10 text-center">
        <div className="text-6xl">🫖</div>
        <h1 className="mt-4 text-2xl">Something boiled over</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "HearthHub — Your family's cozy command center" },
      { name: "description", content: "Coordinate tasks, shopping, schedules and more across every household you belong to." },
      { property: "og:title", content: "HearthHub — Your family's cozy command center" },
      { property: "og:description", content: "Coordinate tasks, shopping, schedules and more across every household you belong to." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "HearthHub — Your family's cozy command center" },
      { name: "twitter:description", content: "Coordinate tasks, shopping, schedules and more across every household you belong to." },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <HearthProvider>
        <Outlet />
        <Toaster richColors position="top-center" />
      </HearthProvider>
    </QueryClientProvider>
  );
}
