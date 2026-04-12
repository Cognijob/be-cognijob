import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { companyRouter } from "./companies.routes.js";
import { jobRouter } from "./jobs.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/", companyRouter);
apiRouter.use("/jobs", jobRouter);
