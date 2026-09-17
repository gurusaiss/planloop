import type { NextFunction, Request, Response } from "express";

/**
 * Express 4 does not catch rejected promises from async route handlers —
 * an unhandled throw inside one hangs the request instead of producing a
 * response. Every async route in this app is wrapped with this so errors
 * reach the centralized error handler in index.ts instead.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
