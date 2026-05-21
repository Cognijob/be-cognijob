import { HttpError } from "../lib/http-error.js";
export const validate = (schemas) => {
    return (req, _res, next) => {
        try {
            if (schemas.body)
                req.body = schemas.body.parse(req.body);
            if (schemas.params)
                req.params = schemas.params.parse(req.params);
            if (schemas.query) {
                const parsedQuery = schemas.query.parse(req.query);
                Object.defineProperty(req, "query", {
                    value: parsedQuery,
                    writable: true,
                    configurable: true
                });
            }
            return next();
        }
        catch (error) {
            return next(new HttpError(400, "Validation failed", error));
        }
    };
};
