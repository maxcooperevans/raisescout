/**
 * Lightweight access gate for the expensive (money-spending) write endpoints.
 *
 * v0 has no real auth. To keep a public portfolio deployment from letting
 * strangers burn the Anthropic budget, the two endpoints that trigger research
 * require a shared password (APP_ACCESS_PASSWORD), sent as the `x-access-key`
 * header. Viewing results stays open.
 *
 * If APP_ACCESS_PASSWORD is unset (e.g. local dev), the gate is disabled so the
 * app is frictionless to run locally.
 */
export const ACCESS_HEADER = "x-access-key";

export function accessGateEnabled(): boolean {
  return Boolean(process.env.APP_ACCESS_PASSWORD);
}

/** Returns true if the request is allowed to trigger paid work. */
export function hasAccess(req: Request): boolean {
  const expected = process.env.APP_ACCESS_PASSWORD;
  if (!expected) return true; // gate disabled
  return req.headers.get(ACCESS_HEADER) === expected;
}
