import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/http-error.js";
import { signAccessToken } from "../lib/jwt.js";
const mockEnsureRecruiterCompanyMembership = vi.fn();
const mockEnsureRecruiterCanAccessJob = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock("../db/index.js", async () => {
    const actual = await vi.importActual("../db/index.js");
    return {
        ...actual,
        db: {
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            delete: mockDelete
        }
    };
});
vi.mock("../lib/access.js", () => ({
    ensureRecruiterCompanyMembership: mockEnsureRecruiterCompanyMembership,
    ensureRecruiterCanAccessJob: mockEnsureRecruiterCanAccessJob
}));
const { app } = await import("../app.js");
const recruiterToken = signAccessToken({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "recruiter@example.com",
    role: "recruiter"
});
const authHeader = {
    Authorization: `Bearer ${recruiterToken}`
};
describe("Jobs API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("saves draft jobs with partial data", async () => {
        mockEnsureRecruiterCompanyMembership.mockResolvedValue({
            companyId: "22222222-2222-4222-8222-222222222222"
        });
        mockInsert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                    {
                        jobId: "33333333-3333-4333-8333-333333333333",
                        companyId: "22222222-2222-4222-8222-222222222222",
                        createdBy: "11111111-1111-4111-8111-111111111111",
                        title: "Draft Product Role",
                        description: null,
                        requirements: null,
                        employmentType: null,
                        location: null,
                        category: null,
                        salaryRange: null,
                        status: "draft"
                    }
                ])
            })
        });
        const response = await request(app)
            .post("/jobs")
            .set(authHeader)
            .send({
            title: "Draft Product Role",
            status: "draft"
        });
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Job draft saved successfully");
        expect(response.body.data.status).toBe("draft");
    });
    it("rejects publishing when required fields are incomplete", async () => {
        mockEnsureRecruiterCompanyMembership.mockResolvedValue({
            companyId: "22222222-2222-4222-8222-222222222222"
        });
        const response = await request(app)
            .post("/jobs")
            .set(authHeader)
            .send({
            title: "Incomplete Published Job",
            status: "published"
        });
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain("Published jobs require complete data");
    });
    it("returns recruiter jobs with search and status filter", async () => {
        mockEnsureRecruiterCompanyMembership.mockResolvedValue({
            companyId: "22222222-2222-4222-8222-222222222222"
        });
        mockSelect.mockReturnValue({
            from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        orderBy: vi.fn().mockResolvedValue([
                            {
                                jobId: "33333333-3333-4333-8333-333333333333",
                                title: "Frontend Engineer",
                                location: "Jakarta",
                                employmentType: "Full-time",
                                category: "Engineering",
                                status: "published"
                            }
                        ])
                    })
                })
            })
        });
        const response = await request(app).get("/jobs?search=frontend&status=published").set(authHeader);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
            title: "Frontend Engineer",
            status: "published"
        });
    });
    it("enforces recruiter ownership on job update", async () => {
        mockEnsureRecruiterCanAccessJob.mockRejectedValue(new HttpError(403, "Recruiter cannot access this company"));
        const response = await request(app)
            .put("/jobs/33333333-3333-4333-8333-333333333333")
            .set(authHeader)
            .send({
            status: "closed"
        });
        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Recruiter cannot access this company");
    });
});
