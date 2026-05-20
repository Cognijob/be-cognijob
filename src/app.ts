import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttpModule from "pino-http";
import swaggerUi from "swagger-ui-express";
import { logger } from "./lib/logger.js";
import { swaggerSpec } from "./lib/swagger.js";
import { errorHandler } from "./middlewares/error-handler.js";

// ── Auth ──────────────────────────────────────────────────────────────────────
import { authRouter } from "./modules/auth/auth.routes.js";

// ── Users / Profile ───────────────────────────────────────────────────────────
import { userRouter } from "./modules/users/users.routes.js";

// ── Jobs (recruiter CRUD) ─────────────────────────────────────────────────────
import { jobRouter } from "./modules/jobs/jobs.routes.js";

// ── Public Jobs (job seeker browse)
// ⚠ recommendedJobRouter HARUS di-mount SEBELUM publicJobRouter
//   agar path "/public/jobs/recommended" tidak salah di-parse sebagai "/:id"
import { recommendedJobRouter } from "./modules/jobs/recommended-jobs.routes.js";
import { publicJobRouter } from "./modules/jobs/public-jobs.routes.js";
import { publicStatsRouter } from "./modules/stats/public-stats.routes.js";

// ── Applications
// ⚠ applicationSummaryRouter HARUS di-mount SEBELUM applicationRouter
//   agar path "/applications/summary" tidak salah di-parse sebagai "/:id"
import { applicationSummaryRouter } from "./modules/applications/application-summary.routes.js";
import { applicationRouter, jobApplicantsRouter } from "./modules/applications/applications.routes.js";

// ── Bookmarks ─────────────────────────────────────────────────────────────────
import { bookmarkRouter } from "./modules/bookmarks/bookmarks.routes.js";

// ── Companies (termasuk follow endpoints) ─────────────────────────────────────
import { companyRouter } from "./modules/companies/companies.routes.js";

// ── Ratings ───────────────────────────────────────────────────────────────────
import { ratingRouter } from "./modules/ratings/ratings.routes.js";

// ── Notifications ─────────────────────────────────────────────────────────────
import { notificationRouter } from "./modules/notifications/notifications.routes.js";

// ── Messages / Conversations ──────────────────────────────────────────────────
import { conversationRouter } from "./modules/messages/conversations.routes.js";

// ─────────────────────────────────────────────────────────────────────────────

export const app = express();
const pinoHttp = pinoHttpModule.default ?? pinoHttpModule;

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Cognijob API is running" });
});

// ── API Docs ──────────────────────────────────────────────────────────────────
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// Urutan mount PENTING — specific/literal path harus sebelum parameterized path
// ─────────────────────────────────────────────────────────────────────────────

// Auth
app.use("/auth", authRouter);

// Users & profile
app.use("/users", userRouter);

// Jobs — recruiter CRUD (butuh auth recruiter)
app.use("/jobs", jobApplicantsRouter);
app.use("/jobs", jobRouter);

// Public jobs — job seeker browse (no auth required)
// "recommended" sebelum "/:id"
app.use("/public/jobs/recommended", recommendedJobRouter);
app.use("/public/jobs", publicJobRouter);
app.use("/public/stats", publicStatsRouter);

// Applications
// "summary" sebelum "/:id"
app.use("/applications/summary", applicationSummaryRouter);
app.use("/applications", applicationRouter);

// Bookmarks
app.use("/bookmarks", bookmarkRouter);

// Companies (list, detail publik, profil recruiter, follow/unfollow)
// Semua company routes ada di satu router — termasuk:
//   GET  /companies
//   GET  /companies/:companyId/public
//   GET  /companies/:companyId/follow
//   POST /companies/:companyId/follow
//   DEL  /companies/:companyId/follow
//   GET  /company/profile       (recruiter)
//   PUT  /company/profile       (recruiter)
//   GET  /follows/companies     (job seeker — daftar perusahaan yang di-follow)
app.use("/", companyRouter);

// Ratings
app.use("/ratings", ratingRouter);

// Notifications
app.use("/notifications", notificationRouter);

// Messages & conversations
app.use("/conversations", conversationRouter);

// ── Global error handler (harus paling bawah) ────────────────────────────────
app.use(errorHandler);