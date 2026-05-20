import { Router } from "express";
import { db, schema } from "../../db/index.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { successResponse } from "../../lib/api-response.js";
import { sql, eq } from "drizzle-orm";

export const jobSummaryRouter = Router();

jobSummaryRouter.get(
  "/",
  authenticate,
  authorize("recruiter"),
  async (req, res, next) => {
    try {
      const recruiterId = req.user!.userId;

      // Kita hitung semua dalam satu query menggunakan conditional aggregation
      const [summary] = await db
        .select({
            activeJobs: sql<number>`(SELECT count(*)::int FROM ${schema.jobListings} WHERE created_by = ${recruiterId} AND status = 'published')`,
            totalApplicants: sql<number>`(SELECT count(*)::int FROM ${schema.jobApplications} JOIN ${schema.jobListings} ON ${schema.jobApplications.jobId} = ${schema.jobListings.jobId} WHERE ${schema.jobListings.createdBy} = ${recruiterId})`,
            pendingReviews: sql<number>`(SELECT count(*)::int FROM ${schema.jobApplications} JOIN ${schema.jobListings} ON ${schema.jobApplications.jobId} = ${schema.jobListings.jobId} WHERE ${schema.jobListings.createdBy} = ${recruiterId} AND recruiter_status = 'submitted')`,
            totalAccepted: sql<number>`(SELECT count(*)::int FROM ${schema.jobApplications} JOIN ${schema.jobListings} ON ${schema.jobApplications.jobId} = ${schema.jobListings.jobId} WHERE ${schema.jobListings.createdBy} = ${recruiterId} AND recruiter_status = 'accepted')`,
        })
        .from(schema.jobListings)
        .limit(1)
        .leftJoin(
          schema.jobApplications,
          eq(schema.jobListings.jobId, schema.jobApplications.jobId)
        )
        .where(eq(schema.jobListings.createdBy, recruiterId));

      return res.json(successResponse("Dashboard summary fetched successfully", summary));
    } catch (error) {
      next(error);
    }
  }
);