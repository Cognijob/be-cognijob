import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/jwt.js";
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSupabaseUpload = vi.fn();
const mockSupabaseGetPublicUrl = vi.fn();
vi.mock("../db/index.js", async () => {
    const actual = await vi.importActual("../db/index.js");
    return {
        ...actual,
        db: {
            select: mockSelect,
            update: mockUpdate,
            insert: mockInsert
        }
    };
});
vi.mock("../lib/supabase.js", () => ({
    supabase: {
        storage: {
            from: vi.fn(() => ({
                upload: mockSupabaseUpload,
                getPublicUrl: mockSupabaseGetPublicUrl
            }))
        }
    }
}));
const { app } = await import("../app.js");
const jobSeekerToken = signAccessToken({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "jobseeker@example.com",
    role: "job_seeker"
});
const authHeader = {
    Authorization: `Bearer ${jobSeekerToken}`
};
const profileRow = {
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Naura Belva",
    email: "jobseeker@example.com",
    role: "job_seeker",
    gender: "female",
    age: 20,
    photoUrl: "https://example.com/photo.jpg",
    skills: "React, TypeScript",
    portfolioLink: "https://portfolio.example.com",
    workExperience: "Frontend intern",
    awards: "Hackathon winner",
    organizationExperience: "Campus tech club",
    interests: "Product engineering",
    cvUrl: null,
    cvFileName: null,
    cvFileSize: null,
    cvMimeType: null,
    cvStoragePath: null,
    cvUploadedAt: null,
    profileCompleteness: 82,
    updatedAt: new Date("2026-04-26T10:00:00.000Z")
};
// ─── UTILITY MOCK UTAMA YANG DISESUAIKAN KODE ASLI ───────────────────────────
// Memanfaatkan tracker callCount agar query pertama memberikan data User, 
// dan query kedua memberikan data Profile (sesuai urutan await db.select() di rute)
const mockProfileRead = (profile = profileRow) => {
    let callCount = 0;
    mockSelect.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(async () => {
                callCount++;
                if (callCount === 1)
                    return [profileRow]; // Query pertama ke schema.users
                return profile ? [profile] : []; // Query kedua ke schema.jobSeekerProfiles
            })
        })
    }));
};
const mockInsertUpsert = () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockInsert.mockReturnValue({ values });
    return { values, onConflictDoUpdate };
};
// Fungsi pembantu mock untuk select single row (dipakai di PUT dan POST)
const mockSingleSelect = (rows) => {
    mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(rows)
        })
    });
};
// ─── TEST SUITE ──────────────────────────────────────────────────────────────
describe("Profile API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSupabaseUpload.mockResolvedValue({ error: null });
        mockSupabaseGetPublicUrl.mockReturnValue({
            data: {
                publicUrl: "https://example.supabase.co/storage/v1/object/public/cv-files/cv.pdf"
            }
        });
    });
    it("returns the authenticated job seeker profile", async () => {
        mockProfileRead(profileRow);
        const response = await request(app).get("/users/profile").set(authHeader);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
            userId: profileRow.userId,
            name: profileRow.name,
            profile: {
                skills: profileRow.skills,
                cvFileName: profileRow.cvFileName
            }
        });
    });
    it("returns a compact authenticated job seeker profile preview", async () => {
        mockProfileRead(profileRow);
        const response = await request(app).get("/users/profile/preview").set(authHeader);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
            userId: profileRow.userId,
            name: profileRow.name,
            headline: profileRow.skills,
            hasCv: false,
            profileCompleteness: profileRow.profileCompleteness
        });
    });
    it("updates the authenticated job seeker profile", async () => {
        const updatedProfile = {
            ...profileRow,
            skills: "React, TypeScript, Node.js",
            interests: "Product engineering and accessibility"
        };
        mockSingleSelect([profileRow]);
        const { values } = mockInsertUpsert();
        const response = await request(app).put("/users/profile").set(authHeader).send({
            skills: "React, TypeScript, Node.js",
            interests: "Product engineering and accessibility"
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Profile updated successfully");
        expect(values).toHaveBeenCalledWith(expect.objectContaining({
            userId: profileRow.userId,
            skills: updatedProfile.skills,
            interests: updatedProfile.interests
        }));
    });
    it("uploads and saves the authenticated job seeker CV", async () => {
        const updatedProfile = {
            ...profileRow,
            cvUrl: "https://example.supabase.co/storage/v1/object/public/cv-files/cv.pdf",
            cvFileName: "resume.pdf",
            cvFileSize: 8,
            cvMimeType: "application/pdf",
            cvStoragePath: "11111111-1111-4111-8111-111111111111/cv.pdf",
            cvUploadedAt: new Date("2026-04-30T00:00:00.000Z"),
            profileCompleteness: 91
        };
        mockSingleSelect([profileRow]);
        const { values } = mockInsertUpsert();
        const response = await request(app)
            .post("/users/cv")
            .set(authHeader)
            .attach("cv", Buffer.from("%PDF-1.4"), {
            filename: "resume.pdf",
            contentType: "application/pdf"
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.cvUrl).toBe(updatedProfile.cvUrl);
        expect(response.body.data.cvFileName).toBe(updatedProfile.cvFileName);
        expect(mockSupabaseUpload).toHaveBeenCalledTimes(1);
        expect(values).toHaveBeenCalledWith(expect.objectContaining({
            userId: profileRow.userId,
            cvUrl: updatedProfile.cvUrl,
            cvFileName: updatedProfile.cvFileName,
            cvMimeType: updatedProfile.cvMimeType,
            cvStoragePath: updatedProfile.cvStoragePath
        }));
    });
});
