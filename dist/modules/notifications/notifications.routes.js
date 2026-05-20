// src/modules/notifications/notifications.routes.ts
import { and, count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { successResponse } from "../../lib/api-response.js";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { validate } from "../../middlewares/validate.js";
export const notificationRouter = Router();
const notificationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    isRead: z
        .string()
        .optional()
        .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
    type: z
        .enum(["application_status", "new_message", "job_recommendation", "deadline_reminder"])
        .optional()
});
const notifParamsSchema = z.object({ id: z.uuid() });
// ─── GET /notifications ───────────────────────────────────────────────────────
/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get my notifications
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
 *         name: isRead
 *         schema: { type: boolean }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [application_status, new_message, job_recommendation, deadline_reminder] }
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
 */
notificationRouter.get("/", authenticate, validate({ query: notificationQuerySchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { page, limit, isRead, type } = req.query;
        const offset = (page - 1) * limit;
        const filters = [
            eq(schema.notifications.userId, userId),
            isRead !== undefined ? eq(schema.notifications.isRead, isRead) : undefined,
            type ? eq(schema.notifications.type, type) : undefined
        ].filter((f) => Boolean(f));
        const whereClause = and(...filters);
        const [notifs, [{ total }], [{ unread }]] = await Promise.all([
            db
                .select()
                .from(schema.notifications)
                .where(whereClause)
                .orderBy(desc(schema.notifications.createdAt))
                .limit(limit)
                .offset(offset),
            db.select({ total: count() }).from(schema.notifications).where(whereClause),
            db
                .select({ unread: count() })
                .from(schema.notifications)
                .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.isRead, false)))
        ]);
        const totalPages = Math.ceil(Number(total) / limit);
        return res.json(successResponse("Notifications fetched successfully", {
            notifications: notifs,
            unreadCount: Number(unread),
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
// ─── PATCH /notifications/read-all ───────────────────────────────────────────
/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
notificationRouter.patch("/read-all", authenticate, async (req, res, next) => {
    try {
        await db
            .update(schema.notifications)
            .set({ isRead: true })
            .where(and(eq(schema.notifications.userId, req.user.userId), eq(schema.notifications.isRead, false)));
        return res.json(successResponse("All notifications marked as read"));
    }
    catch (error) {
        return next(error);
    }
});
// ─── PATCH /notifications/:id/read ───────────────────────────────────────────
/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
notificationRouter.patch("/:id/read", authenticate, validate({ params: notifParamsSchema }), async (req, res, next) => {
    try {
        const { id } = req.params;
        const [notif] = await db
            .select({ notificationId: schema.notifications.notificationId })
            .from(schema.notifications)
            .where(and(eq(schema.notifications.notificationId, id), eq(schema.notifications.userId, req.user.userId)));
        if (!notif)
            throw new HttpError(404, "Notification not found");
        const [updated] = await db
            .update(schema.notifications)
            .set({ isRead: true })
            .where(eq(schema.notifications.notificationId, id))
            .returning();
        return res.json(successResponse("Notification marked as read", updated));
    }
    catch (error) {
        return next(error);
    }
});
// ─── DELETE /notifications/:id ────────────────────────────────────────────────
/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 */
notificationRouter.delete("/:id", authenticate, validate({ params: notifParamsSchema }), async (req, res, next) => {
    try {
        const { id } = req.params;
        const [notif] = await db
            .select({ notificationId: schema.notifications.notificationId })
            .from(schema.notifications)
            .where(and(eq(schema.notifications.notificationId, id), eq(schema.notifications.userId, req.user.userId)));
        if (!notif)
            throw new HttpError(404, "Notification not found");
        await db
            .delete(schema.notifications)
            .where(eq(schema.notifications.notificationId, id));
        return res.json(successResponse("Notification deleted"));
    }
    catch (error) {
        return next(error);
    }
});
