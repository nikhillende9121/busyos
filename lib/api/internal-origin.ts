// The cookie->bearer proxy routes (app/api/proxy/v1 and
// app/api/proxy/super-admin) forward to /api/v1/** on this same Next.js
// process. That call must stay a loopback hit — using request.nextUrl.origin
// instead would target whatever Host header the reverse proxy (nginx, etc.)
// forwarded, which behind a reverse proxy is the public hostname, not this
// process. That turns an in-process fetch into a real round trip back out
// through the proxy, which breaks or times out depending on the proxy's
// Host/redirect config. A fixed loopback origin has no dependency on any
// proxy in front of this server.
export function getInternalOrigin(): string {
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}
