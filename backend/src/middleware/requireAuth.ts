import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).user = { id: 1, teamId: 1, role: "manager" };
  next();
}
