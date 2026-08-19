import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { Toaster } from "sonner";

import { ClaroProvider } from "@/lib/claro-store";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Claro: clarity, quarter to day" },
      {
        name: "description",
        content:
          "A clarity operating system. Set your direction for the quarter, commit to it weekly, and execute today.",
      },
      { name: "theme-color", content: "#f8f5f2" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Inline so the app stays dependency-free and never 404s for an icon.
      {
        rel: "icon",
        type: "image/svg+xml",
        href:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#191410"/><circle cx="16" cy="16" r="6" fill="none" stroke="#E89B6D" stroke-width="2.5"/></svg>`,
          ),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ClaroProvider>
      <Outlet />
      <Toaster
        position="bottom-right"
        toastOptions={{
          // Toasts are paper too — never sonner's default white-on-grey.
          classNames: {
            toast: "surface text-sm text-foreground",
            title: "font-medium",
            description: "text-muted-foreground",
            actionButton: "btn btn-sm btn-primary",
            cancelButton: "btn btn-sm btn-quiet",
          },
        }}
      />
    </ClaroProvider>
  );
}

function CenteredNotice({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 sm:px-6">
      <div className="paper-page w-full max-w-md p-7 sm:p-9">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-3 text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-7 flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <CenteredNotice
      eyebrow="Not found"
      title="There's nothing here."
      body="That page isn't part of Claro. Everything lives in one of three places."
    >
      <Link
        to="/today"
        className="btn btn-primary"
      >
        Go to Daily
      </Link>
      <Link
        to="/quarter"
        className="btn btn-quiet"
      >
        Go to Quarter
      </Link>
    </CenteredNotice>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <CenteredNotice
      eyebrow="Something broke"
      title="Claro hit a snag."
      body={error.message || "An unexpected error occurred. Your saved data is untouched."}
    >
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="btn btn-primary"
      >
        Try again
      </button>
      <a
        href="/today"
        className="btn btn-quiet"
      >
        Reload Today
      </a>
    </CenteredNotice>
  );
}
