// src/modules/users/users.routes.ts
// Endpoint untuk job seeker profile management.
//
// Routes:
//   GET    /users/profile       → Ambil profil lengkap (user + job_seeker_profiles)
//   PUT    /users/profile       → Update profil (data user + profil job seeker)
//   POST   /users/cv            → Upload CV baru ke Supabase Storage (PDF ≤ 5 MB)
//   POST   /users/photo         → Upload foto profil ke Supabase Storage
//   DELETE /users/account       → Hapus akun sendiri

import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { supabase } from "../../lib/supabase.js";
import { hashPassword, comparePassword } from "../../lib/password.js";
import { computeProfileCompleteness } from "../../lib/profile-completeness.js"; // Helper completeness
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { upload } from "../../middlewares/upload.js"; // Multer middleware

export const userRouter = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  // Data user (tabel users)
  firstName: z.string().trim().min(1).max(75).optional(),
  lastName:  z.string().trim().min(1).max(75).optional(),
  gender:    z.string().trim().max(50).nullable().optional(),
  age:       z.number().int().min(0).nullable().optional(),
  location:  z.string().trim().max(150).nullable().optional(),
  whatsappNumber: z.string().trim().regex(/^(\+62|62|0)[0-9]{9,15}$/, "WhatsApp number must be a valid Indonesian phone number").nullable().optional(),

  // Data profil job seeker (tabel job_seeker_profiles)
  // Bisa berupa string (JSON.stringify) atau object/array langsung.
  skills:                 z.any().optional(),
  portfolioLink:          z.url("portfolioLink must be a valid URL").nullable().optional(),
  workExperience:         z.any().optional(),
  awards:                 z.any().optional(),
  organizationExperience: z.any().optional(),
  interests:              z.any().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8, "New password must be at least 8 characters"),
});

// ─── GET /users/profile ───────────────────────────────────────────────────────
/**
 * @swagger
 * /users/profile:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     description: |
 *       Mengembalikan data user + profil job seeker dalam satu response.
 *       Dipakai di halaman Profile: nama, lokasi, skill utama, pengalaman kerja,
 *       bidang minat, prestasi, volunteering, CV URL, dan profile completeness.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               data:
 *                 userId: "uuid"
 *                 name: "Rayanka Sadira Jiwita"
 *                 email: "rayanka@email.com"
 *                 role: "job_seeker"
 *                 gender: "Female"
 *                 age: 26
 *                 photoUrl: "https://..."
 *                 profile:
 *                   skills: "Python, Django, Docker, REST API"
 *                   workExperience: "[{...}]"
 *                   awards: "[{...}]"
 *                   organizationExperience: "[{...}]"
 *                   interests: "Arsitektur Sistem, Skalabilitas"
 *                   portfolioLink: "https://..."
 *                   cvUrl: "https://..."
 *                   profileCompleteness: 85
 */
