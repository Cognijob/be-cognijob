import { db, schema } from "../db/index.js";
import type { NotificationType } from "../db/schema.js";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceId?: string;
}

// Tidak throw — notifikasi tidak boleh break main flow
export const createNotification = async (params: CreateNotificationParams) => {
  try {
    const [notif] = await db
      .insert(schema.notifications)
      .values({
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        referenceId: params.referenceId ?? null,
        isRead: false
      })
      .returning();
    return notif;
  } catch (err) {
    console.error("[NotificationService] Failed:", err);
    return null;
  }
};