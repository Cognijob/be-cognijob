import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { bookmarkParamsSchema } from "./bookmarks.schemas.js";

export const bookmarkRouter = Router();

const bookmarkListSelect = {
  bookmarkId: schema.bookmarks.bookmarkId,
  jobId: schema.bookmarks.jobId,
  bookmarkedAt: schema.bookmarks.bookmarkedAt,
  title: schema.jobListings.title,
  location: schema.jobListings.location,
  employmentType: schema.jobListings.employmentType,
  category: schema.jobListings.category,
  salaryRange: schema.jobListings.salaryRange,
  status: schema.jobListings.status,
  companyId: schema.companies.companyId,
  companyName: schema.companies.companyName
};

const ensureJobExists = async (jobId: string) => {
  const [job] = await db
    .select({
      jobId: schema.jobListings.jobId
    })
    .from(schema.jobListings)
    .where(eq(schema.jobListings.jobId, jobId));

  if (!job) {
    throw new HttpError(404, "Job not found");
  }
};

/**
 * @swagger
 * /bookmarks:
 *   get:
 *     tags: [Bookmarks]
 *     summary: List current job seeker bookmarks
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bookmarks fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only job seekers can access this resource
 */
bookmarkRouter.get("/", authenticate, authorize("job_seeker"), async (req, res, next) => {
  try {
    const bookmarks = await db
      .select(bookmarkListSelect)
      .from(schema.bookmarks)
      .innerJoin(schema.jobListings, eq(schema.jobListings.jobId, schema.bookmarks.jobId))
      .innerJoin(schema.companies, eq(schema.companies.companyId, schema.jobListings.companyId))
      .where(eq(schema.bookmarks.userId, req.user!.userId))
      .orderBy(desc(schema.bookmarks.bookmarkedAt));

    return res.json(successResponse("Bookmarks fetched successfully", bookmarks));
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /bookmarks/{jobId}:
 *   post:
 *     tags: [Bookmarks]
 *     summary: Bookmark a job listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job id
 *     responses:
 *       201:
 *         description: Job bookmarked successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only job seekers can access this resource
 *       404:
 *         description: Job not found
 *       409:
 *         description: Job is already bookmarked
 */
bookmarkRouter.post(
  "/:jobId",
  authenticate,
  authorize("job_seeker"),
  validate({ params: bookmarkParamsSchema }),
  async (req, res, next) => {
    try {
      const { jobId } = req.params as { jobId: string };

      await ensureJobExists(jobId);

      const [existingBookmark] = await db
        .select({
          bookmarkId: schema.bookmarks.bookmarkId
        })
        .from(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.jobId, jobId),
            eq(schema.bookmarks.userId, req.user!.userId)
          )
        );

      if (existingBookmark) {
        throw new HttpError(409, "Job is already bookmarked");
      }

      const [bookmark] = await db
        .insert(schema.bookmarks)
        .values({
          jobId,
          userId: req.user!.userId
        })
        .returning();

      return res.status(201).json(successResponse("Job bookmarked successfully", bookmark));
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @swagger
 * /bookmarks/{jobId}:
 *   delete:
 *     tags: [Bookmarks]
 *     summary: Remove a bookmarked job listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job id
 *     responses:
 *       200:
 *         description: Bookmark removed successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only job seekers can access this resource
 *       404:
 *         description: Bookmark not found
 */
bookmarkRouter.delete(
  "/:jobId",
  authenticate,
  authorize("job_seeker"),
  validate({ params: bookmarkParamsSchema }),
  async (req, res, next) => {
    try {
      const { jobId } = req.params as { jobId: string };

      const [existingBookmark] = await db
        .select({
          bookmarkId: schema.bookmarks.bookmarkId
        })
        .from(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.jobId, jobId),
            eq(schema.bookmarks.userId, req.user!.userId)
          )
        );

      if (!existingBookmark) {
        throw new HttpError(404, "Bookmark not found");
      }

      await db.delete(schema.bookmarks).where(eq(schema.bookmarks.bookmarkId, existingBookmark.bookmarkId));

      return res.json(successResponse("Bookmark removed successfully"));
    } catch (error) {
      return next(error);
    }
  }
);
