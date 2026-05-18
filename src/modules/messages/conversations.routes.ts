// src/modules/messages/conversations.routes.ts
// Endpoint untuk fitur pesan/chat antara job seeker dan recruiter.
//
// Sebuah conversation terikat ke 1 application (1-to-1 mapping).
// Hanya recruiter yang bisa MEMBUKA conversation (saat status berubah ke next_stage/accepted).
// Job seeker maupun recruiter bisa MENGIRIM pesan setelah conversation ada.
//
// Routes:
//   GET    /conversations                  → Daftar semua conversation user (seeker & recruiter)
//   GET    /conversations/:id              → Detail conversation + pesan-pesannya (paginated)
//   POST   /conversations/:id/messages     → Kirim pesan baru
//   PATCH  /conversations/:id/read         → Tandai conversation sebagai sudah dibaca
//   POST   /conversations/applications/:applicationId  → Buka conversation baru (recruiter only)

import { and, asc, count, desc, eq, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { createNotification } from "../../lib/notification.service.js";
import { supabase } from "../../lib/supabase.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { validate } from "../../middlewares/validate.js";

export const conversationRouter = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const conversationIdParamsSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

const applicationIdParamsSchema = z.object({
  applicationId: z.string().uuid("applicationId must be a valid UUID"),
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Message body cannot be empty").max(2000),
});

const messagesQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ─── Helper: pastikan user punya akses ke conversation ini ───────────────────
async function ensureConversationAccess(conversationId: string, userId: string) {
  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.conversationId, conversationId));

  if (!conv) throw new HttpError(404, "Conversation not found");

  const isParticipant =
    conv.jobSeekerId === userId || conv.recruiterId === userId;

  if (!isParticipant) {
    throw new HttpError(403, "You do not have access to this conversation");
  }

  return conv;
}

// ─── POST /conversations/applications/:applicationId ─────────────────────────
/**
 * @swagger
 * /conversations/applications/{applicationId}:
 *   post:
 *     tags: [Conversations]
 *     summary: Open a new conversation for an application (recruiter only)
 *     description: |
 *       Recruiter membuka channel pesan untuk aplikasi tertentu.
 *       Hanya bisa dilakukan sekali per application (constraint UNIQUE).
 *       Direkomendasikan dipanggil saat status berubah ke `next_stage` atau `accepted`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Conversation opened successfully
 *       409:
 *         description: Conversation already exists for this application
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
conversationRouter.post(
  "/applications/:applicationId",
  authenticate,
  validate({ params: applicationIdParamsSchema }),
  async (req, res, next) => {
    try {
      const recruiterId = req.user!.userId;
      const { applicationId } = req.params as { applicationId: string };

      if (req.user!.role !== "recruiter") {
        throw new HttpError(403, "Only recruiters can open conversations");
      }

      // Ambil application beserta job info
      const [application] = await db
        .select({
          applicationId: schema.jobApplications.applicationId,
          jobId:         schema.jobApplications.jobId,
          userId:        schema.jobApplications.userId,
          jobTitle:      schema.jobListings.title,
          companyId:     schema.jobListings.companyId,
        })
        .from(schema.jobApplications)
        .innerJoin(
          schema.jobListings,
          eq(schema.jobApplications.jobId, schema.jobListings.jobId)
        )
        .where(eq(schema.jobApplications.applicationId, applicationId));

      if (!application) throw new HttpError(404, "Application not found");

      // Pastikan recruiter adalah anggota company yang punya job ini
      const [membership] = await db
        .select({ companyId: schema.companyRecruiters.companyId })
        .from(schema.companyRecruiters)
        .where(eq(schema.companyRecruiters.userId, recruiterId));

      if (!membership || membership.companyId !== application.companyId) {
        throw new HttpError(403, "You do not have access to this application");
      }

      // Cek sudah ada conversation untuk application ini
      const [existing] = await db
        .select({ conversationId: schema.conversations.conversationId })
        .from(schema.conversations)
        .where(eq(schema.conversations.applicationId, applicationId));

      if (existing) {
        throw new HttpError(409, "Conversation already exists for this application");
      }

      const [conversation] = await db
        .insert(schema.conversations)
        .values({
          applicationId,
          jobId:       application.jobId,
          jobSeekerId: application.userId,
          recruiterId,
        })
        .returning();

      // Notifikasi ke job seeker bahwa conversation dibuka
      await createNotification({
        userId:      application.userId,
        type:        "new_message",
        title:       "Recruiter ingin berbicara",
        body:        `Recruiter dari "${application.jobTitle ?? "sebuah perusahaan"}" membuka percakapan denganmu.`,
        referenceId: conversation.conversationId,
      });

      return res.status(201).json(
        successResponse("Conversation opened successfully", conversation)
      );
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /conversations ───────────────────────────────────────────────────────
/**
 * @swagger
 * /conversations:
 *   get:
 *     tags: [Conversations]
 *     summary: List all conversations for the current user
 *     description: |
 *       Mengembalikan semua conversation milik user (job seeker atau recruiter).
 *       Diurutkan berdasarkan last_message_at descending (terbaru di atas).
 *       Menyertakan last_message_preview dan unread count untuk tampilan list.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversations fetched successfully
 */
