import crypto from "node:crypto";
import { Router } from "express";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { signAccessToken } from "../../lib/jwt.js";
import { comparePassword, hashPassword } from "../../lib/password.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { validate } from "../../middlewares/validate.js";
import {
  forgotPasswordSchema,
  jobSeekerRegistrationSchema,
  loginSchema,
  recruiterRegistrationSchema,
  resetPasswordSchema
} from "./auth.schemas.js";

export const authRouter = Router();

/**
 * @swagger
 * /auth/register/job-seeker:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new job seeker
 */
authRouter.post(
  "/register/job-seeker",
  validate({ body: jobSeekerRegistrationSchema }),
  async (req, res, next) => {
    try {
      const payload = req.body;

      const [existingUser] = await db
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.email, payload.email));

      if (existingUser) {
        throw new HttpError(409, "Email is already registered");
      }

      const [user] = await db
        .insert(schema.users)
        .values({
          name: payload.name,
          email: payload.email,
          passwordHash: await hashPassword(payload.password),
          role: "job_seeker",
          gender: payload.gender,
          age: payload.age,
          photoUrl: payload.photoUrl
        })
        .returning({
          userId: schema.users.userId,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role
        });

      await db.insert(schema.jobSeekerProfiles).values({
        userId: user.userId
      });

      const token = signAccessToken(user);
      return res.status(201).json(successResponse("Job seeker registered successfully", { user, token }));
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @swagger
 * /auth/register/recruiter:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new recruiter
 */
authRouter.post(
  "/register/recruiter",
  validate({ body: recruiterRegistrationSchema }),
  async (req, res, next) => {
    try {
      const payload = req.body;

      const [existingUser] = await db
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.email, payload.email));

      if (existingUser) {
        throw new HttpError(409, "Email is already registered");
      }

      const result = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(schema.users)
          .values({
            name: payload.name,
            email: payload.email,
            passwordHash: await hashPassword(payload.password),
            role: "recruiter"
          })
          .returning({
            userId: schema.users.userId,
            name: schema.users.name,
            email: schema.users.email,
            role: schema.users.role
          });

        let companyId: string;

        if (payload.companyMode === "existing") {
          const [company] = await tx
            .select()
            .from(schema.companies)
            .where(eq(schema.companies.companyId, payload.existingCompanyId!));

          if (!company) {
            throw new HttpError(404, "Selected company was not found");
          }

          const [recruiterCountResult] = await tx
            .select({ total: count() })
            .from(schema.companyRecruiters)
            .where(eq(schema.companyRecruiters.companyId, company.companyId));

          const recruiterCount = Number(recruiterCountResult?.total ?? 0);

          if (recruiterCount >= 3) {
            throw new HttpError(400, "Selected company already has the maximum number of recruiters");
          }

          companyId = company.companyId;
        } else {
          const [duplicateCompany] = await tx
            .select({ companyId: schema.companies.companyId })
            .from(schema.companies)
            .where(eq(schema.companies.companyName, payload.newCompany!.companyName));

          if (duplicateCompany) {
            throw new HttpError(409, "Company name is already registered");
          }

          const [company] = await tx
            .insert(schema.companies)
            .values({
              createdBy: user.userId,
              companyName: payload.newCompany!.companyName,
              industry: payload.newCompany!.industry,
              location: payload.newCompany!.location,
              workplaceTag: payload.newCompany!.workplaceTag,
              description: payload.newCompany!.description
            })
            .returning({ companyId: schema.companies.companyId });

          companyId = company.companyId;
        }

        await tx.insert(schema.companyRecruiters).values({
          companyId,
          userId: user.userId
        });

        return { user, companyId };
      });

      const token = signAccessToken(result.user);

      return res
        .status(201)
        .json(successResponse("Recruiter registered successfully", { ...result, token }));
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 */
authRouter.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const payload = req.body;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, payload.email));

    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    const isPasswordValid = await comparePassword(payload.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = signAccessToken({
      userId: user.userId,
      email: user.email,
      role: user.role
    });

    return res.json(
      successResponse("Login successful", {
        token,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role
        }
      })
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Generate password reset token
 */
authRouter.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const [user] = await db
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.email, email));

      if (!user) {
        return res.json(
          successResponse("If the email exists, a password reset token has been generated")
        );
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

      await db.insert(schema.passwordResetTokens).values({
        userId: user.userId,
        tokenHash,
        expiresAt
      });

      return res.json(
        successResponse("Password reset token generated", {
          resetToken: rawToken,
          expiresAt
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using reset token
 */
authRouter.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  async (req, res, next) => {
    try {
      const { token, newPassword } = req.body;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const [resetToken] = await db
        .select()
        .from(schema.passwordResetTokens)
        .where(
          and(
            eq(schema.passwordResetTokens.tokenHash, tokenHash),
            isNull(schema.passwordResetTokens.usedAt)
          )
        );

      if (!resetToken || resetToken.expiresAt < new Date()) {
        throw new HttpError(400, "Reset token is invalid or expired");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({
            passwordHash: await hashPassword(newPassword)
          })
          .where(eq(schema.users.userId, resetToken.userId));

        await tx
          .update(schema.passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(schema.passwordResetTokens.resetTokenId, resetToken.resetTokenId));
      });

      return res.json(successResponse("Password has been reset successfully"));
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 */
authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const [user] = await db
      .select({
        userId: schema.users.userId,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role
      })
      .from(schema.users)
      .where(eq(schema.users.userId, req.user!.userId));

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    return res.json(successResponse("Current user fetched successfully", user));
  } catch (error) {
    return next(error);
  }
});
