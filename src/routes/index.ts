// src/routes/index.ts
import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { bookmarkRouter } from "./bookmarks.routes.js";
import { companyRouter } from "./companies.routes.js";
import { jobRouter } from "./jobs.routes.js";
import { applicationRouter, jobApplicantsRouter } from "./applications.routes.js";
import { userRouter } from "./users.routes.js";
import { publicJobRouter } from "./public-jobs.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/", companyRouter);
apiRouter.use("/jobs", jobRouter);
apiRouter.use("/jobs", jobApplicantsRouter);
apiRouter.use("/applications", applicationRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/bookmarks", bookmarkRouter);
apiRouter.use("/", publicJobRouter);
