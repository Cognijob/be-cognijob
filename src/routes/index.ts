// src/routes/index.ts
import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { companyRouter } from "./companies.routes.js";
import { jobRouter } from "./jobs.routes.js";
import { publicJobRouter } from "../modules/jobs/public-jobs.routes.js";
import { applicationRouter } from "./applications.routes.js";
import { ratingRouter } from "../modules/ratings/ratings.routes.js";
import { notificationRouter } from "../modules/notifications/notifications.routes.js";
import { messageRouter } from "../modules/messages/message.routes.js";

export const apiRouter = Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────
apiRouter.use("/auth", authRouter);

// ─── Public job browse (no auth) ─────────────────────────────────────────────
apiRouter.use("/public/jobs", publicJobRouter);

// ─── Recruiter: job CRUD (existing, unchanged) ───────────────────────────────
apiRouter.use("/jobs", jobRouter);

// ─── Company profile (existing, unchanged) ───────────────────────────────────
apiRouter.use("/", companyRouter);

// ─── Applications (job seeker + recruiter) ───────────────────────────────────
// Note: /jobs/:jobId/applicants juga di-handle di applicationRouter
apiRouter.use("/applications", applicationRouter);
apiRouter.use("/", applicationRouter); // untuk /jobs/:jobId/applicants

// ─── Company ratings ─────────────────────────────────────────────────────────
apiRouter.use("/ratings", ratingRouter);
apiRouter.use("/", ratingRouter); // untuk /companies/:id/ratings

// ─── Notifications ────────────────────────────────────────────────────────────
apiRouter.use("/notifications", notificationRouter);

// ─── Messages & Conversations ────────────────────────────────────────────────
apiRouter.use("/", messageRouter);