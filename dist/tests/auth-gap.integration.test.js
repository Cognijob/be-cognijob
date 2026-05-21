import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../db/index.js", async () => {
    const actual = await vi.importActual("../db/index.js");
    return {
        ...actual,
        db: {
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            transaction: vi.fn((cb) => cb(actual.db))
        }
    };
});
vi.mock("../lib/email.service.js", () => ({
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));
const { app } = await import("../app.js");
describe("Auth & Statistics Gap API Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("GET /public/stats", () => {
        it("returns statistics containing landing page requirements and dynamic counts", async () => {
            mockSelect.mockImplementation(() => ({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ total: 10 }])
                })
            }));
            // For total jobs and companies
            mockSelect.mockImplementationOnce(() => ({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([{ total: 120 }]) // job seekers
                })
            }));
            mockSelect.mockImplementationOnce(() => ({
                from: vi.fn().mockResolvedValue([{ total: 45 }]) // jobs
            }));
            mockSelect.mockImplementationOnce(() => ({
                from: vi.fn().mockResolvedValue([{ total: 15 }]) // companies
            }));
            const response = await request(app).get("/public/stats");
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.successRate).toBe("99.7%");
            expect(response.body.data.responseRate).toBe("53%");
            expect(response.body.data.platformCount).toBe("1 Platform");
            expect(response.body.data.totalJobSeekers).toBe(120);
            expect(response.body.data.totalJobs).toBe(45);
            expect(response.body.data.totalCompanies).toBe(15);
        });
    });
    describe("POST /auth/register/job-seeker", () => {
        it("successfully registers a new job seeker with new fields", async () => {
            // Mock no existing user
            mockSelect.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([])
                })
            });
            // Mock database inserts
            mockInsert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([
                        {
                            userId: "mock-uuid-job-seeker",
                            name: "Nadia Jasmine",
                            firstName: "Nadia",
                            lastName: "Jasmine",
                            email: "nadia@example.com",
                            role: "job_seeker",
                            location: "Jakarta, DKI Jakarta",
                            whatsappNumber: "081234567890"
                        }
                    ])
                })
            });
            const response = await request(app)
                .post("/auth/register/job-seeker")
                .send({
                firstName: "Nadia",
                lastName: "Jasmine",
                email: "nadia@example.com",
                password: "Password123",
                location: "Jakarta, DKI Jakarta",
                whatsappNumber: "081234567890"
            });
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user.firstName).toBe("Nadia");
            expect(response.body.data.user.lastName).toBe("Jasmine");
            expect(response.body.data.user.location).toBe("Jakarta, DKI Jakarta");
            expect(response.body.data.user.whatsappNumber).toBe("081234567890");
        });
        it("fails registration with invalid WhatsApp number", async () => {
            const response = await request(app)
                .post("/auth/register/job-seeker")
                .send({
                firstName: "Nadia",
                lastName: "Jasmine",
                email: "nadia@example.com",
                password: "Password123",
                location: "Jakarta, DKI Jakarta",
                whatsappNumber: "12345" // invalid
            });
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });
    describe("POST /auth/login", () => {
        it("returns Indonesian error message for invalid credentials", async () => {
            mockSelect.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([]) // no user found
                })
            });
            const response = await request(app)
                .post("/auth/login")
                .send({
                email: "nadia@example.com",
                password: "WrongPassword"
            });
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe("Email atau kata sandi salah");
        });
    });
});
