import { eq } from "drizzle-orm";
import { db, pool, schema } from "../index.js";
import { hashPassword } from "../../lib/password.js";

const seed = async () => {
  const recruiterEmail = "recruiter@cognijob.test";

  const existingRecruiter = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, recruiterEmail));

  if (existingRecruiter.length > 0) {
    console.log("Seed already exists. Skipping.");
    await pool.end();
    return;
  }

  const recruiterPasswordHash = await hashPassword("Recruiter123");

  const [recruiter] = await db
    .insert(schema.users)
    .values({
      name: "Recruiter Demo",
      email: recruiterEmail,
      passwordHash: recruiterPasswordHash,
      role: "recruiter"
    })
    .returning();

  const [company] = await db
    .insert(schema.companies)
    .values({
      createdBy: recruiter.userId,
      companyName: "Cognijob Demo Company",
      industry: "Technology",
      location: "Jakarta",
      workplaceTag: "Inclusive",
      description: "Demo company for local development"
    })
    .returning();

  await db.insert(schema.companyRecruiters).values({
    companyId: company.companyId,
    userId: recruiter.userId
  });

  console.log("Seed completed successfully.");
  await pool.end();
};

seed().catch(async (error) => {
  console.error("Seed failed", error);
  await pool.end();
  process.exit(1);
});
