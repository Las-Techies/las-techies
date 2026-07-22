import type { Request, Response, NextFunction } from "express";

// requireAuth runs first and attaches req.user = { id, teamId, role }, so
// this just gate-keeps by role. Manager-only mutation routes (quiz
// generation/publishing, document uploads/imports) use this to stop a
// new_hire from hitting them directly, not just hiding the buttons in the UI.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user?.role || !roles.includes(user.role)) {
      return res.status(403).json({
        error: { message: `This action requires one of these roles: ${roles.join(", ")}` },
      });
    }
    next();
  };
}
