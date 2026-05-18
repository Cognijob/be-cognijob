// src/modules/applications/applications.routes.ts
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import {
  APPLICANT_STATUS_MAP,
  APPLICANT_STATUS_MESSAGE_MAP,
  assertValidStatusTransition
} from "../../lib/applicant-status.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { createNotification } from "../../lib/notification.service.js";
import { ensureRecruiterCanAccessJob } from "../../lib/access.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import type { RecruiterApplicationStatus } from "../../db/schema.js";

export const applicationRouter = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const applyJobSchema = z.object({
  jobId: z.uuid("jobId must be a valid UUID"),
  isAnonymous: z.boolean().default(true),
  cvUrl: z.url("cvUrl must be a valid URL")
});

const applicationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["submitted", "reviewed", "next_stage", "accepted", "rejected"])
    .optional(),
  sort: z.enum(["applied_at", "updated_at"]).default("applied_at"),
  order: z.enum(["asc", "desc"]).default("desc")
});

const applicantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["submitted", "reviewed", "next_stage", "accepted", "rejected"])
    .optional(),
  search: z.string().optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["reviewed", "next_stage", "accepted", "rejected"])
});

const applicationParamsSchema = z.object({ id: z.uuid() });
const jobApplicantsParamsSchema = z.object({ jobId: z.uuid() });

// ─── POST /applications ───────────────────────────────────────────────────────
/**
 * @swagger
 * /applications:
 *   post:
 *     tags: [Applications]
 *     summary: Apply to a job
 *     description: Job seeker submits an application. Anonymous by default.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobId, cvUrl]
 *             properties:
 *               jobId:
 *                 type: string
 *                 format: uuid
 *                 example: aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa
 *               isAnonymous:
 *                 type: boolean
 *                 default: true
 *               cvUrl:
 *                 type: string
 *                 format: uri
 *                 example: https://storage.supabase.co/object/public/cv-files/my-cv.pdf
 *     responses:
 *       201:
 *         description: Application submitted successfully
 *       400:
 *         description: Job not accepting applications
 *       409:
 *         description: Already applied to this job
 */
