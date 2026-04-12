import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error.js";
import { verifyAccessToken } from "../lib/jwt.js";

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Authentication required"));
  }

  try {
    const token = authHeader.split(" ")[1];
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }
};