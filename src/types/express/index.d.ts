import { JwtPayload } from "../jwt";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {}; // ensures it's treated as a module
