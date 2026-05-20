// src/modules/messages/messages.routes.ts
// Arsitektur: REST untuk CRUD, Supabase Realtime di client untuk push real-time.
// Frontend subscribe langsung ke tabel `messages` via Supabase channel.
import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { createNotification } from "../../lib/notification.service.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { validate } from "../../middlewares/validate.js";
export const messageRouter = Router();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const createConversationSchema = z.object({
    applicationId: z.uuid("applicationId must be a valid UUID")
});
const sendMessageSchema = z.object({
    body: z.string().min(1, "Message cannot be empty").max(4000)
});
const conversationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20)
});
const messageQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().datetime({ offset: true }).optional()
});
const convParamsSchema = z.object({ id: z.uuid() });
const msgParamsSchema = z.object({ convId: z.uuid(), msgId: z.uuid() });
// ─── Helper: pastikan user adalah peserta conversation ─────────────────────
const assertParticipant = async (conversationId, userId) => {
    const [conv] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.conversationId, conversationId));
    if (!conv)
        throw new HttpError(404, "Conversation not found");
    if (conv.jobSeekerId !== userId && conv.recruiterId !== userId) {
        throw new HttpError(403, "You are not a participant in this conversation");
    }
    return conv;
};
// ─── POST /conversations ──────────────────────────────────────────────────────
/**
 * @swagger
 * /conversations:
 *   post:
 *     tags: [Messages]
 *     summary: Create or get a conversation
 *     description: |
 *       Creates a conversation linked to a job application.
 *       If a conversation for that application already exists, returns it.
 *       One conversation per job-applicant pair.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [applicationId]
 *             properties:
 *               applicationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Conversation already exists
 *       201:
 *         description: Conversation created
 */
