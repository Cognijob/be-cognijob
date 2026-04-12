import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { HttpError } from "../lib/http-error.js";

interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      return next();
    } catch (error) {
      return next(new HttpError(400, "Validation failed", error));
    }
  };
};
