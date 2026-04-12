import { and, count, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { HttpError } from "./http-error.js";

export const getRecruiterCompanyMembership = async (userId: string) => {
  const [membership] = await db
    .select()
    .from(schema.companyRecruiters)
    .where(eq(schema.companyRecruiters.userId, userId));

  return membership ?? null;
};

export const ensureRecruiterCompanyMembership = async (userId: string) => {
  const membership = await getRecruiterCompanyMembership(userId);

  if (!membership) {
    throw new HttpError(403, "Recruiter is not assigned to any company");
  }

  return membership;
};

export const ensureRecruiterCanAccessCompany = async (userId: string, companyId: string) => {
  const [membership] = await db
    .select()
    .from(schema.companyRecruiters)
    .where(
      and(
        eq(schema.companyRecruiters.userId, userId),
        eq(schema.companyRecruiters.companyId, companyId)
      )
    );

  if (!membership) {
    throw new HttpError(403, "Recruiter cannot access this company");
  }

  return membership;
};

export const ensureCompanyExists = async (companyId: string) => {
  const [company] = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.companyId, companyId));

  if (!company) {
    throw new HttpError(404, "Company not found");
  }

  return company;
};

export const getRecruiterCountForCompany = async (companyId: string) => {
  const [result] = await db
    .select({ total: count() })
    .from(schema.companyRecruiters)
    .where(eq(schema.companyRecruiters.companyId, companyId));

  return Number(result?.total ?? 0);
};

export const ensureRecruiterCanAccessJob = async (userId: string, jobId: string) => {
  const [job] = await db
    .select({
      jobId: schema.jobListings.jobId,
      companyId: schema.jobListings.companyId
    })
    .from(schema.jobListings)
    .where(eq(schema.jobListings.jobId, jobId));

  if (!job) {
    throw new HttpError(404, "Job not found");
  }

  await ensureRecruiterCanAccessCompany(userId, job.companyId);
  return job;
};
