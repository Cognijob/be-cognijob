import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["job_seeker", "recruiter"]);
export const jobStatusEnum = pgEnum("job_status", ["active", "closed"]);
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

export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    gender: varchar("gender", { length: 50 }),
    age: integer("age"),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ageCheck: check("users_age_check", sql`${table.age} IS NULL OR ${table.age} >= 0`),
    roleIdx: index("idx_users_role").on(table.role)
  })
);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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
    workExperience: text("work_experience"),
    awards: text("awards"),
    organizationExperience: text("organization_experience"),
    interests: text("interests"),
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
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    requirements: text("requirements").notNull(),
    employmentType: varchar("employment_type", { length: 100 }).notNull(),
    location: varchar("location", { length: 150 }).notNull(),
    salaryRange: varchar("salary_range", { length: 100 }),
    status: jobStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    companyIdx: index("idx_job_listings_company_id").on(table.companyId),
    statusIdx: index("idx_job_listings_status").on(table.status)
  })
);

export type UserRole = (typeof userRoleEnum.enumValues)[number];
