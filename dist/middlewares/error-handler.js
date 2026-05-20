import { z } from "zod";
import { logger } from "../lib/logger.js";
import { HttpError } from "../lib/http-error.js";
import { errorResponse } from "../lib/api-response.js";
export const errorHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
        return res.status(error.statusCode).json(errorResponse(error.message, error.details));
    }
    if (error instanceof z.ZodError) {
        return res.status(400).json(errorResponse("Validation failed", error.flatten()));
    }
    logger.error({ err: error }, "Unhandled error");
    return res.status(500).json(errorResponse("Internal server error"));
};
