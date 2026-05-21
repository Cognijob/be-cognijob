import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/jwt.js";
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
vi.mock("../db/index.js", async () => {
    const actual = await vi.importActual("../db/index.js");
    return {
        ...actual,
        db: {
            select: mockSelect,
            insert: mockInsert,
            delete: mockDelete
        }
    };
});
const { app } = await import("../app.js");
const jobSeekerToken = signAccessToken({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "jobseeker@example.com",
    role: "job_seeker"
});
const authHeader = {
    Authorization: `Bearer ${jobSeekerToken}`
};
// ─── DYNAMIC MOCK BUILDER FOR DRIZZLE CHAINING ──────────────────────────────
// Builder ini otomatis mendukung .from().innerJoin().where().orderBy() 
// tanpa peduli berapa kali di-chain atau apa urutannya di rute asli.
const createMockQueryChain = (resolvedValue) => {
    const chain = {
        from: vi.fn().mockImplementation(() => chain),
        innerJoin: vi.fn().mockImplementation(() => chain),
        where: vi.fn().mockImplementation(() => chain),
        orderBy: vi.fn().mockImplementation(() => chain),
        // Menghasilkan nilai akhir saat di-await oleh Drizzle
        then: (onFullfilled) => Promise.resolve(resolvedValue).then(onFullfilled)
    };
    return chain;
};
describe("Bookmarks API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("returns current user bookmarks", async () => {
        // GET /bookmarks memanggil select 2 kali: list data & hitung total data
        mockSelect
            .mockReturnValueOnce(createMockQueryChain([
            {
                bookmarkId: "b1111111-1111-4111-8111-111111111111",
                jobId: "22222222-2222-4222-8222-222222222222",
                title: "Frontend Engineer",
                companyName: "Cognijob Labs"
            }
        ]))
            .mockReturnValueOnce(createMockQueryChain([{ total: 1 }]));
        const response = await request(app).get("/bookmarks").set(authHeader);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.bookmarks).toHaveLength(1);
        expect(response.body.data.total).toBe(1);
        expect(response.body.data.bookmarks[0]).toMatchObject({
            title: "Frontend Engineer",
            companyName: "Cognijob Labs"
        });
    });
    it("creates a bookmark for an existing job", async () => {
        // Memastikan select pertama (cek lowongan) ada data, select kedua (cek duplikasi) kosong
        mockSelect
            .mockReturnValueOnce(createMockQueryChain([
            { jobId: "22222222-2222-4222-8222-222222222222", title: "Frontend Engineer" }
        ]))
            .mockReturnValueOnce(createMockQueryChain([]));
        mockInsert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                    {
                        bookmarkId: "b1111111-1111-4111-8111-111111111111",
                        jobId: "22222222-2222-4222-8222-222222222222",
                        userId: "11111111-1111-4111-8111-111111111111",
                        bookmarkedAt: new Date("2026-04-20T08:00:00.000Z")
                    }
                ])
            })
        });
        const response = await request(app)
            .post("/bookmarks/22222222-2222-4222-8222-222222222222")
            .set(authHeader);
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Job bookmarked successfully");
    });
    it("rejects duplicate bookmarks", async () => {
        // Dua-duanya mengembalikan data (lowongan ada, dan data bookmark sudah eksis)
        mockSelect
            .mockReturnValueOnce(createMockQueryChain([
            { jobId: "22222222-2222-4222-8222-222222222222" }
        ]))
            .mockReturnValueOnce(createMockQueryChain([
            { bookmarkId: "b1111111-1111-4111-8111-111111111111" }
        ]));
        const response = await request(app)
            .post("/bookmarks/22222222-2222-4222-8222-222222222222")
            .set(authHeader);
        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe("Job already bookmarked");
    });
    it("deletes an existing bookmark", async () => {
        mockSelect.mockReturnValueOnce(createMockQueryChain([
            { bookmarkId: "b1111111-1111-4111-8111-111111111111" }
        ]));
        mockDelete.mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined)
        });
        const response = await request(app)
            .delete("/bookmarks/22222222-2222-4222-8222-222222222222")
            .set(authHeader);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Bookmark removed successfully");
    });
});