conversationRouter.get(
  "/",
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const role   = req.user!.role;

      // Filter berdasarkan role: job seeker lihat conversation-nya sendiri,
      // recruiter lihat conversation dari semua job milik company-nya
      const whereClause =
        role === "job_seeker"
          ? eq(schema.conversations.jobSeekerId, userId)
          : eq(schema.conversations.recruiterId, userId);

      const conversations = await db
        .select({
          conversationId:       schema.conversations.conversationId,
          applicationId:        schema.conversations.applicationId,
          jobId:                schema.conversations.jobId,
          lastMessageAt:        schema.conversations.lastMessageAt,
          lastMessagePreview:   schema.conversations.lastMessagePreview,
          unreadBySeeker:       schema.conversations.unreadBySeeker,
          unreadByRecruiter:    schema.conversations.unreadByRecruiter,
          createdAt:            schema.conversations.createdAt,
          // Job info
          jobTitle:             schema.jobListings.title,
          jobEmploymentType:    schema.jobListings.employmentType,
          jobLocation:          schema.jobListings.location,
          // Company info
          companyId:            schema.companies.companyId,
          companyName:          schema.companies.companyName,
          // Lawan bicara — job seeker lihat nama recruiter, recruiter lihat nama seeker
          // (tapi hanya jika is_anonymous = false di application)
          jobSeekerId:          schema.conversations.jobSeekerId,
          seekerName:           schema.users.name,
          seekerPhotoUrl:       schema.users.photoUrl,
          // is_anonymous dari application
          isAnonymous:          schema.jobApplications.isAnonymous,
        })
        .from(schema.conversations)
        .innerJoin(
          schema.jobListings,
          eq(schema.conversations.jobId, schema.jobListings.jobId)
        )
        .innerJoin(
          schema.companies,
          eq(schema.jobListings.companyId, schema.companies.companyId)
        )
        .innerJoin(
          schema.jobApplications,
          eq(schema.conversations.applicationId, schema.jobApplications.applicationId)
        )
        .leftJoin(
          schema.users,
          eq(schema.conversations.jobSeekerId, schema.users.userId)
        )
        .where(whereClause)
        .orderBy(desc(schema.conversations.lastMessageAt));

      // Anonymization: sembunyikan identitas seeker ke recruiter jika is_anonymous = true
      const result = conversations.map((c) => {
        const base = {
          conversationId:     c.conversationId,
          applicationId:      c.applicationId,
          jobId:              c.jobId,
          jobTitle:           c.jobTitle,
          jobEmploymentType:  c.jobEmploymentType,
          jobLocation:        c.jobLocation,
          companyId:          c.companyId,
          companyName:        c.companyName,
          lastMessageAt:      c.lastMessageAt,
          lastMessagePreview: c.lastMessagePreview,
          createdAt:          c.createdAt,
          // Unread count relevan untuk user ini
          unreadCount: role === "job_seeker" ? c.unreadBySeeker : c.unreadByRecruiter,
        };

        // Recruiter hanya lihat identitas seeker jika not anonymous
        if (role === "recruiter") {
          return {
            ...base,
            seekerId:     c.isAnonymous ? null : c.jobSeekerId,
            seekerName:   c.isAnonymous ? null : c.seekerName,
            seekerPhoto:  c.isAnonymous ? null : c.seekerPhotoUrl,
            isAnonymous:  c.isAnonymous,
          };
        }

        return base;
      });

      return res.json(
        successResponse("Conversations fetched successfully", {
          conversations: result,
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);

// ─── GET /conversations/:id ───────────────────────────────────────────────────
/**
 * @swagger
 * /conversations/{id}:
 *   get:
 *     tags: [Conversations]
 *     summary: Get conversation detail with paginated messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Conversation fetched successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Conversation not found
 */
conversationRouter.get(
  "/:id",
  authenticate,
  validate({ params: conversationIdParamsSchema, query: messagesQuerySchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { id }  = req.params as { id: string };
      const { page, limit } = req.query as unknown as z.infer<typeof messagesQuerySchema>;
      const offset = (page - 1) * limit;

      const conv = await ensureConversationAccess(id, userId);

      // Ambil pesan — tampilkan dari yang paling lama (asc) untuk tampilan chat
      const [messages, [{ total }]] = await Promise.all([
        db
          .select({
            messageId:  schema.messages.messageId,
            senderId:   schema.messages.senderId,
            senderName: schema.users.name,
            body:       schema.messages.body,
            isRead:     schema.messages.isRead,
            createdAt:  schema.messages.createdAt,
          })
          .from(schema.messages)
          .leftJoin(schema.users, eq(schema.messages.senderId, schema.users.userId))
          .where(
            and(
              eq(schema.messages.conversationId, id),
              // Exclude soft-deleted messages
              eq(schema.messages.deletedAt, null as any)
            )
          )
          .orderBy(asc(schema.messages.createdAt))
          .limit(limit)
          .offset(offset),

        db
          .select({ total: count() })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.conversationId, id),
              eq(schema.messages.deletedAt, null as any)
            )
          ),
      ]);

      const totalPages = Math.ceil(Number(total) / limit);

      return res.json(
        successResponse("Conversation fetched successfully", {
          conversation: conv,
          messages,
          pagination: {
            page, limit,
            total:      Number(total),
            totalPages,
            hasNext:    page < totalPages,
            hasPrev:    page > 1,
          },
        })
      );
    } catch (error) {
      return next(error);
    }
  }
);

