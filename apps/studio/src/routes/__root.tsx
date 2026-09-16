import { preferenceOptions } from "@/api/preferences";
import { ErrorState, LoadingState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { tr } from "@/lib/i18n";
import appCss from "@/styles.css?url";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: ({ context }) =>
      context.queryClient.ensureQueryData(preferenceOptions()),
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Synkinema Studio" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/png", href: "/brand/logo-32.png" },
        { rel: "manifest", href: "/manifest.json" },
        { rel: "apple-touch-icon", href: "/brand/logo-180.png" },
      ],
    }),
    pendingComponent: LoadingState,
    errorComponent: ({ error, reset }) => (
      <ErrorState
        error={error instanceof Error ? error : new Error(String(error))}
        retry={reset}
      />
    ),
    notFoundComponent: () => (
      <main className="p-12 text-center">
        <h1 className="mb-5 text-2xl">{tr("Page not found")}</h1>
        <Button asChild>
          <Link to="/projects">{tr("Back to projects")}</Link>
        </Button>
      </main>
    ),
    shellComponent: RootDocument,
  },
);
function RootDocument({ children }: { children: React.ReactNode }) {
  const preferences = Route.useLoaderData();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme={preferences?.theme || "system"}
          storageKey="synkinema-v2-theme"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
