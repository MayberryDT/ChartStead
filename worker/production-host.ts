export const PRODUCTION_CANONICAL_ORIGIN = "https://app.chartstead.com";
export const PRODUCTION_LEGACY_HOST = "chartstead.mayberrydt.workers.dev";

export function redirectLegacyProductionHost(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== PRODUCTION_LEGACY_HOST) {
    return null;
  }

  const target = new URL(`${url.pathname}${url.search}`, PRODUCTION_CANONICAL_ORIGIN);
  return Response.redirect(target.toString(), 308);
}

export function isProductionWorkerPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/mcp" ||
    pathname.startsWith("/mcp/")
  );
}
