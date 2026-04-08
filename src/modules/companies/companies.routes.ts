import { Router } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { ensureRecruiterCompanyMembership } from "../../lib/access.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { companyQuerySchema, updateCompanyProfileSchema } from "./companies.schemas.js";

export const companyRouter = Router();

/**
 * @swagger
 * /companies:
 *   get:
 *     tags: [Companies]
 *     summary: List companies for recruiter registration or public browsing
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Search company by company name
 *     responses:
 *       200:
 *         description: Companies fetched successfully
 */
companyRouter.get("/companies", validate({ query: companyQuerySchema }), async (req, res, next) => {
  try {
    const { search } = req.query as { search?: string };

    const companies = search
      ? await db
          .select({
            companyId: schema.companies.companyId,
            companyName: schema.companies.companyName,
            industry: schema.companies.industry,
            location: schema.companies.location
          })
          .from(schema.companies)
          .where(ilike(schema.companies.companyName, `%${search}%`))
      : await db
          .select({
            companyId: schema.companies.companyId,
            companyName: schema.companies.companyName,
            industry: schema.companies.industry,
            location: schema.companies.location
          })
          .from(schema.companies);

    return res.json(successResponse("Companies fetched successfully", companies));
  } catch (error) {
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
companyRouter.get(
  "/company/profile",
  authenticate,
  authorize("recruiter"),
  async (req, res, next) => {
    try {
      const membership = await ensureRecruiterCompanyMembership(req.user!.userId);

      const [company] = await db
        .select()
        .from(schema.companies)
        .where(eq(schema.companies.companyId, membership.companyId));

      if (!company) {
        throw new HttpError(404, "Company profile not found");
      }

      return res.json(successResponse("Company profile fetched successfully", company));
    } catch (error) {
      return next(error);
    }
  }
);

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
 *               companyName:
 *                 type: string
 *                 example: Cognijob Labs
 *               industry:
 *                 type: string
 *                 example: Technology
 *               location:
 *                 type: string
 *                 example: Jakarta
 *               workplaceTag:
 *                 type: string
 *                 example: Inclusive
 *               description:
 *                 type: string
 *                 example: Transparent workplace hiring platform
 *     responses:
 *       200:
 *         description: Company profile updated successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Recruiter is not assigned to any company
 */
companyRouter.put(
  "/company/profile",
  authenticate,
  authorize("recruiter"),
  validate({ body: updateCompanyProfileSchema }),
  async (req, res, next) => {
    try {
      const membership = await ensureRecruiterCompanyMembership(req.user!.userId);

      await db
        .update(schema.companies)
        .set(req.body)
        .where(eq(schema.companies.companyId, membership.companyId));

      return res.json(successResponse("Company profile updated successfully"));
    } catch (error) {
      return next(error);
    }
  }
);
