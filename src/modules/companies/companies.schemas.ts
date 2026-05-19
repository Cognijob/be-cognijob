import { z } from "zod";

export const companyQuerySchema = z.object({
  search: z.string().optional()
});

export const updateCompanyProfileSchema = z
  .object({
    companyName:   z.string().trim().min(1).max(200).optional(),
    industry:      z.string().trim().min(1).max(150).optional(),
    location:      z.string().trim().min(1).max(150).optional(),
    workplaceTag:  z.string().trim().max(150).nullable().optional(),
    description:   z.string().trim().optional(),
    // ── Field baru dari migration 0001 ──────────────────────────────────────
    website:       z.url("website must be a valid URL").nullable().optional(),
    contactEmail:  z.email("contactEmail must be a valid email").nullable().optional(),
    foundedAt:     z.coerce.date().nullable().optional(),
    employeeCount: z.string().trim().max(50).nullable().optional(),
    // Contoh: "500 - 1.000", "< 50", "1.000+"
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");
