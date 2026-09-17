import { describe, it, expect, vi } from "vitest";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { planRequestSchema, approvalDecisionSchema } from "../validation/schemas.js";

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireAuth", () => {
  const middleware = requireAuth("correct-token-1234567890");

  it("rejects a request with no Authorization header", () => {
    const req: any = { header: () => undefined };
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a wrong token", () => {
    const req: any = { header: () => "Bearer wrong-token" };
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token of a different length without throwing (timing-safe compare guard)", () => {
    const req: any = { header: () => "Bearer short" };
    const res = mockRes();
    const next = vi.fn();
    expect(() => middleware(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts the correct token", () => {
    const req: any = { header: () => "Bearer correct-token-1234567890" };
    const res = mockRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("validateBody", () => {
  it("rejects an empty plan-request text with a readable detail message", () => {
    const req: any = { body: { text: "" } };
    const res = mockRes();
    const next = vi.fn();
    validateBody(planRequestSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.arrayContaining([expect.stringContaining("text")]) })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an approval decision outside the enum", () => {
    const req: any = { body: { decision: "maybe" } };
    const res = mockRes();
    const next = vi.fn();
    validateBody(approvalDecisionSchema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes valid input through to next() with parsed body", () => {
    const req: any = { body: { text: "check https://example.com" } };
    const res = mockRes();
    const next = vi.fn();
    validateBody(planRequestSchema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ text: "check https://example.com" });
  });
});
