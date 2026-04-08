import { z } from "zod";

export const companyQuerySchema = z.object({
  search: z.string().optional()
});

export const updateCompanyProfileSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  industry: z.string().max(150).optional(),
  location: z.string().max(150).optional(),
  workplaceTag: z.string().max(150).optional(),
  description: z.string().optional()
});
