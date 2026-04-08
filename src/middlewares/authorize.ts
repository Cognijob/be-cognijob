import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../db/schema.js";
import { HttpError } from "../lib/http-error.js";

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "You do not have access to this resource"));
    }

    return next();
  };
};
