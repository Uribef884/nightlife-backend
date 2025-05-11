import { Request } from "express";
import { User } from "../entities/User";

export interface AuthenticatedRequest extends Request {
  user?: Pick<User, "id" | "role" | "email"> & { clubId?: string };
}
