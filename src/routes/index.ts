import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { companyRouter } from "./companies.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/", companyRouter);