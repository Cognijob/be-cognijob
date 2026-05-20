import { Router } from "express";
import { count, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
export const publicStatsRouter = Router();
/**
 * @swagger
 * /public/stats:
 *   get:
 *     tags: [Public]
 *     summary: Get landing page and general application stats
 *     responses:
 *       200:
 *         description: Statistics fetched successfully
 */
publicStatsRouter.get("/", async (req, res, next) => {
    try {
        // Query database for dynamic counts
        const [jobSeekerCount] = await db
            .select({ total: count() })
            .from(schema.users)
            .where(eq(schema.users.role, "job_seeker"));
        const [jobCount] = await db
            .select({ total: count() })
            .from(schema.jobListings);
        const [companyCount] = await db
            .select({ total: count() })
            .from(schema.companies);
        const stats = {
            // Landing page specific stats
            successRate: "99.7%",
            responseRate: "53%",
            platformCount: "1 Platform",
            // Dynamic live stats
            totalJobSeekers: Number(jobSeekerCount?.total ?? 0),
            totalJobs: Number(jobCount?.total ?? 0),
            totalCompanies: Number(companyCount?.total ?? 0)
        };
        return res.json(successResponse("Statistics fetched successfully", stats));
    }
    catch (error) {
        return next(error);
    }
});
