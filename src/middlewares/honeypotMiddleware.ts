import { Request, Response, NextFunction } from "express";

export function honeypotMiddleware(req: Request, res: Response, next: NextFunction) {
  const { confirm_password } = req.body;

  if (confirm_password) {
    // Silent rejection to trick bots
    res.status(200).json({ success: true });
    return;
  }

  next();
}