applicationRouter.post(
  "/",
  authenticate,
  authorize("job_seeker"),
  validate({ body: applyJobSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { jobId, isAnonymous, cvUrl } = req.body as z.infer<typeof applyJobSchema>;

      // Cek job ada dan published
      const [job] = await db
        .select()
        .from(schema.jobListings)
        .where(eq(schema.jobListings.jobId, jobId));

      if (!job) throw new HttpError(404, "Job not found");
      if (job.status !== "published") {
        throw new HttpError(400, "This job is not accepting applications");
      }
      if (job.expiresAt && job.expiresAt < new Date()) {
        throw new HttpError(400, "This job posting has expired");
      }

      // Prevent duplicate
      const [existing] = await db
        .select({ applicationId: schema.jobApplications.applicationId })
        .from(schema.jobApplications)
        .where(
          and(
            eq(schema.jobApplications.jobId, jobId),
            eq(schema.jobApplications.userId, userId)
          )
        );

      if (existing) throw new HttpError(409, "You have already applied to this job");

      const [application] = await db
        .insert(schema.jobApplications)
        .values({ jobId, userId, isAnonymous, cvUrl, recruiterStatus: "submitted" })
        .returning();

      // Notifikasi ke job seeker
      await createNotification({
        userId,
        type: "application_status",
        title: "Application Submitted",
        body: `Your application for "${job.title}" has been submitted successfully.`,
        referenceId: application.applicationId
      });

      return res.status(201).json(successResponse("Application submitted successfully", application));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /applications ────────────────────────────────────────────────────────
/**
 * @swagger
 * /applications:
 *   get:
 *     tags: [Applications]
 *     summary: Get my applications
 *     description: Job seeker views their own application list with applicant-facing status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [submitted, reviewed, next_stage, accepted, rejected] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [applied_at, updated_at], default: applied_at }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Applications fetched successfully
 */
applicationRouter.get(
  "/",
  authenticate,
  authorize("job_seeker"),
  validate({ query: applicationQuerySchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { page, limit, status, sort, order } =
        req.query as unknown as z.infer<typeof applicationQuerySchema>;
      const offset = (page - 1) * limit;

      const filters = [
        eq(schema.jobApplications.userId, userId),
        status ? eq(schema.jobApplications.recruiterStatus, status) : undefined
      ].filter((f): f is NonNullable<typeof f> => Boolean(f));

      const whereClause = and(...filters);
      const sortCol =
        sort === "updated_at"
          ? schema.jobApplications.updatedAt
          : schema.jobApplications.appliedAt;
      const orderDir = order === "asc" ? asc(sortCol) : desc(sortCol);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            applicationId: schema.jobApplications.applicationId,
            jobId: schema.jobApplications.jobId,
            isAnonymous: schema.jobApplications.isAnonymous,
            cvUrl: schema.jobApplications.cvUrl,
            recruiterStatus: schema.jobApplications.recruiterStatus,
            appliedAt: schema.jobApplications.appliedAt,
            updatedAt: schema.jobApplications.updatedAt,
            jobTitle: schema.jobListings.title,
            jobLocation: schema.jobListings.location,
            jobEmploymentType: schema.jobListings.employmentType,
            companyName: schema.companies.companyName,
            companyId: schema.companies.companyId
          })
          .from(schema.jobApplications)
          .innerJoin(
            schema.jobListings,
            eq(schema.jobApplications.jobId, schema.jobListings.jobId)
          )
          .innerJoin(
            schema.companies,
            eq(schema.jobListings.companyId, schema.companies.companyId)
          )
          .where(whereClause)
          .orderBy(orderDir)
          .limit(limit)
          .offset(offset),

        db
          .select({ total: count() })
          .from(schema.jobApplications)
          .where(whereClause)
      ]);

      const applications = rows.map((r) => ({
        ...r,
        applicantStatus: APPLICANT_STATUS_MAP[r.recruiterStatus]
      }));

      const totalPages = Math.ceil(Number(total) / limit);

      return res.json(
        successResponse("Applications fetched successfully", {
          applications,
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

// ─── GET /applications/:id/status ─────────────────────────────────────────────
/**
 * @swagger
 * /applications/{id}/status:
 *   get:
 *     tags: [Applications]
 *     summary: Check application status (job seeker view)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Application status fetched
 *       404:
 *         description: Application not found
 */
applicationRouter.get(
  "/:id/status",
  authenticate,
  authorize("job_seeker"),
  validate({ params: applicationParamsSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { id } = req.params as { id: string };

      const [application] = await db
        .select({
          applicationId: schema.jobApplications.applicationId,
          jobId: schema.jobApplications.jobId,
          recruiterStatus: schema.jobApplications.recruiterStatus,
          appliedAt: schema.jobApplications.appliedAt,
          updatedAt: schema.jobApplications.updatedAt,
          jobTitle: schema.jobListings.title,
          companyName: schema.companies.companyName,
          expiresAt: schema.jobListings.expiresAt
        })
        .from(schema.jobApplications)
        .innerJoin(
          schema.jobListings,
          eq(schema.jobApplications.jobId, schema.jobListings.jobId)
        )
        .innerJoin(
          schema.companies,
          eq(schema.jobListings.companyId, schema.companies.companyId)
        )
        .where(
          and(
            eq(schema.jobApplications.applicationId, id),
            eq(schema.jobApplications.userId, userId)
          )
        );

      if (!application) throw new HttpError(404, "Application not found");

      return res.json(
        successResponse("Application status fetched", {
          ...application,
          applicantStatus: APPLICANT_STATUS_MAP[application.recruiterStatus],
          contextMessage: APPLICANT_STATUS_MESSAGE_MAP[application.recruiterStatus]
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /jobs/:jobId/applicants ──────────────────────────────────────────────
/**
 * @swagger
 * /jobs/{jobId}/applicants:
 *   get:
 *     tags: [Applications]
 *     summary: List applicants for a job (recruiter)
 *     description: Recruiter views applicant list. Identity hidden when is_anonymous=true.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [submitted, reviewed, next_stage, accepted, rejected] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by skills keyword
 *     responses:
 *       200:
 *         description: Applicants fetched successfully
 *       403:
 *         description: Access denied
 */
applicationRouter.get(
  "/jobs/:jobId/applicants",
  authenticate,
  authorize("recruiter"),
  validate({ params: jobApplicantsParamsSchema, query: applicantListQuerySchema }),
  async (req, res, next) => {
    try {
      const { jobId } = req.params as { jobId: string };
      const { page, limit, status, search } =
        req.query as unknown as z.infer<typeof applicantListQuerySchema>;
      const offset = (page - 1) * limit;

      // Pastikan recruiter punya akses ke job ini
      await ensureRecruiterCanAccessJob(req.user!.userId, jobId);

      const filters = [
        eq(schema.jobApplications.jobId, jobId),
        status ? eq(schema.jobApplications.recruiterStatus, status) : undefined,
        search ? ilike(schema.jobSeekerProfiles.skills, `%${search}%`) : undefined
      ].filter((f): f is NonNullable<typeof f> => Boolean(f));

      const whereClause = and(...filters);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            applicationId: schema.jobApplications.applicationId,
            isAnonymous: schema.jobApplications.isAnonymous,
            recruiterStatus: schema.jobApplications.recruiterStatus,
            cvUrl: schema.jobApplications.cvUrl,
            appliedAt: schema.jobApplications.appliedAt,
            updatedAt: schema.jobApplications.updatedAt,
            // Kompetensi — selalu tampil
            skills: schema.jobSeekerProfiles.skills,
            workExperience: schema.jobSeekerProfiles.workExperience,
            portfolioLink: schema.jobSeekerProfiles.portfolioLink,
            awards: schema.jobSeekerProfiles.awards,
            organizationExperience: schema.jobSeekerProfiles.organizationExperience,
            interests: schema.jobSeekerProfiles.interests,
            profileCompleteness: schema.jobSeekerProfiles.profileCompleteness,
            // Identitas — hanya tampil jika is_anonymous = false
            userId: schema.jobApplications.userId,
            userName: schema.users.name,
            userEmail: schema.users.email,
            userPhotoUrl: schema.users.photoUrl,
            userGender: schema.users.gender,
            userAge: schema.users.age
          })
          .from(schema.jobApplications)
          .leftJoin(
            schema.jobSeekerProfiles,
            eq(schema.jobApplications.userId, schema.jobSeekerProfiles.userId)
          )
          .leftJoin(
            schema.users,
            eq(schema.jobApplications.userId, schema.users.userId)
          )
          .where(whereClause)
          .orderBy(desc(schema.jobApplications.appliedAt))
          .limit(limit)
          .offset(offset),

        db
          .select({ total: count() })
          .from(schema.jobApplications)
          .leftJoin(
            schema.jobSeekerProfiles,
            eq(schema.jobApplications.userId, schema.jobSeekerProfiles.userId)
          )
          .where(whereClause)
      ]);

      // Anonymization — sembunyikan identitas jika is_anonymous = true
      const applicants = rows.map((r) => {
        const base = {
          applicationId: r.applicationId,
          isAnonymous: r.isAnonymous,
          recruiterStatus: r.recruiterStatus,
          cvUrl: r.cvUrl,
          appliedAt: r.appliedAt,
          updatedAt: r.updatedAt,
          skills: r.skills,
          workExperience: r.workExperience,
          portfolioLink: r.portfolioLink,
          awards: r.awards,
          organizationExperience: r.organizationExperience,
          interests: r.interests,
          profileCompleteness: r.profileCompleteness
        };

        if (!r.isAnonymous) {
          return {
            ...base,
            userId: r.userId,
            name: r.userName,
            email: r.userEmail,
            photoUrl: r.userPhotoUrl,
            gender: r.userGender,
            age: r.userAge
          };
        }

        return { ...base, userId: null, name: null, email: null, photoUrl: null };
      });

      const totalPages = Math.ceil(Number(total) / limit);

      return res.json(
        successResponse("Applicants fetched successfully", {
          applicants,
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

// ─── GET /applications/:id ────────────────────────────────────────────────────
/**
 * @swagger
 * /applications/{id}:
 *   get:
 *     tags: [Applications]
 *     summary: Get application detail (recruiter)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Application fetched successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.get(
  "/:id",
  authenticate,
  authorize("recruiter"),
  validate({ params: applicationParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };

      const [row] = await db
        .select({
          applicationId: schema.jobApplications.applicationId,
          jobId: schema.jobApplications.jobId,
          isAnonymous: schema.jobApplications.isAnonymous,
          recruiterStatus: schema.jobApplications.recruiterStatus,
          cvUrl: schema.jobApplications.cvUrl,
          appliedAt: schema.jobApplications.appliedAt,
          updatedAt: schema.jobApplications.updatedAt,
          // Profile
          skills: schema.jobSeekerProfiles.skills,
          workExperience: schema.jobSeekerProfiles.workExperience,
          portfolioLink: schema.jobSeekerProfiles.portfolioLink,
          awards: schema.jobSeekerProfiles.awards,
          organizationExperience: schema.jobSeekerProfiles.organizationExperience,
          interests: schema.jobSeekerProfiles.interests,
          profileCompleteness: schema.jobSeekerProfiles.profileCompleteness,
          // Identity
          userId: schema.jobApplications.userId,
          userName: schema.users.name,
          userEmail: schema.users.email,
          userPhotoUrl: schema.users.photoUrl,
          userGender: schema.users.gender,
          userAge: schema.users.age,
          // Job info
          jobCompanyId: schema.jobListings.companyId
        })
        .from(schema.jobApplications)
        .leftJoin(
          schema.jobSeekerProfiles,
          eq(schema.jobApplications.userId, schema.jobSeekerProfiles.userId)
        )
        .leftJoin(schema.users, eq(schema.jobApplications.userId, schema.users.userId))
        .innerJoin(
          schema.jobListings,
          eq(schema.jobApplications.jobId, schema.jobListings.jobId)
        )
        .where(eq(schema.jobApplications.applicationId, id));

      if (!row) throw new HttpError(404, "Application not found");

      // Cek recruiter punya akses ke job ini
      await ensureRecruiterCanAccessJob(req.user!.userId, row.jobId);

      const base = {
        applicationId: row.applicationId,
        jobId: row.jobId,
        isAnonymous: row.isAnonymous,
        recruiterStatus: row.recruiterStatus,
        cvUrl: row.cvUrl,
        appliedAt: row.appliedAt,
        updatedAt: row.updatedAt,
        skills: row.skills,
        workExperience: row.workExperience,
        portfolioLink: row.portfolioLink,
        awards: row.awards,
        organizationExperience: row.organizationExperience,
        interests: row.interests,
        profileCompleteness: row.profileCompleteness
      };

      const detail = row.isAnonymous
        ? { ...base, userId: null, name: null, email: null, photoUrl: null }
        : {
            ...base,
            userId: row.userId,
            name: row.userName,
            email: row.userEmail,
            photoUrl: row.userPhotoUrl,
            gender: row.userGender,
            age: row.userAge
          };

      return res.json(successResponse("Application fetched successfully", detail));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── PATCH /applications/:id/status ──────────────────────────────────────────
/**
 * @swagger
 * /applications/{id}/status:
 *   patch:
 *     tags: [Applications]
 *     summary: Update application status (recruiter)
 *     description: |
 *       Valid transitions:
 *       - submitted → reviewed | rejected
 *       - reviewed → next_stage | rejected
 *       - next_stage → accepted | rejected
 *       - accepted / rejected → terminal (no further change)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [reviewed, next_stage, accepted, rejected]
 *     responses:
 *       200:
 *         description: Application status updated
 *       400:
 *         description: Invalid status transition
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.patch(
  "/:id/status",
  authenticate,
  authorize("recruiter"),
  validate({ params: applicationParamsSchema, body: updateStatusSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { status: newStatus } = req.body as z.infer<typeof updateStatusSchema>;

      const [application] = await db
        .select()
        .from(schema.jobApplications)
        .where(eq(schema.jobApplications.applicationId, id));

      if (!application) throw new HttpError(404, "Application not found");

      // Cek recruiter punya akses ke job ini
      await ensureRecruiterCanAccessJob(req.user!.userId, application.jobId);

      // Validasi transisi status
      assertValidStatusTransition(
        application.recruiterStatus as RecruiterApplicationStatus,
        newStatus as RecruiterApplicationStatus
      );

      const [updated] = await db
        .update(schema.jobApplications)
        .set({ recruiterStatus: newStatus as RecruiterApplicationStatus, updatedAt: new Date() })
        .where(eq(schema.jobApplications.applicationId, id))
        .returning();

      // Ambil nama job untuk notifikasi
      const [job] = await db
        .select({ title: schema.jobListings.title })
        .from(schema.jobListings)
        .where(eq(schema.jobListings.jobId, application.jobId));

      // Kirim notifikasi ke job seeker
      await createNotification({
        userId: application.userId,
        type: "application_status",
        title: "Application Status Updated",
        body: `Your application for "${job?.title ?? "a job"}" has moved to: ${APPLICANT_STATUS_MAP[newStatus as RecruiterApplicationStatus]}.`,
        referenceId: id
      });

      return res.json(
        successResponse("Application status updated", {
          applicationId: updated.applicationId,
          recruiterStatus: updated.recruiterStatus,
          applicantStatus: APPLICANT_STATUS_MAP[updated.recruiterStatus],
          updatedAt: updated.updatedAt
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);