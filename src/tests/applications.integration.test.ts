// src/tests/applications.integration.test.ts
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/http-error.js";
import { signAccessToken } from "../lib/jwt.js";
import { jobApplicantsRouter } from "../routes/applications.routes.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEnsureRecruiterCanAccessJob = vi.fn();

vi.mock("../db/index.js", async () => {
  const actual = await vi.importActual<typeof import("../db/index.js")>("../db/index.js");
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
  ensureRecruiterCompanyMembership: vi.fn(),
  ensureRecruiterCanAccessJob: mockEnsureRecruiterCanAccessJob,
  ensureRecruiterCanAccessCompany: vi.fn(),
  ensureCompanyExists: vi.fn(),
  getRecruiterCompanyMembership: vi.fn(),
  getRecruiterCountForCompany: vi.fn()
}));

// Stub notification so it doesn't fail
vi.mock("../lib/notification.service.js", () => ({
  createNotification: vi.fn().mockResolvedValue(null)
}));

const { app } = await import("../app.js");

// ─── Tokens ───────────────────────────────────────────────────────────────────

const seekerToken = signAccessToken({
  userId: "aaaa0000-0000-4000-8000-000000000001",
  email: "seeker@example.com",
  role: "job_seeker"
});

const recruiterToken = signAccessToken({
  userId: "bbbb0000-0000-4000-8000-000000000002",
  email: "recruiter@example.com",
  role: "recruiter"
});

const seekerHeader = { Authorization: `Bearer ${seekerToken}` };
const recruiterHeader = { Authorization: `Bearer ${recruiterToken}` };

const JOB_ID = "cccc0000-0000-4000-8000-000000000003";
const APP_ID = "dddd0000-0000-4000-8000-000000000004";

// ─── Helper: chain mock for db.select().from().where().limit() ────────────────
const makeSelectChain = (result: unknown[]) =>
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        offset: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result)
        })
      }),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(result)
            })
          })
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(result)
              })
            })
          })
        })
      }),
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result)
      })
    })
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Applications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /applications ───────────────────────────────────────────────────

  it("POST /applications — job seeker can apply to a published job", async () => {
    // Call 1: find job
    // Call 2: check duplicate
    // Call 3: insert application
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                jobId: JOB_ID,
                title: "Frontend Dev",
                status: "published",
                expiresAt: null
              }
            ])
          })
        };
      }
      // duplicate check → empty
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      };
    });

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            applicationId: APP_ID,
            jobId: JOB_ID,
            userId: "aaaa0000-0000-4000-8000-000000000001",
            isAnonymous: true,
            cvUrl: "https://storage.supabase.co/cv.pdf",
            recruiterStatus: "submitted"
          }
        ])
      })
    });

    const response = await request(app)
      .post("/applications")
      .set(seekerHeader)
      .send({
        jobId: JOB_ID,
        isAnonymous: true,
        cvUrl: "https://storage.supabase.co/cv.pdf"
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Application submitted successfully");
    expect(response.body.data.recruiterStatus).toBe("submitted");
  });

  it("POST /applications — rejects duplicate application", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { jobId: JOB_ID, title: "Frontend Dev", status: "published", expiresAt: null }
            ])
          })
        };
      }
      // duplicate exists
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ applicationId: APP_ID }])
        })
      };
    });

    const response = await request(app)
      .post("/applications")
      .set(seekerHeader)
      .send({
        jobId: JOB_ID,
        cvUrl: "https://storage.supabase.co/cv.pdf"
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("You have already applied to this job");
  });

  it("POST /applications — rejects apply to non-published job", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { jobId: JOB_ID, title: "Draft Job", status: "draft", expiresAt: null }
        ])
      })
    });

    const response = await request(app)
      .post("/applications")
      .set(seekerHeader)
      .send({ jobId: JOB_ID, cvUrl: "https://storage.supabase.co/cv.pdf" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("This job is not accepting applications");
  });

  it("POST /applications — recruiter cannot apply", async () => {
    const response = await request(app)
      .post("/applications")
      .set(recruiterHeader)
      .send({ jobId: JOB_ID, cvUrl: "https://storage.supabase.co/cv.pdf" });

    expect(response.status).toBe(403);
  });

  // ── GET /applications/:id/status ────────────────────────────────────────

  it("GET /applications/:id/status — returns applicant-facing status", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                applicationId: APP_ID,
                jobId: JOB_ID,
                recruiterStatus: "reviewed",
                appliedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                jobTitle: "Frontend Dev",
                companyName: "Cognijob Demo"
              }
            ])
          })
        })
      })
    });

    const response = await request(app)
      .get(`/applications/${APP_ID}/status`)
      .set(seekerHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.recruiterStatus).toBe("reviewed");
    expect(response.body.data.applicantStatus).toBe("screening");
  });

  // ── PATCH /applications/:id/status ──────────────────────────────────────

  it("PATCH /applications/:id/status — valid transition submitted→reviewed", async () => {
    mockEnsureRecruiterCanAccessJob.mockResolvedValue({
      jobId: JOB_ID,
      companyId: "comp-001"
    });

    let selectCall = 0;
    mockSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                applicationId: APP_ID,
                jobId: JOB_ID,
                userId: "aaaa0000-0000-4000-8000-000000000001",
                recruiterStatus: "submitted"
              }
            ])
          })
        };
      }
      // job title fetch
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ title: "Frontend Dev" }])
        })
      };
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              applicationId: APP_ID,
              recruiterStatus: "reviewed",
              updatedAt: new Date().toISOString()
            }
          ])
        })
      })
    });

    const response = await request(app)
      .patch(`/applications/${APP_ID}/status`)
      .set(recruiterHeader)
      .send({ status: "reviewed" });

    expect(response.status).toBe(200);
    expect(response.body.data.recruiterStatus).toBe("reviewed");
    expect(response.body.data.applicantStatus).toBe("screening");
  });

  it("PATCH /applications/:id/status — rejects invalid transition submitted→accepted", async () => {
    mockEnsureRecruiterCanAccessJob.mockResolvedValue({
      jobId: JOB_ID,
      companyId: "comp-001"
    });

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            applicationId: APP_ID,
            jobId: JOB_ID,
            userId: "aaaa0000-0000-4000-8000-000000000001",
            recruiterStatus: "submitted"
          }
        ])
      })
    });

    const response = await request(app)
      .patch(`/applications/${APP_ID}/status`)
      .set(recruiterHeader)
      .send({ status: "accepted" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Cannot transition from "submitted" to "accepted"');
  });

  it("PATCH /applications/:id/status — recruiter without job access is denied", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            applicationId: APP_ID,
            jobId: JOB_ID,
            userId: "aaaa0000-0000-4000-8000-000000000001",
            recruiterStatus: "submitted"
          }
        ])
      })
    });

    mockEnsureRecruiterCanAccessJob.mockRejectedValue(
      new HttpError(403, "Recruiter cannot access this company")
    );

    const response = await request(app)
      .patch(`/applications/${APP_ID}/status`)
      .set(recruiterHeader)
      .send({ status: "reviewed" });

    expect(response.status).toBe(403);
  });
});

