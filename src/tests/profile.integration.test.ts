import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/jwt.js";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockSupabaseUpload = vi.fn();
const mockSupabaseGetPublicUrl = vi.fn();

vi.mock("../db/index.js", async () => {
  const actual = await vi.importActual<typeof import("../db/index.js")>("../db/index.js");

  return {
    ...actual,
    db: {
      select: mockSelect,
      update: mockUpdate,
      transaction: mockTransaction
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

type ProfileRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  gender: string;
  age: number;
  photoUrl: string;
  skills: string;
  portfolioLink: string;
  workExperience: string;
  awards: string;
  organizationExperience: string;
  interests: string;
  cvUrl: string | null;
  cvFileName: string | null;
  cvFileSize: number | null;
  cvMimeType: string | null;
  cvStoragePath: string | null;
  cvUploadedAt: Date | null;
  profileCompleteness: number;
  updatedAt: Date;
};

const profileRow: ProfileRow = {
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

const mockSelectProfile = (...rows: ProfileRow[]) => {
  const whereMock = vi
    .fn()
    .mockResolvedValueOnce(rows[0] ? [rows[0]] : [])
    .mockResolvedValueOnce(rows[1] ? [rows[1]] : rows[0] ? [rows[0]] : []);

  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: whereMock
      })
    })
  });
};

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
    mockSelectProfile(profileRow);

    const response = await request(app).get("/users/profile").set(authHeader);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      userId: profileRow.userId,
      name: profileRow.name
    });
  });

  it("returns a compact authenticated job seeker profile preview", async () => {
    mockSelectProfile(profileRow);

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

    mockSelectProfile(profileRow, {
      ...updatedProfile,
      profileCompleteness: 82
    });

    const txUpdateUserWhere = vi.fn().mockResolvedValue(undefined);
    const txUpdateProfileWhere = vi.fn().mockResolvedValue(undefined);
    const txUpdateUserSet = vi.fn().mockReturnValue({ where: txUpdateUserWhere });
    const txUpdateProfileSet = vi.fn().mockReturnValue({ where: txUpdateProfileWhere });

    const tx = {
      update: vi
        .fn()
        .mockReturnValueOnce({ set: txUpdateUserSet })
        .mockReturnValueOnce({ set: txUpdateProfileSet })
    };

    mockTransaction.mockImplementation(async (callback) => callback(tx));

    const response = await request(app).put("/users/profile").set(authHeader).send({
      skills: "React, TypeScript, Node.js",
      interests: "Product engineering and accessibility"
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skills).toBe(updatedProfile.skills);
    expect(response.body.data.interests).toBe(updatedProfile.interests);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
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

    mockSelectProfile(profileRow, updatedProfile);

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockUpdate.mockReturnValue({ set: updateSet });

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
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
