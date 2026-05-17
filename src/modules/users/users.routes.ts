import { eq } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { env } from "../../config/env.js";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { supabase } from "../../lib/supabase.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { updateUserProfileSchema } from "./users.schemas.js";

export const userRouter = Router();

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(new HttpError(400, "CV file must be a PDF, DOC, or DOCX"));
    }

    return callback(null, true);
  }
});

const handleCvUpload: RequestHandler = (req, res, next) => {
  cvUpload.single("cv")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new HttpError(400, "CV file must be 5MB or smaller"));
    }

    return next(error);
  });
};

const userProfileSelect = {
  userId: schema.users.userId,
  name: schema.users.name,
  email: schema.users.email,
  role: schema.users.role,
  gender: schema.users.gender,
  age: schema.users.age,
  photoUrl: schema.users.photoUrl,
  skills: schema.jobSeekerProfiles.skills,
  portfolioLink: schema.jobSeekerProfiles.portfolioLink,
  workExperience: schema.jobSeekerProfiles.workExperience,
  awards: schema.jobSeekerProfiles.awards,
  organizationExperience: schema.jobSeekerProfiles.organizationExperience,
  interests: schema.jobSeekerProfiles.interests,
  cvUrl: schema.jobSeekerProfiles.cvUrl,
  cvFileName: schema.jobSeekerProfiles.cvFileName,
  cvFileSize: schema.jobSeekerProfiles.cvFileSize,
  cvMimeType: schema.jobSeekerProfiles.cvMimeType,
  cvStoragePath: schema.jobSeekerProfiles.cvStoragePath,
  cvUploadedAt: schema.jobSeekerProfiles.cvUploadedAt,
  profileCompleteness: schema.jobSeekerProfiles.profileCompleteness,
  updatedAt: schema.jobSeekerProfiles.updatedAt
};

type UserProfile = typeof userProfileSelect extends Record<string, infer _Value>
  ? {
      userId: string;
      name: string;
      email: string;
      role: string;
      gender: string | null;
      age: number | null;
      photoUrl: string | null;
      skills: string | null;
      portfolioLink: string | null;
      workExperience: string | null;
      awards: string | null;
      organizationExperience: string | null;
      interests: string | null;
      cvUrl: string | null;
      cvFileName: string | null;
      cvFileSize: number | null;
      cvMimeType: string | null;
      cvStoragePath: string | null;
      cvUploadedAt: Date | null;
      profileCompleteness: number;
      updatedAt: Date;
    }
  : never;

const hasValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
};

const calculateProfileCompleteness = (profile: Pick<
  UserProfile,
  | "name"
  | "gender"
  | "age"
  | "photoUrl"
  | "skills"
  | "portfolioLink"
  | "workExperience"
  | "awards"
  | "organizationExperience"
  | "interests"
  | "cvUrl"
>) => {
  const fields = [
    profile.name,
    profile.gender,
    profile.age,
    profile.photoUrl,
    profile.skills,
    profile.portfolioLink,
    profile.workExperience,
    profile.awards,
    profile.organizationExperience,
    profile.interests,
    profile.cvUrl
  ];

  const completed = fields.filter(hasValue).length;
  return Math.round((completed / fields.length) * 100);
};

const getCurrentUserProfile = async (userId: string) => {
  const [profile] = await db
    .select(userProfileSelect)
    .from(schema.users)
    .innerJoin(schema.jobSeekerProfiles, eq(schema.jobSeekerProfiles.userId, schema.users.userId))
    .where(eq(schema.users.userId, userId));

  if (!profile) {
    throw new HttpError(404, "User profile not found");
  }

  return profile as UserProfile;
};

/**
 * @swagger
 * /users/profile:
 *   get:
 *     tags: [Users]
 *     summary: Get current job seeker profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only job seekers can access this resource
 *       404:
 *         description: User profile not found
 */
