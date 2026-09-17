import { describe, it, expect } from "vitest";
import { assertPublicUrl } from "../tools/ssrfGuard.js";

describe("assertPublicUrl", () => {
  // dns.lookup on a literal IP address resolves without any real DNS query,
  // so these exercise the private-range check with no network dependency.
  it("rejects the AWS/GCP/Azure metadata endpoint (169.254.169.254)", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/private\/internal/);
  });

  it("rejects a literal private-range IPv4 address (10.x)", async () => {
    await expect(assertPublicUrl("http://10.1.2.3/")).rejects.toThrow(/private\/internal/);
  });

  it("rejects a literal 192.168.x address", async () => {
    await expect(assertPublicUrl("http://192.168.1.1/")).rejects.toThrow(/private\/internal/);
  });

  it("rejects loopback by hostname before even resolving DNS", async () => {
    await expect(assertPublicUrl("http://localhost/")).rejects.toThrow(/not allowed/);
  });

  it("rejects a literal loopback IPv6 address", async () => {
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(/not allowed|private\/internal/);
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/Only http/);
  });

  it("allows a plausible public IPv4 address through (no rejection)", async () => {
    await expect(assertPublicUrl("http://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });
});