messageRouter.post("/conversations", authenticate, validate({ body: createConversationSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { applicationId } = req.body;
        const [application] = await db
            .select()
            .from(schema.jobApplications)
            .where(eq(schema.jobApplications.applicationId, applicationId));
        if (!application)
            throw new HttpError(404, "Application not found");
        const [job] = await db
            .select()
            .from(schema.jobListings)
            .where(eq(schema.jobListings.jobId, application.jobId));
        if (!job)
            throw new HttpError(404, "Job not found");
        // Cek akses: hanya job seeker yang apply atau recruiter dari company ini
        const isJobSeeker = application.userId === userId;
        const [isMember] = await db
            .select({ companyRecruiterId: schema.companyRecruiters.companyRecruiterId })
            .from(schema.companyRecruiters)
            .where(and(eq(schema.companyRecruiters.companyId, job.companyId), eq(schema.companyRecruiters.userId, userId)));
        if (!isJobSeeker && !isMember) {
            throw new HttpError(403, "You do not have access to this conversation");
        }
        // Return existing conversation jika sudah ada
        const [existing] = await db
            .select()
            .from(schema.conversations)
            .where(eq(schema.conversations.applicationId, applicationId));
        if (existing) {
            return res.json(successResponse("Conversation already exists", existing));
        }
        // Recruiter ID = created_by job (default)
        const recruiterId = job.createdBy;
        const [conv] = await db
            .insert(schema.conversations)
            .values({
            applicationId,
            jobId: application.jobId,
            jobSeekerId: application.userId,
            recruiterId
        })
            .returning();
        return res.status(201).json(successResponse("Conversation created", conv));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /conversations ───────────────────────────────────────────────────────
/**
 * @swagger
 * /conversations:
 *   get:
 *     tags: [Messages]
 *     summary: Get my conversations
 *     description: Returns conversations where the authenticated user is a participant.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Conversations fetched successfully
 */
messageRouter.get("/conversations", authenticate, validate({ query: conversationQuerySchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const role = req.user.role;
        const { page, limit } = req.query;
        const offset = (page - 1) * limit;
        const whereClause = role === "job_seeker"
            ? eq(schema.conversations.jobSeekerId, userId)
            : eq(schema.conversations.recruiterId, userId);
        const [convs, [{ total }]] = await Promise.all([
            db
                .select({
                conversationId: schema.conversations.conversationId,
                applicationId: schema.conversations.applicationId,
                jobId: schema.conversations.jobId,
                jobSeekerId: schema.conversations.jobSeekerId,
                recruiterId: schema.conversations.recruiterId,
                lastMessageAt: schema.conversations.lastMessageAt,
                lastMessagePreview: schema.conversations.lastMessagePreview,
                unreadBySeeker: schema.conversations.unreadBySeeker,
                unreadByRecruiter: schema.conversations.unreadByRecruiter,
                createdAt: schema.conversations.createdAt,
                jobTitle: schema.jobListings.title,
                companyName: schema.companies.companyName
            })
                .from(schema.conversations)
                .innerJoin(schema.jobListings, eq(schema.conversations.jobId, schema.jobListings.jobId))
                .innerJoin(schema.companies, eq(schema.jobListings.companyId, schema.companies.companyId))
                .where(whereClause)
                .orderBy(desc(schema.conversations.lastMessageAt))
                .limit(limit)
                .offset(offset),
            db.select({ total: count() }).from(schema.conversations).where(whereClause)
        ]);
        // Tambah unreadCount relatif terhadap user yang login
        const withUnread = convs.map((c) => ({
            ...c,
            unreadCount: role === "job_seeker" ? c.unreadBySeeker : c.unreadByRecruiter
        }));
        const totalPages = Math.ceil(Number(total) / limit);
        return res.json(successResponse("Conversations fetched successfully", {
            conversations: withUnread,
            pagination: {
                page,
                limit,
                total: Number(total),
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── GET /conversations/:id/messages ─────────────────────────────────────────
/**
 * @swagger
 * /conversations/{id}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: Get conversation messages
 *     description: Returns chat history. Auto-marks received messages as read. Supports cursor pagination via `before`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: before
 *         schema: { type: string, format: date-time }
 *         description: Cursor — fetch messages before this timestamp (for load more)
 *     responses:
 *       200:
 *         description: Messages fetched successfully
 *       403:
 *         description: Not a participant
 */
messageRouter.get("/conversations/:id/messages", authenticate, validate({ params: convParamsSchema, query: messageQuerySchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { limit, before } = req.query;
        const conv = await assertParticipant(id, userId);
        const filters = [
            eq(schema.messages.conversationId, id),
            isNull(schema.messages.deletedAt), // exclude soft-deleted
            before ? lt(schema.messages.createdAt, new Date(before)) : undefined
        ].filter((f) => Boolean(f));
        const msgs = await db
            .select({
            messageId: schema.messages.messageId,
            conversationId: schema.messages.conversationId,
            senderId: schema.messages.senderId,
            body: schema.messages.body,
            isRead: schema.messages.isRead,
            createdAt: schema.messages.createdAt
        })
            .from(schema.messages)
            .where(and(...filters))
            .orderBy(desc(schema.messages.createdAt))
            .limit(limit);
        // Auto mark-as-read: pesan dari lawan yang belum terbaca
        const unreadIds = msgs
            .filter((m) => m.senderId !== userId && !m.isRead)
            .map((m) => m.messageId);
        if (unreadIds.length > 0) {
            await Promise.all(unreadIds.map((msgId) => db
                .update(schema.messages)
                .set({ isRead: true })
                .where(eq(schema.messages.messageId, msgId))));
            // Reset unread counter di conversation
            const role = req.user.role;
            await db
                .update(schema.conversations)
                .set(role === "job_seeker" ? { unreadBySeeker: 0 } : { unreadByRecruiter: 0 })
                .where(eq(schema.conversations.conversationId, id));
        }
        return res.json(successResponse("Messages fetched successfully", {
            messages: msgs.reverse(), // chronological order
            hasMore: msgs.length === limit
        }));
    }
    catch (error) {
        return next(error);
    }
});
// ─── POST /conversations/:id/messages ────────────────────────────────────────
/**
 * @swagger
 * /conversations/{id}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Send a message
 *     description: |
 *       Sends a message to the conversation.
 *       Supabase Realtime will push an INSERT event to all subscribers automatically.
 *       Frontend subscribe: `supabase.channel('conv:ID').on('postgres_changes', ...)`.
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
 *                 example: Hi, we would like to invite you for an interview.
 *     responses:
 *       201:
 *         description: Message sent
 *       403:
 *         description: Not a participant
 */
messageRouter.post("/conversations/:id/messages", authenticate, validate({ params: convParamsSchema, body: sendMessageSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { body: msgBody } = req.body;
        const conv = await assertParticipant(id, userId);
        const [msg] = await db
            .insert(schema.messages)
            .values({ conversationId: id, senderId: userId, body: msgBody, isRead: false })
            .returning();
        // Update conversation preview & unread counter
        const recipientId = userId === conv.jobSeekerId ? conv.recruiterId : conv.jobSeekerId;
        const isRecipientSeeker = recipientId === conv.jobSeekerId;
        await db
            .update(schema.conversations)
            .set({
            lastMessageAt: msg.createdAt,
            lastMessagePreview: msgBody.length > 200 ? msgBody.substring(0, 200) : msgBody,
            unreadBySeeker: isRecipientSeeker ? conv.unreadBySeeker + 1 : conv.unreadBySeeker,
            unreadByRecruiter: !isRecipientSeeker
                ? conv.unreadByRecruiter + 1
                : conv.unreadByRecruiter
        })
            .where(eq(schema.conversations.conversationId, id));
        // Notifikasi ke penerima
        await createNotification({
            userId: recipientId,
            type: "new_message",
            title: "New Message",
            body: msgBody.length > 80 ? msgBody.substring(0, 80) + "..." : msgBody,
            referenceId: id
        });
        return res.status(201).json(successResponse("Message sent", msg));
    }
    catch (error) {
        return next(error);
    }
});
// ─── DELETE /conversations/:convId/messages/:msgId ────────────────────────────
/**
 * @swagger
 * /conversations/{convId}/messages/{msgId}:
 *   delete:
 *     tags: [Messages]
 *     summary: Delete a message (soft delete)
 *     description: Only the sender can delete their own message.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: convId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: msgId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Message deleted
 *       403:
 *         description: You can only delete your own messages
 *       404:
 *         description: Message not found
 *       410:
 *         description: Message already deleted
 */
messageRouter.delete("/conversations/:convId/messages/:msgId", authenticate, validate({ params: msgParamsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { convId, msgId } = req.params;
        await assertParticipant(convId, userId);
        const [msg] = await db
            .select()
            .from(schema.messages)
            .where(and(eq(schema.messages.messageId, msgId), eq(schema.messages.conversationId, convId)));
        if (!msg)
            throw new HttpError(404, "Message not found");
        if (msg.senderId !== userId) {
            throw new HttpError(403, "You can only delete your own messages");
        }
        if (msg.deletedAt)
            throw new HttpError(410, "Message already deleted");
        await db
            .update(schema.messages)
            .set({ deletedAt: new Date() })
            .where(eq(schema.messages.messageId, msgId));
        return res.json(successResponse("Message deleted"));
    }
    catch (error) {
        return next(error);
    }
});
