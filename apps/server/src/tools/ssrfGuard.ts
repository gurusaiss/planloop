import dns from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

// IPv4 private/reserved ranges an outbound fetch tool should never reach,
// even when the *hostname* looks public but resolves to one of these
// (the gap a hostname-only blocklist leaves open — see docs/SECURITY.md).
const IPV4_BLOCKED_RANGES: [string, number][] = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, incl. cloud metadata endpoints
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["0.0.0.0", 8],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const target = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe80:") || // link-local
    lower.startsWith("fc") ||
    lower.startsWith("fd") // unique local
  );
}

/**
 * Resolves a URL's hostname and rejects it if it's a loopback/private/
 * link-local address — including the case where a public-looking hostname
 * (e.g. one under attacker control, or a DNS-rebinding setup) resolves to
 * an internal IP. Hostname-only blocking (checking for "localhost") misses
 * exactly this case, which is why this exists as a separate, stricter
 * layer used by every outbound-fetch tool.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  // URL.hostname keeps brackets around a literal IPv6 address (e.g.
  // "[::1]"), which never matches a bare "::1" in a blocklist or a
  // dns.lookup() call — that mismatch let a bracketed IPv6 loopback/private
  // literal slide past both checks below. Strip them once, up front, for
  // every check that follows. (Caught by ssrfGuard.test.ts.)
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("Fetching local/internal addresses is not allowed");
  }
  if (hostname.includes(":") && isBlockedIpv6(hostname)) {
    // A literal IPv6 address (not "::1"/"::", but still private/link-local)
    // — dns.lookup() on a literal IP is a same-process no-op, but checking
    // it directly here avoids depending on that and stays correct even if
    // resolution behavior changes.
    throw new Error(`Refusing to fetch ${hostname}: private/internal IPv6 literal`);
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    // A hostname that fails to resolve at all (including a malformed
    // literal our own checks above didn't already catch) will fail the
    // same way when the fetch itself runs — no need to special-case it.
    return parsed;
  }

  for (const { address, family } of records) {
    if (family === 4 && isBlockedIpv4(address)) {
      throw new Error(`Refusing to fetch ${hostname}: resolves to a private/internal address (${address})`);
    }
    if (family === 6 && isBlockedIpv6(address)) {
      throw new Error(`Refusing to fetch ${hostname}: resolves to a private/internal address (${address})`);
    }
  }

  return parsed;
}
