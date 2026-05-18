// src/modules/jobs/recommended-jobs.routes.ts
// GET /public/jobs/recommended
//
// Mengembalikan maks 10 job yang relevan untuk job seeker yang sedang login.
//
// Algoritma (skill-based matching tanpa ML):
//   1. Ambil skills dari profil job seeker (comma/newline separated).
//   2. Cari job published & belum expired yang mengandung ≥1 skill di
//      title / requirements / description via ILIKE.
//   3. Urutkan berdasarkan relevance score:
//        title atau requirements match → bobot 2
//        description match             → bobot 1
//   4. Exclude job yang sudah pernah dilamar user.
//   5. Fallback ke job terbaru jika profil belum punya skills atau hasil kosong.
//
// Endpoint ini membutuhkan autentikasi (job_seeker).

import { and, desc, eq, gt, notInArray, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";

export const recommendedJobRouter = Router();

const recommendedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

// Select fields yang dikembalikan — sama dengan publicJobRouter
// ditambah `level` (field baru dari migration 0001)
const recommendedJobSelect = {
  jobId:           schema.jobListings.jobId,
  companyId:       schema.jobListings.companyId,
  companyName:     schema.companies.companyName,
  companyIndustry: schema.companies.industry,
  title:           schema.jobListings.title,
  employmentType:  schema.jobListings.employmentType,
  location:        schema.jobListings.location,
  category:        schema.jobListings.category,
  level:           schema.jobListings.level,
  salaryRange:     schema.jobListings.salaryRange,
  createdAt:       schema.jobListings.createdAt,
  expiresAt:       schema.jobListings.expiresAt,
};

/**
 * @swagger
 * /public/jobs/recommended:
 *   get:
 *     tags: [Public Jobs]
 *     summary: Get recommended jobs for the logged-in job seeker
 *     description: |
 *       Mengembalikan maks 10 job yang relevan berdasarkan skills profil job seeker.
 *       - Matching dilakukan terhadap title, requirements, dan description job.
 *       - Job yang sudah dilamar tidak akan muncul.
 *       - Fallback ke job terbaru jika profil belum memiliki skills.
 *       - Field `matchedBySkills` memberi tahu frontend apakah hasil berbasis
 *         skill match (true) atau sekedar job terbaru (false).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 20 }
 *     responses:
 *       200:
 *         description: Recommended jobs fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               data:
 *                 matchedBySkills: true
 *                 jobs:
 *                   - jobId: "uuid"
 *                     title: "Senior Backend Engineer"
 *                     companyName: "TechVision Indonesia"
 *                     level: "Senior"
 *                     location: "Jakarta Selatan"
 *                     salaryRange: "Rp 18-28 Juta/Bulan"
 */
recommendedJobRouter.get(
  "/",
  authenticate,
  authorize("job_seeker"),
  validate({ query: recommendedQuerySchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { limit } = req.query as unknown as z.infer<typeof recommendedQuerySchema>;

      // ── Ambil skills dari profil ───────────────────────────────────────────
      const [profile] = await db
        .select({ skills: schema.jobSeekerProfiles.skills })
        .from(schema.jobSeekerProfiles)
        .where(eq(schema.jobSeekerProfiles.userId, userId));

      // ── Job yang sudah dilamar → exclude dari hasil ────────────────────────
      const appliedRows = await db
        .select({ jobId: schema.jobApplications.jobId })
        .from(schema.jobApplications)
        .where(eq(schema.jobApplications.userId, userId));

      const appliedJobIds = appliedRows.map((r) => r.jobId);

      // ── Base filter: published + belum expired + belum dilamar ────────────
      const baseFilters = [
        eq(schema.jobListings.status, "published"),
        or(
          sql`${schema.jobListings.expiresAt} IS NULL`,
          gt(schema.jobListings.expiresAt, new Date())
        ),
        ...(appliedJobIds.length > 0
          ? [notInArray(schema.jobListings.jobId, appliedJobIds)]
          : []),
      ];

      // ── Parse skills (comma atau newline separated, maks 10 token) ─────────
      const rawSkills = profile?.skills ?? "";
      const skillTokens = rawSkills
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
        .slice(0, 10);

      let jobs: Record<string, unknown>[] = [];
      let matchedBySkills = false;

      if (skillTokens.length > 0) {
        // ── Skill-match mode ──────────────────────────────────────────────
        // OR filter: job mengandung minimal 1 skill
        const skillMatchFilter = or(
          ...skillTokens.flatMap((skill) => {
            const like = `%${skill}%`;
            return [
              sql`${schema.jobListings.title}        ILIKE ${like}`,
              sql`${schema.jobListings.requirements} ILIKE ${like}`,
              sql`${schema.jobListings.description}  ILIKE ${like}`,
            ];
          })
        );

        // Relevance score: jumlah match skill (title/req = 2pt, desc = 1pt)
        const scoreTerms = skillTokens.map(
          (skill) => sql`(
            CASE WHEN ${schema.jobListings.title}        ILIKE ${`%${skill}%`} THEN 2 ELSE 0 END +
            CASE WHEN ${schema.jobListings.requirements} ILIKE ${`%${skill}%`} THEN 2 ELSE 0 END +
            CASE WHEN ${schema.jobListings.description}  ILIKE ${`%${skill}%`} THEN 1 ELSE 0 END
          )`
        );

        const relevanceExpr = scoreTerms.reduce(
          (acc, curr) => sql`${acc} + ${curr}`,
          sql`0`
        );

        const rows = await db
          .select({
            ...recommendedJobSelect,
            relevanceScore: relevanceExpr,
          })
          .from(schema.jobListings)
          .innerJoin(
            schema.companies,
            eq(schema.companies.companyId, schema.jobListings.companyId)
          )
          .where(and(...baseFilters, skillMatchFilter))
          .orderBy(desc(relevanceExpr), desc(schema.jobListings.createdAt))
          .limit(limit);

        if (rows.length > 0) {
          jobs = rows as Record<string, unknown>[];
          matchedBySkills = true;
        }
      }

      // ── Fallback: tidak ada skills atau hasil skill-match kosong ──────────
      if (jobs.length === 0) {
        jobs = await db
          .select(recommendedJobSelect)
          .from(schema.jobListings)
          .innerJoin(
            schema.companies,
            eq(schema.companies.companyId, schema.jobListings.companyId)
          )
          .where(and(...baseFilters))
          .orderBy(desc(schema.jobListings.createdAt))
          .limit(limit);

        matchedBySkills = false;
      }

      return res.json(
        successResponse("Recommended jobs fetched successfully", {
          matchedBySkills,
          jobs,
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);