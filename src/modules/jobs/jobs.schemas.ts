import { z } from "zod";

const jobStatusSchema = z.enum(["draft", "published", "closed"]);
const optionalDateSchema = z.union([z.coerce.date(), z.null()]).optional();

const jobMutationFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).optional(),
  requirements: z.string().trim().min(1).optional(),
  employmentType: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().min(1).max(150).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  salaryRange: z.string().trim().max(100).nullable().optional(),
  status: jobStatusSchema.optional(),
  expiresAt: optionalDateSchema
});

export const jobParamsSchema = z.object({
  id: z.uuid()
});

export const jobQuerySchema = z.object({
  search: z.string().optional(),
  status: jobStatusSchema.optional()
});

export const createJobSchema = jobMutationFieldsSchema
  .extend({
    status: jobStatusSchema.default("draft")
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "status"),
    "At least one field must be provided"
  );

export const updateJobSchema = jobMutationFieldsSchema
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided");
