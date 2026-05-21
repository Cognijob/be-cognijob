import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router } from "express";
import { db, schema } from "../../db/index.js";
import { ensureRecruiterCanAccessJob, ensureRecruiterCompanyMembership } from "../../lib/access.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { createJobSchema, jobParamsSchema, jobQuerySchema, updateJobSchema } from "./jobs.schemas.js";
export const jobRouter = Router();
const ensurePublishableJobPayload = (payload) => {
    const requiredFields = [
        { key: "title", label: "title", value: payload.title },
        { key: "description", label: "description", value: payload.description },
        { key: "requirements", label: "requirements", value: payload.requirements },
        { key: "employmentType", label: "employmentType", value: payload.employmentType },
        { key: "location", label: "location", value: payload.location },
        { key: "category", label: "category", value: payload.category }
    ];
    const missingFields = requiredFields
        .filter((field) => !field.value || field.value.trim().length === 0)
        .map((field) => field.label);
    if (missingFields.length > 0) {
        throw new HttpError(400, `Published jobs require complete data: ${missingFields.join(", ")}`);
    }
};
const jobSelect = {
    jobId: schema.jobListings.jobId,
    companyId: schema.jobListings.companyId,
    companyName: schema.companies.companyName,
    createdBy: schema.jobListings.createdBy,
    title: schema.jobListings.title,
    description: schema.jobListings.description,
    requirements: schema.jobListings.requirements,
    employmentType: schema.jobListings.employmentType,
    location: schema.jobListings.location,
    category: schema.jobListings.category,
    salaryRange: schema.jobListings.salaryRange,
    status: schema.jobListings.status,
    createdAt: schema.jobListings.createdAt,
    expiresAt: schema.jobListings.expiresAt,
    updatedAt: schema.jobListings.updatedAt
};
/**
 * @swagger
 * /jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Create a new job listing
 *     description: Create a job listing for the authenticated recruiter's company. Use `draft` to save partial data or `published` to create a ready-to-post job.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Frontend Developer
 *               description:
 *                 type: string
 *                 example: Build and maintain web features for our hiring platform.
 *               requirements:
 *                 type: string
 *                 example: React, TypeScript, REST API
 *               employmentType:
 *                 type: string
 *                 example: Full-time
 *               location:
 *                 type: string
 *                 example: Jakarta
 *               category:
 *                 type: string
 *                 example: Engineering
 *               salaryRange:
 *                 type: string
 *                 example: IDR 8,000,000 - 12,000,000
 *               status:
 *                 type: string
 *                 enum: [draft, published, closed]
 *                 example: draft
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-05-01T00:00:00.000Z
 *     responses:
 *       201:
 *         description: Job created successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only recruiters can create jobs
 */
jobRouter.post("/", authenticate, authorize("recruiter"), validate({ body: createJobSchema }), async (req, res, next) => {
    try {
        const membership = await ensureRecruiterCompanyMembership(req.user.userId);
        const payload = req.body;
        if (payload.status === "published") {
            ensurePublishableJobPayload(payload);
        }
        const [job] = await db
            .insert(schema.jobListings)
            .values({
            companyId: membership.companyId,
            createdBy: req.user.userId,
            ...payload
        })
            .returning();
        return res.status(201).json(successResponse(payload.status === "draft" ? "Job draft saved successfully" : "Job created successfully", job));
    }
    catch (error) {
        return next(error);
    }
});
/**
 * @swagger
 * /jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List recruiter job listings
 *     description: Retrieve job listings that belong to the authenticated recruiter company.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search jobs by title, description, or category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, closed]
 *         description: Filter jobs by status
 *     responses:
 *       200:
 *         description: Jobs fetched successfully
 *       401:
 *         description: Authentication required
 */
jobRouter.get("/", authenticate, authorize("recruiter"), validate({ query: jobQuerySchema }), async (req, res, next) => {
    try {
        const membership = await ensureRecruiterCompanyMembership(req.user.userId);
        const query = req.query;
        const { search, status } = query;
        const filters = [
            eq(schema.jobListings.companyId, membership.companyId),
            search
                ? or(ilike(schema.jobListings.title, `%${search}%`), ilike(schema.jobListings.description, `%${search}%`), ilike(schema.jobListings.category, `%${search}%`))
                : undefined,
            status ? eq(schema.jobListings.status, status) : undefined
        ].filter((value) => Boolean(value));
        const jobs = await db
            .select(jobSelect)
            .from(schema.jobListings)
            .innerJoin(schema.companies, eq(schema.companies.companyId, schema.jobListings.companyId))
            .where(and(...filters))
            .orderBy(desc(schema.jobListings.createdAt));
        return res.json(successResponse("Jobs fetched successfully", jobs));
    }
    catch (error) {
        return next(error);
    }
});
/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get recruiter job detail
 *     description: Retrieve a job that belongs to the authenticated recruiter company.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job id
 *     responses:
 *       200:
 *         description: Job fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Recruiter cannot access this job
 *       404:
 *         description: Job not found
 */
