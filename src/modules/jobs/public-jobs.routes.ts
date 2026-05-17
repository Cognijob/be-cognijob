// src/modules/jobs/public-jobs.routes.ts
// Endpoint job untuk publik (job seeker browse).
// Recruiter CRUD sudah ada di jobs.routes.ts — file ini tidak mengubahnya.

import { and, asc, count, desc, eq, gt, ilike, isNull, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { validate } from "../../middlewares/validate.js";

export const publicJobRouter = Router();

const publicJobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  location: z.string().optional(),
  category: z.string().optional(),
  employment_type: z.string().optional(),
  sort: z.enum(["created_at", "expires_at"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc")
});

const publicJobParamsSchema = z.object({ id: z.string().uuid() });

const publicJobSelect = {
  jobId: schema.jobListings.jobId,
  companyId: schema.jobListings.companyId,
  companyName: schema.companies.companyName,
  companyIndustry: schema.companies.industry,
  companyLocation: schema.companies.location,
  workplaceTag: schema.companies.workplaceTag,
  title: schema.jobListings.title,
  description: schema.jobListings.description,
  requirements: schema.jobListings.requirements,
  employmentType: schema.jobListings.employmentType,
  location: schema.jobListings.location,
  category: schema.jobListings.category,
  salaryRange: schema.jobListings.salaryRange,
  status: schema.jobListings.status,
  createdAt: schema.jobListings.createdAt,
  expiresAt: schema.jobListings.expiresAt
};

/**
 * @swagger
 * /public/jobs:
 *   get:
 *     tags: [Public Jobs]
 *     summary: Browse published job listings
 *     description: Public endpoint — no authentication required. Returns only published, non-expired jobs.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by title, description, or category
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: employment_type
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [created_at, expires_at], default: created_at }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Jobs fetched successfully
 */
publicJobRouter.get(
  "/",
  validate({ query: publicJobQuerySchema }),
  async (req, res, next) => {
    try {
      const { page, limit, search, location, category, employment_type, sort, order } =
        req.query as unknown as z.infer<typeof publicJobQuerySchema>;
      const offset = (page - 1) * limit;

      const filters = [
        eq(schema.jobListings.status, "published"),
        // Exclude expired jobs
        or(
          isNull(schema.jobListings.expiresAt),
          gt(schema.jobListings.expiresAt, new Date())
        ),
        search
          ? or(
              ilike(schema.jobListings.title, `%${search}%`),
              ilike(schema.jobListings.description, `%${search}%`),
              ilike(schema.jobListings.category, `%${search}%`)
            )
          : undefined,
        location ? ilike(schema.jobListings.location, `%${location}%`) : undefined,
        category ? ilike(schema.jobListings.category, `%${category}%`) : undefined,
        employment_type ? eq(schema.jobListings.employmentType, employment_type) : undefined
      ].filter((f): f is NonNullable<typeof f> => Boolean(f));

      const whereClause = and(...filters);
      const sortCol =
        sort === "expires_at" ? schema.jobListings.expiresAt : schema.jobListings.createdAt;
      const orderDir = order === "asc" ? asc(sortCol) : desc(sortCol);

      const [jobs, [{ total }]] = await Promise.all([
        db
          .select(publicJobSelect)
          .from(schema.jobListings)
          .innerJoin(
            schema.companies,
            eq(schema.companies.companyId, schema.jobListings.companyId)
          )
          .where(whereClause)
          .orderBy(orderDir)
          .limit(limit)
          .offset(offset),

        db
          .select({ total: count() })
          .from(schema.jobListings)
          .where(whereClause)
      ]);

      const totalPages = Math.ceil(Number(total) / limit);

      return res.json(
        successResponse("Jobs fetched successfully", {
          jobs,
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

/**
 * @swagger
 * /public/jobs/{id}:
 *   get:
 *     tags: [Public Jobs]
 *     summary: Get a published job detail
 *     description: Public endpoint — no authentication required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Job fetched successfully
 *       404:
 *         description: Job not found
 */
publicJobRouter.get(
  "/:id",
  validate({ params: publicJobParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const [job] = await db
        .select(publicJobSelect)
        .from(schema.jobListings)
        .innerJoin(schema.companies, eq(schema.companies.companyId, schema.jobListings.companyId))
        .where(
          and(eq(schema.jobListings.jobId, id), eq(schema.jobListings.status, "published"))
        );

      if (!job) throw new HttpError(404, "Job not found");

      return res.json(successResponse("Job fetched successfully", job));
    } catch (error) {
      return next(error);
    }
  }
);
