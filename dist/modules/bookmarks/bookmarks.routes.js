// src/modules/bookmarks/bookmarks.routes.ts
// Endpoint bookmark job untuk job seeker.
//
// Routes:
//   POST   /bookmarks/:jobId   → Bookmark sebuah job
//   DELETE /bookmarks/:jobId   → Hapus bookmark
//   GET    /bookmarks          → Daftar semua job yang di-bookmark user
import { and, count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
export const bookmarkRouter = Router();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const jobIdParamsSchema = z.object({
    jobId: z.string().uuid("jobId must be a valid UUID"),
});
// ─── POST /bookmarks/:jobId ───────────────────────────────────────────────────
/**
 * @swagger
 * /bookmarks/{jobId}:
 *   post:
 *     tags: [Bookmarks]
 *     summary: Bookmark a job
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Job bookmarked successfully
 *       404:
 *         description: Job not found
 *       409:
 *         description: Job already bookmarked
 */
bookmarkRouter.post("/:jobId", authenticate, authorize("job_seeker"), validate({ params: jobIdParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { jobId } = req.params;
        // Cek job ada dan published
        const [job] = await db
            .select({
            jobId: schema.jobListings.jobId,
            title: schema.jobListings.title,
            status: schema.jobListings.status,
            companyName: schema.companies.companyName,
        })
            .from(schema.jobListings)
            .innerJoin(schema.companies, eq(schema.jobListings.companyId, schema.companies.companyId))
            .where(eq(schema.jobListings.jobId, jobId));
        if (!job)
            throw new HttpError(404, "Job not found");
        // Cek sudah di-bookmark
        const [existing] = await db
            .select({ bookmarkId: schema.bookmarks.bookmarkId })
            .from(schema.bookmarks)
            .where(and(eq(schema.bookmarks.jobId, jobId), eq(schema.bookmarks.userId, userId)));
        if (existing)
            throw new HttpError(409, "Job already bookmarked");
        const [bookmark] = await db
            .insert(schema.bookmarks)
            .values({ jobId, userId })
            .returning();
        return res.status(201).json(successResponse("Job bookmarked successfully", {
            bookmarkId: bookmark.bookmarkId,
            jobId,
            title: job.title,
            companyName: job.companyName,
            bookmarkedAt: bookmark.bookmarkedAt,
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── DELETE /bookmarks/:jobId ─────────────────────────────────────────────────
/**
 * @swagger
 * /bookmarks/{jobId}:
 *   delete:
 *     tags: [Bookmarks]
 *     summary: Remove a bookmark
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Bookmark removed successfully
 *       404:
 *         description: Bookmark not found
 */
bookmarkRouter.delete("/:jobId", authenticate, authorize("job_seeker"), validate({ params: jobIdParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { jobId } = req.params;
        const [existing] = await db
            .select({ bookmarkId: schema.bookmarks.bookmarkId })
            .from(schema.bookmarks)
            .where(and(eq(schema.bookmarks.jobId, jobId), eq(schema.bookmarks.userId, userId)));
        if (!existing)
            throw new HttpError(404, "Bookmark not found");
        await db
            .delete(schema.bookmarks)
            .where(and(eq(schema.bookmarks.jobId, jobId), eq(schema.bookmarks.userId, userId)));
        return res.json(successResponse("Bookmark removed successfully"));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /bookmarks ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /bookmarks:
 *   get:
 *     tags: [Bookmarks]
 *     summary: Get all bookmarked jobs
 *     description: Mengembalikan semua job yang di-bookmark job seeker, diurutkan terbaru.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bookmarks fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               data:
 *                 bookmarks:
 *                   - bookmarkId: "uuid"
 *                     jobId: "uuid"
 *                     title: "Senior Backend Engineer"
 *                     companyName: "TechVision Indonesia"
 *                     location: "Jakarta Selatan"
 *                     employmentType: "Full-time"
 *                     level: "Senior"
 *                     salaryRange: "Rp 18-28 Juta/Bulan"
 *                     status: "published"
 *                     expiresAt: "2026-06-01T00:00:00Z"
 *                     bookmarkedAt: "2026-04-20T08:00:00Z"
 *                 total: 1
 */
bookmarkRouter.get("/", authenticate, authorize("job_seeker"), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const [bookmarks, [{ total }]] = await Promise.all([
            db
                .select({
                bookmarkId: schema.bookmarks.bookmarkId,
                bookmarkedAt: schema.bookmarks.bookmarkedAt,
                jobId: schema.jobListings.jobId,
                title: schema.jobListings.title,
                employmentType: schema.jobListings.employmentType,
                location: schema.jobListings.location,
                category: schema.jobListings.category,
                level: schema.jobListings.level,
                salaryRange: schema.jobListings.salaryRange,
                status: schema.jobListings.status,
                expiresAt: schema.jobListings.expiresAt,
                companyId: schema.companies.companyId,
                companyName: schema.companies.companyName,
                industry: schema.companies.industry,
            })
                .from(schema.bookmarks)
                .innerJoin(schema.jobListings, eq(schema.bookmarks.jobId, schema.jobListings.jobId))
                .innerJoin(schema.companies, eq(schema.jobListings.companyId, schema.companies.companyId))
                .where(eq(schema.bookmarks.userId, userId))
                .orderBy(desc(schema.bookmarks.bookmarkedAt)),
            db
                .select({ total: count() })
                .from(schema.bookmarks)
                .where(eq(schema.bookmarks.userId, userId)),
        ]);
        return res.json(successResponse("Bookmarks fetched successfully", {
            bookmarks,
            total: Number(total),
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /bookmarks/:jobId/status ─────────────────────────────────────────────
/**
 * @swagger
 * /bookmarks/{jobId}/status:
 *   get:
 *     tags: [Bookmarks]
 *     summary: Check if a job is bookmarked
 *     description: Dipakai frontend untuk set state tombol bookmark (aktif/tidak).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Bookmark status checked
 *         content:
 *           application/json:
 *             example:
 *               data: { isBookmarked: true }
 */
bookmarkRouter.get("/:jobId/status", authenticate, authorize("job_seeker"), validate({ params: jobIdParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { jobId } = req.params;
        const [existing] = await db
            .select({ bookmarkId: schema.bookmarks.bookmarkId })
            .from(schema.bookmarks)
            .where(and(eq(schema.bookmarks.jobId, jobId), eq(schema.bookmarks.userId, userId)));
        return res.json(successResponse("Bookmark status checked", {
            isBookmarked: Boolean(existing),
        }));
    }
    catch (error) {
        return next(error);
    }
});
