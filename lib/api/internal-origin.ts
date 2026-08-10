// The cookie->bearer proxy routes (app/api/proxy/v1 and
// app/api/proxy/super-admin) forward to /api/v1/** on this same Next.js
// deployment. Where that target should point depends on the runtime:
//
// - On Vercel, there is no long-running process listening on a local port
//   (each route is its own serverless invocation) — a loopback fetch always
//   ECONNREFUSEDs. VERCEL_URL is auto-populated by the platform and routed
//   back to this exact deployment through Vercel's own infrastructure, with
//   no hairpin/DNS round trip, which is why it's the platform-documented way
//   for one serverless function to call another on the same deployment.
// - Everywhere else (self-hosted, behind nginx or any reverse proxy),
//   request.nextUrl.origin would target whatever Host header the proxy
//   forwarded — the public hostname, not this process — turning an
//   in-process call into a real round trip back out through the proxy. A
//   fixed loopback origin has no dependency on any proxy's Host/redirect
//   config.
export function getInternalOrigin(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}
