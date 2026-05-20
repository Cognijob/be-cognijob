import { z } from "zod";
const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long");
export const jobSeekerRegistrationSchema = z.object({
    firstName: z.string().min(1).max(75),
    lastName: z.string().min(1).max(75),
    email: z.email(),
    password: passwordSchema,
    gender: z.string().max(50).optional(),
    age: z.number().int().min(0).optional(),
    photoUrl: z.url().optional(),
    location: z.string().min(1).max(150),
    whatsappNumber: z.string().regex(/^(\+62|62|0)[0-9]{9,15}$/, "WhatsApp number must be a valid Indonesian phone number")
});
export const recruiterRegistrationSchema = z
    .object({
    firstName: z.string().min(1).max(75),
    lastName: z.string().min(1).max(75),
    email: z.email(),
    password: passwordSchema,
    companyMode: z.enum(["existing", "new"]),
    existingCompanyId: z.uuid().optional(),
    newCompany: z
        .object({
        companyName: z.string().min(1).max(200),
        industry: z.string().max(150).optional(),
        location: z.string().max(150).optional(),
        workplaceTag: z.string().max(150).optional(),
        description: z.string().optional()
    })
        .optional()
})
    .superRefine((value, ctx) => {
    if (value.companyMode === "existing" && !value.existingCompanyId) {
        ctx.addIssue({
            code: "custom",
            message: "existingCompanyId is required when companyMode is existing",
            path: ["existingCompanyId"]
        });
    }
    if (value.companyMode === "new" && !value.newCompany) {
        ctx.addIssue({
            code: "custom",
            message: "newCompany is required when companyMode is new",
            path: ["newCompany"]
        });
    }
});
export const loginSchema = z.object({
    email: z.email(),
    password: passwordSchema
});
export const forgotPasswordSchema = z.object({
    email: z.email()
});
export const resetPasswordSchema = z.object({
    token: z.string().min(1),
    newPassword: passwordSchema
});