userRouter.get("/profile", authenticate, authorize("job_seeker"), async (req, res, next) => {
  try {
    const profile = await getCurrentUserProfile(req.user!.userId);

    return res.json(successResponse("User profile fetched successfully", profile));
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /users/profile/preview:
 *   get:
 *     tags: [Users]
 *     summary: Get compact current job seeker profile preview
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile preview fetched successfully
 */
userRouter.get("/profile/preview", authenticate, authorize("job_seeker"), async (req, res, next) => {
  try {
    const profile = await getCurrentUserProfile(req.user!.userId);

    return res.json(
      successResponse("User profile preview fetched successfully", {
        userId: profile.userId,
        name: profile.name,
        photoUrl: profile.photoUrl,
        headline: profile.skills,
        portfolioLink: profile.portfolioLink,
        cvUrl: profile.cvUrl,
        profileCompleteness: profile.profileCompleteness,
        hasCv: Boolean(profile.cvUrl)
      })
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @swagger
 * /users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Update current job seeker profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Naura Belva
 *               gender:
 *                 type: string
 *                 nullable: true
 *                 example: female
 *               age:
 *                 type: integer
 *                 nullable: true
 *                 example: 20
 *               photoUrl:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *               skills:
 *                 type: string
 *                 nullable: true
 *                 example: React, TypeScript, UI Testing
 *               portfolioLink:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *               workExperience:
 *                 type: string
 *                 nullable: true
 *               awards:
 *                 type: string
 *                 nullable: true
 *               organizationExperience:
 *                 type: string
 *                 nullable: true
 *               interests:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only job seekers can access this resource
 *       404:
 *         description: User profile not found
 */
userRouter.put(
  "/profile",
  authenticate,
  authorize("job_seeker"),
  validate({ body: updateUserProfileSchema }),
  async (req, res, next) => {
    try {
      const payload = req.body as typeof req.body;
      const currentProfile = await getCurrentUserProfile(req.user!.userId);

      const userPayload = {
        name: payload.name,
        gender: payload.gender,
        age: payload.age,
        photoUrl: payload.photoUrl
      };

      const profilePayload = {
        skills: payload.skills,
        portfolioLink: payload.portfolioLink,
        workExperience: payload.workExperience,
        awards: payload.awards,
        organizationExperience: payload.organizationExperience,
        interests: payload.interests
      };

      const nextProfileForCompleteness = {
        ...currentProfile,
        ...Object.fromEntries(Object.entries(userPayload).filter(([, value]) => value !== undefined)),
        ...Object.fromEntries(Object.entries(profilePayload).filter(([, value]) => value !== undefined))
      };
      const profileCompleteness = calculateProfileCompleteness(nextProfileForCompleteness);

      await db.transaction(async (tx) => {
        const nextUserPayload = Object.fromEntries(
          Object.entries(userPayload).filter(([, value]) => value !== undefined)
        );
        const nextProfilePayload = Object.fromEntries(
          Object.entries(profilePayload).filter(([, value]) => value !== undefined)
        );

        if (Object.keys(nextUserPayload).length > 0) {
          await tx
            .update(schema.users)
            .set({
              ...nextUserPayload,
              updatedAt: new Date()
            })
            .where(eq(schema.users.userId, req.user!.userId));
        }

        await tx
          .update(schema.jobSeekerProfiles)
          .set({
            ...nextProfilePayload,
            profileCompleteness,
            updatedAt: new Date()
          })
          .where(eq(schema.jobSeekerProfiles.userId, req.user!.userId));
      });

      const updatedProfile = await getCurrentUserProfile(req.user!.userId);

      return res.json(successResponse("User profile updated successfully", updatedProfile));
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * @swagger
 * /users/cv:
 *   post:
 *     tags: [Users]
 *     summary: Upload current job seeker CV
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [cv]
 *             properties:
 *               cv:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: CV uploaded successfully
 *       400:
 *         description: CV file is required
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only job seekers can access this resource
 *       404:
 *         description: User profile not found
 */
userRouter.post(
  "/cv",
  authenticate,
  authorize("job_seeker"),
  handleCvUpload,
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, "CV file is required");
      }

      const currentProfile = await getCurrentUserProfile(req.user!.userId);

      const extension = req.file.originalname.split(".").pop()?.toLowerCase() ?? "pdf";
      const filePath = `${req.user!.userId}/cv-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(env.SUPABASE_BUCKET)
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (uploadError) {
        throw new HttpError(500, "Failed to upload CV", uploadError.message);
      }

      const { data } = supabase.storage.from(env.SUPABASE_BUCKET).getPublicUrl(filePath);
      const uploadedAt = new Date();
      const profileCompleteness = calculateProfileCompleteness({
        ...currentProfile,
        cvUrl: data.publicUrl
      });

      await db
        .update(schema.jobSeekerProfiles)
        .set({
          cvUrl: data.publicUrl,
          cvFileName: req.file.originalname,
          cvFileSize: req.file.size,
          cvMimeType: req.file.mimetype,
          cvStoragePath: filePath,
          cvUploadedAt: uploadedAt,
          profileCompleteness,
          updatedAt: new Date()
        })
        .where(eq(schema.jobSeekerProfiles.userId, req.user!.userId));

      const updatedProfile = await getCurrentUserProfile(req.user!.userId);

      return res.json(successResponse("CV uploaded successfully", updatedProfile));
    } catch (error) {
      return next(error);
    }
  }
);
