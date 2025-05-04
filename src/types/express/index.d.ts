import { JwtPayload } from "../../../middlewares/requireAuth";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {}; // <--- REQUIRED so it's treated as a module
