// src/modules/ratings/ratings.routes.ts
import { and, avg, count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";

export const ratingRouter = Router();

const createRatingSchema = z.object({
  companyId: z.uuid("companyId must be a valid UUID"),
  ratingScore: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional()
});

const ratingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const companyParamsSchema = z.object({ id: z.uuid() });

// ─── POST /ratings ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /ratings:
 *   post:
 *     tags: [Ratings]
 *     summary: Submit a workplace rating
 *     description: Job seeker can only rate companies they have previously applied to. One rating per company.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, ratingScore]
 *             properties:
 *               companyId:
 *                 type: string
 *                 format: uuid
 *               ratingScore:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               review:
 *                 type: string
 *                 example: Great workplace culture and transparent hiring process.
 *     responses:
 *       201:
 *         description: Rating submitted successfully
 *       403:
 *         description: You can only rate companies you have applied to
 *       409:
 *         description: You have already rated this company
 */
ratingRouter.post(
  "/",
  authenticate,
  authorize("job_seeker"),
  validate({ body: createRatingSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { companyId, ratingScore, review } = req.body as z.infer<typeof createRatingSchema>;

      // Cek company ada
      const [company] = await db
        .select({ companyId: schema.companies.companyId, companyName: schema.companies.companyName })
        .from(schema.companies)
        .where(eq(schema.companies.companyId, companyId));

      if (!company) throw new HttpError(404, "Company not found");

      // Rule: hanya bisa rating jika pernah apply ke job company ini
      const [hasApplied] = await db
        .select({ applicationId: schema.jobApplications.applicationId })
        .from(schema.jobApplications)
        .innerJoin(
          schema.jobListings,
          eq(schema.jobApplications.jobId, schema.jobListings.jobId)
        )
        .where(
          and(
            eq(schema.jobApplications.userId, userId),
            eq(schema.jobListings.companyId, companyId)
          )
        )
        .limit(1);

      if (!hasApplied) {
        throw new HttpError(403, "You can only rate companies you have applied to");
      }

      // Anti-spam: satu rating per company
      const [existingRating] = await db
        .select({ ratingId: schema.workplaceRatings.ratingId })
        .from(schema.workplaceRatings)
        .where(
          and(
            eq(schema.workplaceRatings.companyId, companyId),
            eq(schema.workplaceRatings.userId, userId)
          )
        );

      if (existingRating) {
        throw new HttpError(409, "You have already rated this company");
      }

      const [rating] = await db
        .insert(schema.workplaceRatings)
        .values({ companyId, userId, ratingScore, review: review ?? null })
        .returning();

      return res.status(201).json(successResponse("Rating submitted successfully", rating));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /companies/:id/ratings ───────────────────────────────────────────────
/**
 * @swagger
 * /companies/{id}/ratings:
 *   get:
 *     tags: [Ratings]
 *     summary: Get workplace ratings for a company
 *     description: Public endpoint. Reviewer identity is always anonymous.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Ratings fetched successfully
 *       404:
 *         description: Company not found
 */
ratingRouter.get(
  "/companies/:id/ratings",
  validate({ params: companyParamsSchema, query: ratingQuerySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { page, limit } = req.query as unknown as z.infer<typeof ratingQuerySchema>;
      const offset = (page - 1) * limit;

      const [company] = await db
        .select({ companyName: schema.companies.companyName })
        .from(schema.companies)
        .where(eq(schema.companies.companyId, id));

      if (!company) throw new HttpError(404, "Company not found");

      const whereClause = eq(schema.workplaceRatings.companyId, id);

      const [ratings, [{ total }], [{ average }]] = await Promise.all([
        db
          .select({
            ratingId: schema.workplaceRatings.ratingId,
            ratingScore: schema.workplaceRatings.ratingScore,
            review: schema.workplaceRatings.review,
            createdAt: schema.workplaceRatings.createdAt
            // userId sengaja tidak di-select — reviewer selalu anonim
          })
          .from(schema.workplaceRatings)
          .where(whereClause)
          .orderBy(desc(schema.workplaceRatings.createdAt))
          .limit(limit)
          .offset(offset),

        db.select({ total: count() }).from(schema.workplaceRatings).where(whereClause),

        db
          .select({ average: avg(schema.workplaceRatings.ratingScore) })
          .from(schema.workplaceRatings)
          .where(whereClause)
      ]);

      const totalPages = Math.ceil(Number(total) / limit);

      return res.json(
        successResponse("Ratings fetched successfully", {
          companyId: id,
          companyName: company.companyName,
          averageRating: average ? parseFloat(Number(average).toFixed(2)) : null,
          totalRatings: Number(total),
          ratings,
          pagination: {
            page,
            limit,
            total: Number(total),
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);
