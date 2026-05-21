import { z } from "zod";
const optionalNullableText = (maxLength) => {
    const base = z.string().trim();
    const schema = maxLength ? base.max(maxLength) : base;
    return z.union([schema, z.null()]).optional();
};
export const updateUserProfileSchema = z
    .object({
    name: z.string().trim().min(1).max(150).optional(),
    gender: optionalNullableText(50),
    age: z.union([z.number().int().min(0), z.null()]).optional(),
    photoUrl: z.union([z.url(), z.null()]).optional(),
    skills: optionalNullableText(),
    portfolioLink: z.union([z.url(), z.null()]).optional(),
    workExperience: optionalNullableText(),
    awards: optionalNullableText(),
    organizationExperience: optionalNullableText(),
    interests: optionalNullableText()
})
    .refine((value) => Object.keys(value).length > 0, "At least one field must be provided");
