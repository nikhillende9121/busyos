import { promises as dns } from "node:dns";
import { isIPv4 } from "node:net";
import { AppError } from "@/shared/errors/app-error";

// Blocks a tenant-supplied webhook URL from targeting internal
// infrastructure (SSRF) — see Docs/webhooks.md §7. Called at both
// endpoint-creation time and immediately before each delivery attempt
// (DNS rebinding: the same hostname can resolve differently between the
// two, so a check only at creation time isn't enough).
const PRIVATE_IPV4_RANGES: { start: number; end: number }[] = [
  ipRange("127.0.0.0", "127.255.255.255"), // loopback
  ipRange("10.0.0.0", "10.255.255.255"), // private
  ipRange("172.16.0.0", "172.31.255.255"), // private
  ipRange("192.168.0.0", "192.168.255.255"), // private
  ipRange("169.254.0.0", "169.254.255.255"), // link-local / cloud metadata
  ipRange("0.0.0.0", "0.255.255.255"), // "this network"
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function ipRange(start: string, end: string): { start: number; end: number } {
  return { start: ipToInt(start), end: ipToInt(end) };
}

function isPrivateIPv4(ip: string): boolean {
  const value = ipToInt(ip);
  return PRIVATE_IPV4_RANGES.some((range) => value >= range.start && value <= range.end);
}

// IPv6 loopback (::1) and link-local (fe80::/10) — the common cases;
// IPv4 covers the vast majority of real internal/cloud-metadata targets.
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("VALIDATION_ERROR", "url must be a valid URL");
  }

  const allowInsecureLocalhost = process.env.NODE_ENV !== "production" && parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !allowInsecureLocalhost) {
    throw new AppError("VALIDATION_ERROR", "url must use https://");
  }

  let addresses: string[];
  try {
    addresses = allowInsecureLocalhost ? ["127.0.0.1"] : (await dns.lookup(parsed.hostname, { all: true })).map((a) => a.address);
  } catch {
    throw new AppError("VALIDATION_ERROR", "url's hostname could not be resolved");
  }

  for (const address of addresses) {
    if (isIPv4(address) ? isPrivateIPv4(address) : isPrivateIPv6(address)) {
      if (allowInsecureLocalhost) continue;
      throw new AppError("VALIDATION_ERROR", "url resolves to a private or internal address, which is not allowed");
    }
  }
}
