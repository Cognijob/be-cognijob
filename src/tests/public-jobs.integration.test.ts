// src/tests/public-jobs.integration.test.ts
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();

vi.mock("../db/index.js", async () => {
  const actual = await vi.importActual<typeof import("../db/index.js")>("../db/index.js");
  return {
    ...actual,
    db: {
      select: mockSelect,
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  };
});

vi.mock("../lib/access.js", () => ({
  ensureRecruiterCompanyMembership: vi.fn(),
  ensureRecruiterCanAccessJob: vi.fn(),
  ensureRecruiterCanAccessCompany: vi.fn(),
  ensureCompanyExists: vi.fn(),
  getRecruiterCompanyMembership: vi.fn(),
  getRecruiterCountForCompany: vi.fn()
}));

const { app } = await import("../app.js");

describe("Public Jobs API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /public/jobs — returns published jobs without auth", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // job list
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([
                      {
                        jobId: "job-001",
                        title: "Backend Engineer",
                        status: "published",
                        companyName: "Cognijob Demo"
                      }
                    ])
                  })
                })
              })
            })
          })
        };
      }
      // count
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 1 }])
        })
      };
    });

    const response = await request(app).get("/public/jobs");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.jobs).toHaveLength(1);
    expect(response.body.data.pagination).toBeDefined();
  });

  it("GET /public/jobs — supports search filter", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([])
                  })
                })
              })
            })
          })
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }])
        })
      };
    });

    const response = await request(app).get("/public/jobs?search=designer");

    expect(response.status).toBe(200);
    expect(response.body.data.jobs).toHaveLength(0);
  });

  it("GET /public/jobs/:id — returns 404 for non-existent job", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      })
    });

    const response = await request(app).get(
      "/public/jobs/ffffffff-ffff-4fff-8fff-ffffffffffff"
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Job not found");
  });
});