userRouter.get(
  "/profile",
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;

      const [user] = await db
        .select({
          userId:    schema.users.userId,
          name:      schema.users.name,
          firstName: schema.users.firstName,
          lastName:  schema.users.lastName,
          email:     schema.users.email,
          role:      schema.users.role,
          gender:    schema.users.gender,
          age:       schema.users.age,
          photoUrl:  schema.users.photoUrl,
          location:  schema.users.location,
          whatsappNumber: schema.users.whatsappNumber,
          createdAt: schema.users.createdAt,
          updatedAt: schema.users.updatedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.userId, userId));

      if (!user) throw new HttpError(404, "User not found");

      // Profil job seeker — mungkin null jika belum dibuat
      const [profile] = await db
        .select({
          skills:                 schema.jobSeekerProfiles.skills,
          portfolioLink:          schema.jobSeekerProfiles.portfolioLink,
          workExperience:         schema.jobSeekerProfiles.workExperience,
          awards:                 schema.jobSeekerProfiles.awards,
          organizationExperience: schema.jobSeekerProfiles.organizationExperience,
          interests:              schema.jobSeekerProfiles.interests,
          cvUrl:                  schema.jobSeekerProfiles.cvUrl,
          profileCompleteness:    schema.jobSeekerProfiles.profileCompleteness,
          updatedAt:              schema.jobSeekerProfiles.updatedAt,
        })
        .from(schema.jobSeekerProfiles)
        .where(eq(schema.jobSeekerProfiles.userId, userId));

      return res.json(
        successResponse("Profile fetched successfully", {
          ...user,
          profile: profile ?? null,
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);

// ─── PUT /users/profile ───────────────────────────────────────────────────────
/**
 * @swagger
 * /users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Update current user profile
 *     description: |
 *       Update data user dan/atau profil job seeker sekaligus.
 *       Profile completeness dihitung ulang otomatis setiap kali ada update.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:                   { type: string }
 *               gender:                 { type: string }
 *               age:                    { type: integer }
 *               skills:                 { type: string, description: "Comma-separated atau JSON string" }
 *               portfolioLink:          { type: string, format: uri }
 *               workExperience:         { type: string, description: "JSON string array of work history" }
 *               awards:                 { type: string, description: "JSON string array of awards" }
 *               organizationExperience: { type: string, description: "JSON string array of org experience" }
 *               interests:              { type: string, description: "Comma-separated bidang minat" }
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
userRouter.put(
  "/profile",
  authenticate,
  validate({ body: updateProfileSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const body = req.body as z.infer<typeof updateProfileSchema>;

      // Pisahkan field user vs field profil
      const userFields: Partial<typeof schema.users.$inferInsert> = {};
      if (body.firstName !== undefined) userFields.firstName = body.firstName;
      if (body.lastName  !== undefined) userFields.lastName  = body.lastName;
      if (body.gender    !== undefined) userFields.gender    = body.gender;
      if (body.age       !== undefined) userFields.age       = body.age;
      if (body.location  !== undefined) userFields.location  = body.location;
      if (body.whatsappNumber !== undefined) userFields.whatsappNumber = body.whatsappNumber;

      if (body.firstName !== undefined || body.lastName !== undefined) {
        const [currUser] = await db
          .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
          .from(schema.users)
          .where(eq(schema.users.userId, userId));

        const fName = body.firstName !== undefined ? body.firstName : (currUser?.firstName ?? "");
        const lName = body.lastName !== undefined ? body.lastName : (currUser?.lastName ?? "");
        userFields.name = `${fName} ${lName}`.trim();
      }

      const profileFields: Partial<typeof schema.jobSeekerProfiles.$inferInsert> = {};
      if (body.skills                 !== undefined) profileFields.skills                 = body.skills;
      if (body.portfolioLink          !== undefined) profileFields.portfolioLink          = body.portfolioLink;
      if (body.workExperience         !== undefined) profileFields.workExperience         = body.workExperience;
      if (body.awards                 !== undefined) profileFields.awards                 = body.awards;
      if (body.organizationExperience !== undefined) profileFields.organizationExperience = body.organizationExperience;
      if (body.interests              !== undefined) profileFields.interests              = body.interests;

      // Update tabel users jika ada field-nya
      if (Object.keys(userFields).length > 0) {
        await db
          .update(schema.users)
          .set({ ...userFields, updatedAt: new Date() })
          .where(eq(schema.users.userId, userId));
      }

      // Upsert job_seeker_profiles jika ada field profil
      if (Object.keys(profileFields).length > 0) {
        // Ambil profil terkini untuk hitung completeness
        const [existing] = await db
          .select()
          .from(schema.jobSeekerProfiles)
          .where(eq(schema.jobSeekerProfiles.userId, userId));

        const merged = { ...(existing ?? {}), ...profileFields };
        const profileCompleteness = computeProfileCompleteness(merged);

        await db
          .insert(schema.jobSeekerProfiles)
          .values({ userId, ...profileFields, profileCompleteness })
          .onConflictDoUpdate({
            target: schema.jobSeekerProfiles.userId,
            set: { ...profileFields, profileCompleteness, updatedAt: new Date() },
          });
      }

      return res.json(successResponse("Profile updated successfully"));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── POST /users/cv ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /users/cv:
 *   post:
 *     tags: [Users]
 *     summary: Upload or replace CV (PDF ≤ 5 MB)
 *     description: |
 *       Upload CV ke Supabase Storage. Hanya menerima PDF, maks 5 MB.
 *       URL hasil upload disimpan di job_seeker_profiles.cv_url.
 *       Dipakai di halaman Profile ("Edit CV") dan form lamaran ("Gunakan CV dari profil saya").
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
 *                 description: File PDF, maks 5 MB
 *     responses:
 *       200:
 *         description: CV uploaded successfully
 *         content:
 *           application/json:
 *             example:
 *               data: { cvUrl: "https://..." }
 *       400:
 *         description: File bukan PDF atau melebihi 5 MB
 */
userRouter.post(
  "/cv",
  authenticate,
  authorize("job_seeker"),
  upload.single("cv"),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const file = req.file;

      if (!file) throw new HttpError(400, "CV file is required");

      // Validasi format
      if (file.mimetype !== "application/pdf") {
        throw new HttpError(400, "Only PDF files are accepted");
      }

      // Validasi ukuran (5 MB)
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new HttpError(400, "File size must not exceed 5 MB");
      }

      // Upload ke Supabase Storage — path: cv-files/{userId}/cv.pdf
      const filePath = `${userId}/cv.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("cv-files")
        .upload(filePath, file.buffer, {
          contentType: "application/pdf",
          upsert: true, // replace jika sudah ada
        });

      if (uploadError) {
        throw new HttpError(500, `Failed to upload CV: ${uploadError.message}`);
      }

      // Ambil public URL
      const { data: urlData } = supabase.storage
        .from("cv-files")
        .getPublicUrl(filePath);

      const cvUrl = urlData.publicUrl;

      // Simpan URL ke profil — upsert jika profil belum ada
      await db
        .insert(schema.jobSeekerProfiles)
        .values({ userId, cvUrl, profileCompleteness: 0 })
        .onConflictDoUpdate({
          target: schema.jobSeekerProfiles.userId,
          set: { cvUrl, updatedAt: new Date() },
        });

      return res.json(successResponse("CV uploaded successfully", { cvUrl }));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── POST /users/photo ────────────────────────────────────────────────────────
/**
 * @swagger
 * /users/photo:
 *   post:
 *     tags: [Users]
 *     summary: Upload or replace profile photo
 *     description: |
 *       Upload foto profil ke Supabase Storage.
 *       Menerima JPEG/PNG/WEBP, maks 2 MB.
 *       URL disimpan di users.photo_url.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo uploaded successfully
 *       400:
 *         description: Format tidak didukung atau ukuran melebihi 2 MB
 */
userRouter.post(
  "/photo",
  authenticate,
  upload.single("photo"),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const file = req.file;

      if (!file) throw new HttpError(400, "Photo file is required");

      const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
      if (!ALLOWED_TYPES.includes(file.mimetype)) {
        throw new HttpError(400, "Only JPEG, PNG, or WEBP images are accepted");
      }

      const MAX_SIZE = 2 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new HttpError(400, "Photo size must not exceed 2 MB");
      }

      const ext = file.mimetype.split("/")[1];
      const filePath = `${userId}/photo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        throw new HttpError(500, `Failed to upload photo: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      const photoUrl = urlData.publicUrl;

      await db
        .update(schema.users)
        .set({ photoUrl, updatedAt: new Date() })
        .where(eq(schema.users.userId, userId));

      return res.json(successResponse("Photo uploaded successfully", { photoUrl }));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── POST /users/change-password ──────────────────────────────────────────────
/**
 * @swagger
 * /users/change-password:
 *   post:
 *     tags: [Users]
 *     summary: Change password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Current password is incorrect
 */
userRouter.post(
  "/change-password",
  authenticate,
  validate({ body: changePasswordSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

      const [user] = await db
        .select({ passwordHash: schema.users.passwordHash })
        .from(schema.users)
        .where(eq(schema.users.userId, userId));

      if (!user) throw new HttpError(404, "User not found");

      const valid = await comparePassword(currentPassword, user.passwordHash);
      if (!valid) throw new HttpError(400, "Current password is incorrect");

      const newHash = await hashPassword(newPassword);
      await db
        .update(schema.users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(schema.users.userId, userId));

      return res.json(successResponse("Password changed successfully"));
    } catch (error) {
      return next(error);
    }
  }
);

// ─── DELETE /users/account ────────────────────────────────────────────────────
/**
 * @swagger
 * /users/account:
 *   delete:
 *     tags: [Users]
 *     summary: Delete own account
 *     description: Hapus akun permanen. Semua data terkait (profil, lamaran, dll) ikut terhapus via CASCADE.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 */
userRouter.delete(
  "/account",
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      await db.delete(schema.users).where(eq(schema.users.userId, userId));
      return res.json(successResponse("Account deleted successfully"));
    } catch (error) {
      return next(error);
    }
  }
);