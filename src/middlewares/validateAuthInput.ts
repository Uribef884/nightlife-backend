import { RequestHandler } from "express";
import { authSchemaLogin } from "../schemas/auth.schema";


export const validateAuthInput: () => RequestHandler = () => {
  return (req, res, next) => {
    const result = authSchemaLogin.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: "Invalid input",
        details: result.error.flatten(),
      });
      return; // ✅ return void — satisfies Express
    }

    req.body = result.data;
    return next(); // ✅ return void — still OK
  };
};