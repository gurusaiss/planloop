import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/**
 * Validates req.body against a zod schema before the route handler runs.
 * Rejects with 400 + a readable message instead of letting a malformed
 * body reach the planner/engine/tools — see docs/SECURITY.md ("malicious
 * workflow definition" row).
 */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      });
    }
    req.body = result.data;
    next();
  };
}