// ─── POST /conversations/:id/messages ─────────────────────────────────────────
/**
 * @swagger
 * /conversations/{id}/messages:
 *   post:
 *     tags: [Conversations]
 *     summary: Send a message in a conversation
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
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Conversation not found
 */
conversationRouter.post(
  "/:id/messages",
  authenticate,
  validate({ params: conversationIdParamsSchema, body: sendMessageSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { id }  = req.params as { id: string };
      const { body: messageBody } = req.body as z.infer<typeof sendMessageSchema>;

      const conv = await ensureConversationAccess(id, userId);

      // Insert pesan baru
      const [message] = await db
        .insert(schema.messages)
        .values({
          conversationId: id,
          senderId:       userId,
          body:           messageBody,
        })
        .returning();

      // Realtime broadcast (Supabase)
      await supabase.channel(`conversation-${id}`).send({
        type: "broadcast",
        event: "new_message",
        payload: { message }
      });

      // Update conversation: last_message_at, preview, dan unread counter lawan bicara
      const isSeeker = userId === conv.jobSeekerId;
      const preview  = messageBody.slice(0, 200);

      await db
        .update(schema.conversations)
        .set({
          lastMessageAt:      message.createdAt,
          lastMessagePreview: preview,
          // Tambah unread untuk pihak yang TIDAK mengirim
          unreadBySeeker:    isSeeker ? conv.unreadBySeeker    : conv.unreadBySeeker    + 1,
          unreadByRecruiter: isSeeker ? conv.unreadByRecruiter + 1 : conv.unreadByRecruiter,
        })
        .where(eq(schema.conversations.conversationId, id));

      // Notifikasi ke lawan bicara
      const recipientId = isSeeker ? conv.recruiterId : conv.jobSeekerId;

      await createNotification({
        userId:      recipientId,
        type:        "new_message",
        title:       "Pesan baru",
        body:        preview,
        referenceId: id,
      });

      return res.status(201).json(
        successResponse("Message sent successfully", message)
      );
    } catch (error) {
      return next(error);
    }
  }
);

// ─── PATCH /conversations/:id/read ───────────────────────────────────────────
/**
 * @swagger
 * /conversations/{id}/read:
 *   patch:
 *     tags: [Conversations]
 *     summary: Mark conversation as read
 *     description: Reset unread counter untuk user yang sedang login. Dipanggil saat user membuka conversation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Conversation marked as read
 *       403:
 *         description: Access denied
 *       404:
 *         description: Conversation not found
 */
conversationRouter.patch(
  "/:id/read",
  authenticate,
  validate({ params: conversationIdParamsSchema }),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const { id }  = req.params as { id: string };

      const conv = await ensureConversationAccess(id, userId);
      const isSeeker = userId === conv.jobSeekerId;

      // Reset hanya counter untuk user ini
      await db
        .update(schema.conversations)
        .set(
          isSeeker
            ? { unreadBySeeker:    0 }
            : { unreadByRecruiter: 0 }
        )
        .where(eq(schema.conversations.conversationId, id));

      // Tandai semua pesan di conversation ini sebagai dibaca oleh user ini
      await db
        .update(schema.messages)
        .set({ isRead: true })
        .where(
          and(
            eq(schema.messages.conversationId, id),
            // Hanya pesan dari lawan bicara yang perlu di-mark
            eq(schema.messages.senderId, isSeeker ? conv.recruiterId : conv.jobSeekerId)
          )
        );

      return res.json(successResponse("Conversation marked as read"));
    } catch (error) {
      return next(error);
    }
  }
);