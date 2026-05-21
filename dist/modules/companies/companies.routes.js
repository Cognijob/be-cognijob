import { Router } from "express";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { ensureRecruiterCompanyMembership } from "../../lib/access.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { updateCompanyProfileSchema } from "./companies.schemas.js";
export const companyRouter = Router();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const companyIdParamsSchema = z.object({ companyId: z.uuid() });
const publicCompanyQuerySchema = z.object({
    search: z.string().optional(),
    industry: z.string().optional(),
    location: z.string().optional(),
    size: z.string().optional(), // contoh: "500 - 1.000"
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
// Select lengkap untuk company (termasuk field baru dari migration 0001)
const companyPublicSelect = {
    companyId: schema.companies.companyId,
    companyName: schema.companies.companyName,
    industry: schema.companies.industry,
    location: schema.companies.location,
    workplaceTag: schema.companies.workplaceTag,
    description: schema.companies.description,
    website: schema.companies.website,
    contactEmail: schema.companies.contactEmail,
    foundedAt: schema.companies.foundedAt,
    employeeCount: schema.companies.employeeCount,
};
// ─── GET /companies ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /companies:
 *   get:
 *     tags: [Companies]
 *     summary: List companies (public — for browse & recruiter registration)
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by company name
 *       - in: query
 *         name: industry
 *         schema: { type: string }
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *       - in: query
 *         name: size
 *         schema: { type: string }
 *         description: Filter berdasarkan employee_count (partial match)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Companies fetched successfully
 */
companyRouter.get("/companies", validate({ query: publicCompanyQuerySchema }), async (req, res, next) => {
    try {
        const { search, industry, location, size, page, limit } = req.query;
        const offset = (page - 1) * limit;
        const filters = [
            search ? ilike(schema.companies.companyName, `%${search}%`) : undefined,
            industry ? ilike(schema.companies.industry, `%${industry}%`) : undefined,
            location ? ilike(schema.companies.location, `%${location}%`) : undefined,
            size ? ilike(schema.companies.employeeCount, `%${size}%`) : undefined,
        ].filter((f) => Boolean(f));
        const whereClause = filters.length > 0 ? and(...filters) : undefined;
        const [companies, [{ total }]] = await Promise.all([
            db
                .select({
                ...companyPublicSelect,
                // Hitung follower count sekalian untuk tampilan list
                followerCount: sql `(
              SELECT COUNT(*) FROM "company_follows"
              WHERE "company_follows"."company_id" = ${schema.companies.companyId}
            )`,
            })
                .from(schema.companies)
                .where(whereClause)
                .orderBy(desc(schema.companies.createdAt))
                .limit(limit)
                .offset(offset),
            db
                .select({ total: count() })
                .from(schema.companies)
                .where(whereClause),
        ]);
        const totalPages = Math.ceil(Number(total) / limit);
        return res.json(successResponse("Companies fetched successfully", {
            companies,
            pagination: {
                page, limit,
                total: Number(total),
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /companies/:companyId/public ─────────────────────────────────────────
/**
 * @swagger
 * /companies/{companyId}/public:
 *   get:
 *     tags: [Companies]
 *     summary: Get public company detail (for job seeker)
 *     description: |
 *       Mengembalikan detail perusahaan beserta:
 *       - Lowongan terbaru (maks 5, status published)
 *       - Follower count
 *       - Rating rata-rata
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Company detail fetched successfully
 *       404:
 *         description: Company not found
 */
companyRouter.get("/companies/:companyId/public", validate({ params: companyIdParamsSchema }), async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const [company] = await db
            .select(companyPublicSelect)
            .from(schema.companies)
            .where(eq(schema.companies.companyId, companyId));
        if (!company)
            throw new HttpError(404, "Company not found");
        // Lowongan terbaru (maks 5, published)
        const recentJobs = await db
            .select({
            jobId: schema.jobListings.jobId,
            title: schema.jobListings.title,
            location: schema.jobListings.location,
            employmentType: schema.jobListings.employmentType,
            level: schema.jobListings.level,
            salaryRange: schema.jobListings.salaryRange,
            createdAt: schema.jobListings.createdAt,
            expiresAt: schema.jobListings.expiresAt,
        })
            .from(schema.jobListings)
            .where(and(eq(schema.jobListings.companyId, companyId), eq(schema.jobListings.status, "published")))
            .orderBy(desc(schema.jobListings.createdAt))
            .limit(5);
        // Follower count & avg rating secara paralel
        const [[{ followerCount }], ratingRows] = await Promise.all([
            db
                .select({ followerCount: count() })
                .from(schema.companyFollows)
                .where(eq(schema.companyFollows.companyId, companyId)),
            db
                .select({ avgRating: sql `AVG(${schema.workplaceRatings.ratingScore})` })
                .from(schema.workplaceRatings)
                .where(eq(schema.workplaceRatings.companyId, companyId)),
        ]);
        const avgRating = ratingRows[0]?.avgRating
            ? Number(Number(ratingRows[0].avgRating).toFixed(1))
            : null;
        return res.json(successResponse("Company detail fetched successfully", {
            ...company,
            followerCount: Number(followerCount),
            avgRating,
            recentJobs,
        }));
    }
    catch (error) {
        return next(error);
    }
});
/**
 * @swagger
 * /company/profile:
 *   get:
 *     tags: [Companies]
 *     summary: Get current recruiter company profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company profile fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Recruiter is not assigned to any company
 *       404:
 *         description: Company profile not found
 */
companyRouter.get("/company/profile", authenticate, authorize("recruiter"), async (req, res, next) => {
    try {
        const membership = await ensureRecruiterCompanyMembership(req.user.userId);
        const [company] = await db
            .select()
            .from(schema.companies)
            .where(eq(schema.companies.companyId, membership.companyId));
        if (!company) {
            throw new HttpError(404, "Company profile not found");
        }
        return res.json(successResponse("Company profile fetched successfully", company));
    }
    catch (error) {
        return next(error);
    }
});
// ─── PUT /company/profile (recruiter) ────────────────────────────────────────
/**
 * @swagger
 * /company/profile:
 *   put:
 *     tags: [Companies]
 *     summary: Update current recruiter company profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:   { type: string, example: "Cognijob Labs" }
 *               industry:      { type: string, example: "Technology" }
 *               location:      { type: string, example: "Jakarta" }
 *               workplaceTag:  { type: string, example: "Inclusive" }
 *               description:   { type: string }
 *               website:       { type: string, example: "https://cognijob.com" }
 *               contactEmail:  { type: string, example: "hr@cognijob.com" }
 *               foundedAt:     { type: string, format: date, example: "2015-01-12" }
 *               employeeCount: { type: string, example: "500 - 1.000" }
 *     responses:
 *       200:
 *         description: Company profile updated successfully
 */
companyRouter.put("/company/profile", authenticate, authorize("recruiter"), validate({ body: updateCompanyProfileSchema }), async (req, res, next) => {
    try {
        const membership = await ensureRecruiterCompanyMembership(req.user.userId);
        await db
            .update(schema.companies)
            .set({ ...req.body, updatedAt: new Date() })
            .where(eq(schema.companies.companyId, membership.companyId));
        return res.json(successResponse("Company profile updated successfully"));
    }
    catch (error) {
        return next(error);
    }
});
// ─── POST /companies/:companyId/follow ────────────────────────────────────────
/**
 * @swagger
 * /companies/{companyId}/follow:
 *   post:
 *     tags: [Companies]
 *     summary: Follow a company (job seeker)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Company followed successfully
 *       409:
 *         description: Already following this company
 *       404:
 *         description: Company not found
 */
companyRouter.post("/companies/:companyId/follow", authenticate, authorize("job_seeker"), validate({ params: companyIdParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { companyId } = req.params;
        const [company] = await db
            .select({ companyId: schema.companies.companyId, companyName: schema.companies.companyName })
            .from(schema.companies)
            .where(eq(schema.companies.companyId, companyId));
        if (!company)
            throw new HttpError(404, "Company not found");
        const [existing] = await db
            .select({ followId: schema.companyFollows.followId })
            .from(schema.companyFollows)
            .where(and(eq(schema.companyFollows.companyId, companyId), eq(schema.companyFollows.userId, userId)));
        if (existing)
            throw new HttpError(409, "You are already following this company");
        const [follow] = await db
            .insert(schema.companyFollows)
            .values({ companyId, userId })
            .returning();
        const [{ followerCount }] = await db
            .select({ followerCount: count() })
            .from(schema.companyFollows)
            .where(eq(schema.companyFollows.companyId, companyId));
        return res.status(201).json(successResponse("Company followed successfully", {
            followId: follow.followId,
            companyId,
            companyName: company.companyName,
            followedAt: follow.followedAt,
            followerCount: Number(followerCount),
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── DELETE /companies/:companyId/follow ─────────────────────────────────────
/**
 * @swagger
 * /companies/{companyId}/follow:
 *   delete:
 *     tags: [Companies]
 *     summary: Unfollow a company (job seeker)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Company unfollowed successfully
 *       404:
 *         description: Not following this company
 */
companyRouter.delete("/companies/:companyId/follow", authenticate, authorize("job_seeker"), validate({ params: companyIdParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { companyId } = req.params;
        const [existing] = await db
            .select({ followId: schema.companyFollows.followId })
            .from(schema.companyFollows)
            .where(and(eq(schema.companyFollows.companyId, companyId), eq(schema.companyFollows.userId, userId)));
        if (!existing)
            throw new HttpError(404, "You are not following this company");
        await db
            .delete(schema.companyFollows)
            .where(and(eq(schema.companyFollows.companyId, companyId), eq(schema.companyFollows.userId, userId)));
        const [{ followerCount }] = await db
            .select({ followerCount: count() })
            .from(schema.companyFollows)
            .where(eq(schema.companyFollows.companyId, companyId));
        return res.json(successResponse("Company unfollowed successfully", {
            companyId,
            followerCount: Number(followerCount),
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /companies/:companyId/follow ─────────────────────────────────────────
/**
 * @swagger
 * /companies/{companyId}/follow:
 *   get:
 *     tags: [Companies]
 *     summary: Check follow status (job seeker)
 *     description: Cek apakah user sudah follow + total follower perusahaan.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Follow status fetched
 *         content:
 *           application/json:
 *             example:
 *               data: { isFollowing: true, followerCount: 42 }
 */
companyRouter.get("/companies/:companyId/follow", authenticate, authorize("job_seeker"), validate({ params: companyIdParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { companyId } = req.params;
        const [[existing], [{ followerCount }]] = await Promise.all([
            db
                .select({ followId: schema.companyFollows.followId })
                .from(schema.companyFollows)
                .where(and(eq(schema.companyFollows.companyId, companyId), eq(schema.companyFollows.userId, userId))),
            db
                .select({ followerCount: count() })
                .from(schema.companyFollows)
                .where(eq(schema.companyFollows.companyId, companyId)),
        ]);
        return res.json(successResponse("Follow status fetched", {
            isFollowing: Boolean(existing),
            followerCount: Number(followerCount),
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /follows/companies ───────────────────────────────────────────────────
/**
 * @swagger
 * /follows/companies:
 *   get:
 *     tags: [Companies]
 *     summary: Get all companies followed by the current job seeker
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Followed companies fetched successfully
 */
companyRouter.get("/follows/companies", authenticate, authorize("job_seeker"), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const rows = await db
            .select({
            followId: schema.companyFollows.followId,
            followedAt: schema.companyFollows.followedAt,
            companyId: schema.companies.companyId,
            companyName: schema.companies.companyName,
            industry: schema.companies.industry,
            location: schema.companies.location,
        })
            .from(schema.companyFollows)
            .innerJoin(schema.companies, eq(schema.companyFollows.companyId, schema.companies.companyId))
            .where(eq(schema.companyFollows.userId, userId))
            .orderBy(desc(schema.companyFollows.followedAt));
        return res.json(successResponse("Followed companies fetched successfully", { companies: rows }));
    }
    catch (error) {
        return next(error);
    }
});
