export const DEMO_CANONICAL_ORIGIN = "https://demo.chartstead.com";
export const DEMO_LEGACY_HOST = "chartstead-demo.mayberrydt.workers.dev";

export function redirectLegacyDemoHost(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== DEMO_LEGACY_HOST) {
    return null;
  }

  const target = new URL(`${url.pathname}${url.search}`, DEMO_CANONICAL_ORIGIN);
  return Response.redirect(target.toString(), 308);
}

export function isDemoWorkerPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/mcp" ||
    pathname.startsWith("/mcp/")
  );
}