jobRouter.get("/:id", authenticate, authorize("recruiter"), validate({ params: jobParamsSchema }), async (req, res, next) => {
    try {
        const { id } = req.params;
        await ensureRecruiterCanAccessJob(req.user.userId, id);
        const [job] = await db
            .select(jobSelect)
            .from(schema.jobListings)
            .innerJoin(schema.companies, eq(schema.companies.companyId, schema.jobListings.companyId))
            .where(eq(schema.jobListings.jobId, id));
        if (!job) {
            throw new HttpError(404, "Job not found");
        }
        return res.json(successResponse("Job fetched successfully", job));
    }
    catch (error) {
        return next(error);
    }
});
/**
 * @swagger
 * /jobs/{id}:
 *   put:
 *     tags: [Jobs]
 *     summary: Update a job listing
 *     description: Update a job listing that belongs to the authenticated recruiter company.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Senior Frontend Developer
 *               description:
 *                 type: string
 *                 example: Lead the frontend implementation for new product features.
 *               requirements:
 *                 type: string
 *                 example: React, TypeScript, testing experience
 *               employmentType:
 *                 type: string
 *                 example: Full-time
 *               location:
 *                 type: string
 *                 example: Bandung
 *               category:
 *                 type: string
 *                 example: Product
 *               salaryRange:
 *                 type: string
 *                 example: IDR 12,000,000 - 18,000,000
 *               status:
 *                 type: string
 *                 enum: [draft, published, closed]
 *                 example: published
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-06-01T00:00:00.000Z
 *     responses:
 *       200:
 *         description: Job updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Recruiter cannot update this job
 *       404:
 *         description: Job not found
 */
jobRouter.put("/:id", authenticate, authorize("recruiter"), validate({ params: jobParamsSchema, body: updateJobSchema }), async (req, res, next) => {
    try {
        const { id } = req.params;
        const payload = req.body;
        const existingJob = await ensureRecruiterCanAccessJob(req.user.userId, id);
        const [currentJob] = await db
            .select()
            .from(schema.jobListings)
            .where(eq(schema.jobListings.jobId, existingJob.jobId));
        if (!currentJob) {
            throw new HttpError(404, "Job not found");
        }
        const nextStatus = payload.status ?? currentJob.status;
        const mergedJob = {
            title: payload.title ?? currentJob.title,
            description: payload.description ?? currentJob.description,
            requirements: payload.requirements ?? currentJob.requirements,
            employmentType: payload.employmentType ?? currentJob.employmentType,
            location: payload.location ?? currentJob.location,
            category: payload.category ?? currentJob.category
        };
        if (nextStatus === "published") {
            ensurePublishableJobPayload(mergedJob);
        }
        const [job] = await db
            .update(schema.jobListings)
            .set({
            ...payload,
            updatedAt: new Date()
        })
            .where(eq(schema.jobListings.jobId, id))
            .returning();
        return res.json(successResponse(nextStatus === "draft" ? "Job draft saved successfully" : "Job updated successfully", job));
    }
    catch (error) {
        return next(error);
    }
});
/**
 * @swagger
 * /jobs/{id}:
 *   delete:
 *     tags: [Jobs]
 *     summary: Delete a job listing
 *     description: Delete a job listing that belongs to the authenticated recruiter company.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job id
 *     responses:
 *       200:
 *         description: Job deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Recruiter cannot delete this job
 *       404:
 *         description: Job not found
 */
jobRouter.delete("/:id", authenticate, authorize("recruiter"), validate({ params: jobParamsSchema }), async (req, res, next) => {
    try {
        const { id } = req.params;
        await ensureRecruiterCanAccessJob(req.user.userId, id);
        await db.delete(schema.jobListings).where(eq(schema.jobListings.jobId, id));
        return res.json(successResponse("Job deleted successfully"));
    }
    catch (error) {
        return next(error);
    }
});
