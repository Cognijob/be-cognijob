import { and, eq, gt, lte } from "drizzle-orm";
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

export const checkAndTriggerDeadlineReminders = async () => {
  try {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const now = new Date();

    const expiringJobs = await db
      .select({
        jobId: schema.jobListings.jobId,
        title: schema.jobListings.title,
        expiresAt: schema.jobListings.expiresAt
      })
      .from(schema.jobListings)
      .where(
        and(
          eq(schema.jobListings.status, "published"),
          lte(schema.jobListings.expiresAt, threeDaysFromNow),
          gt(schema.jobListings.expiresAt, now)
        )
      );

    for (const job of expiringJobs) {
      const applicants = await db
        .select({ userId: schema.jobApplications.userId })
        .from(schema.jobApplications)
        .where(eq(schema.jobApplications.jobId, job.jobId));

      for (const applicant of applicants) {
        await createNotification({
          userId: applicant.userId,
          type: "deadline_reminder",
          title: "Job Deadline Approaching",
          body: `The job "${job.title}" you applied to is closing soon!`,
          referenceId: job.jobId
        });
      }
    }
  } catch (err) {
    console.error("[NotificationService] Deadline Reminder Failed:", err);
  }
};