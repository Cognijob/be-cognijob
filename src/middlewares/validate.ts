import type { NextFunction, Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { z } from "zod";
import type { ParsedQs } from "qs";
import { HttpError } from "../lib/http-error.js";

type ZodTypeAny = z.ZodTypeAny;

interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as ParamsDictionary;
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query) as ParsedQs;

        Object.defineProperty(req, "query", {
          value: parsedQuery,
          writable: true,
          configurable: true
        });
      }
      return next();
    } catch (error) {
      return next(new HttpError(400, "Validation failed", error));
    }
  };
};
