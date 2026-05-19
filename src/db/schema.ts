import {
  boolean,
  date,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  jsonb
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["job_seeker", "recruiter"]);
export const jobStatusEnum = pgEnum("job_status", ["draft", "published", "closed"]);
export const recruiterApplicationStatusEnum = pgEnum("recruiter_application_status", [
  "submitted",
  "reviewed",
  "next_stage",
  "accepted",
  "rejected"
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "application_status",
  "new_message",
  "job_recommendation",
  "deadline_reminder"
]);

// ─── USERS ────────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    firstName: varchar("first_name", { length: 75 }),
    lastName: varchar("last_name", { length: 75 }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    gender: varchar("gender", { length: 50 }),
    age: integer("age"),
    photoUrl: text("photo_url"),
    location: varchar("location", { length: 150 }),
    whatsappNumber: varchar("whatsapp_number", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ageCheck: check("users_age_check", sql`${table.age} IS NULL OR ${table.age} >= 0`),
    roleIdx: index("idx_users_role").on(table.role)
  })
);

// ─── COMPANIES ────────────────────────────────────────────────────────────────
export const companies = pgTable("companies", {
  companyId: uuid("company_id").defaultRandom().primaryKey(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.userId, { onDelete: "restrict" }),
  companyName: varchar("company_name", { length: 200 }).notNull().unique(),
  industry: varchar("industry", { length: 150 }),
  location: varchar("location", { length: 150 }),
  workplaceTag: varchar("workplace_tag", { length: 150 }),
  description: text("description"),
  website: varchar("website", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  foundedAt: date("founded_at"),
  employeeCount: varchar("employee_count", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── COMPANY RECRUITERS ───────────────────────────────────────────────────────
export const companyRecruiters = pgTable(
  "company_recruiters",
  {
    companyRecruiterId: uuid("company_recruiter_id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.companyId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueMembership: unique("uq_company_recruiter").on(table.companyId, table.userId),
    singleCompany: unique("uq_recruiter_single_company").on(table.userId),
    companyIdx: index("idx_company_recruiters_company_id").on(table.companyId)
  })
);

// ─── JOB SEEKER PROFILES ──────────────────────────────────────────────────────
export const jobSeekerProfiles = pgTable(
  "job_seeker_profiles",
  {
    profileId: uuid("profile_id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.userId, { onDelete: "cascade" }),
    skills: text("skills"),
    portfolioLink: text("portfolio_link"),
    workExperience: jsonb("work_experience"),
    awards: jsonb("awards"),
    organizationExperience: jsonb("organization_experience"),
    interests: jsonb("interests"),
    cvUrl: text("cv_url"),
    profileCompleteness: integer("profile_completeness").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    completenessCheck: check(
      "job_seeker_profiles_completeness_check",
      sql`${table.profileCompleteness} BETWEEN 0 AND 100`
    )
  })
);

// ─── JOB APPLICATIONS ────────────────────────────────────────────────────────
export const jobApplications = pgTable(
  "job_applications",
  {
    applicationId: uuid("application_id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobListings.jobId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    isAnonymous: boolean("is_anonymous").notNull().default(true),
    cvUrl: text("cv_url").notNull(),
    recruiterStatus: recruiterApplicationStatusEnum("recruiter_status")
      .notNull()
      .default("submitted"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueApplication: unique("uq_user_job_application").on(table.jobId, table.userId),
    jobIdx: index("idx_job_applications_job_id").on(table.jobId),
    userIdx: index("idx_job_applications_user_id").on(table.userId),
    statusIdx: index("idx_job_applications_recruiter_status").on(table.recruiterStatus)
  })
);

// ─── BOOKMARKS ────────────────────────────────────────────────────────────────
export const bookmarks = pgTable(
  "bookmarks",
  {
    bookmarkId: uuid("bookmark_id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobListings.jobId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    bookmarkedAt: timestamp("bookmarked_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueBookmark: unique("uq_user_job_bookmark").on(table.jobId, table.userId),
    userIdx: index("idx_bookmarks_user_id").on(table.userId)
  })
);

export const companyFollows = pgTable(
  "company_follows",
  {
    followId: uuid("follow_id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.companyId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    followedAt: timestamp("followed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueFollow: unique("uq_user_company_follow").on(table.companyId, table.userId),
    userIdx:    index("idx_company_follows_user_id").on(table.userId),
    companyIdx: index("idx_company_follows_company_id").on(table.companyId),
  })
);

// ─── WORKPLACE RATINGS ────────────────────────────────────────────────────────
export const workplaceRatings = pgTable(
  "workplace_ratings",
  {
    ratingId: uuid("rating_id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.companyId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    ratingScore: integer("rating_score").notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    scoreCheck: check(
      "workplace_ratings_score_check",
      sql`${table.ratingScore} BETWEEN 1 AND 5`
    ),
    companyIdx: index("idx_workplace_ratings_company_id").on(table.companyId)
  })
);

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    notificationId: uuid("notification_id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    referenceId: uuid("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("idx_notifications_user_id").on(table.userId),
    isReadIdx: index("idx_notifications_is_read").on(table.isRead)
  })
);

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────
export const conversations = pgTable(
  "conversations",
  {
    conversationId: uuid("conversation_id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => jobApplications.applicationId, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobListings.jobId, { onDelete: "cascade" }),
    jobSeekerId: uuid("job_seeker_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: varchar("last_message_preview", { length: 200 }),
    unreadBySeeker: integer("unread_by_seeker").notNull().default(0),
    unreadByRecruiter: integer("unread_by_recruiter").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    seekerIdx: index("idx_conversations_job_seeker_id").on(table.jobSeekerId),
    recruiterIdx: index("idx_conversations_recruiter_id").on(table.recruiterId),
    lastMsgIdx: index("idx_conversations_last_message_at").on(table.lastMessageAt)
  })
);

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
export const messages = pgTable(
  "messages",
  {
    messageId: uuid("message_id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.conversationId, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    convIdx: index("idx_messages_conversation_id").on(table.conversationId),
    senderIdx: index("idx_messages_sender_id").on(table.senderId),
    createdIdx: index("idx_messages_created_at").on(table.createdAt)
  })
);

// ─── PASSWORD RESET TOKENS ────────────────────────────────────────────────────
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    resetTokenId: uuid("reset_token_id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("idx_password_reset_tokens_user_id").on(table.userId)
  })
);

// ─── JOB LISTINGS ────────────────────────────────────────────────────────────
export const jobListings = pgTable(
  "job_listings",
  {
    jobId: uuid("job_id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.companyId, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }),
    description: text("description"),
    requirements: text("requirements"),
    employmentType: varchar("employment_type", { length: 100 }),
    location: varchar("location", { length: 150 }),
    category: varchar("category", { length: 100 }),
    salaryRange: varchar("salary_range", { length: 100 }),
    benefits: text("benefits"),
    skills: text("skills"),
    level: varchar("level", { length: 50 }),
    status: jobStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    companyIdx: index("idx_job_listings_company_id").on(table.companyId),
    statusIdx: index("idx_job_listings_status").on(table.status)
  })
);

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type RecruiterApplicationStatus =
  (typeof recruiterApplicationStatusEnum.enumValues)[number];
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];