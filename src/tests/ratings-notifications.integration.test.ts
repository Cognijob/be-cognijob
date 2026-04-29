// src/tests/ratings-notifications.integration.test.ts
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/jwt.js";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

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
  ensureRecruiterCanAccessJob: vi.fn(),
  ensureRecruiterCanAccessCompany: vi.fn(),
  ensureCompanyExists: vi.fn(),
  getRecruiterCompanyMembership: vi.fn(),
  getRecruiterCountForCompany: vi.fn()
}));

vi.mock("../lib/notification.service.js", () => ({
  createNotification: vi.fn().mockResolvedValue(null)
}));

const { app } = await import("../app.js");

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
const COMPANY_ID = "eeee0000-0000-4000-8000-000000000005";
const NOTIF_ID = "ffff0000-0000-4000-8000-000000000006";

// ─── Ratings ─────────────────────────────────────────────────────────────────

describe("Ratings API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /ratings — job seeker with prior application can rate", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // company exists
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { companyId: COMPANY_ID, companyName: "Demo Corp" }
            ])
          })
        };
      }
      if (callCount === 2) {
        // hasApplied → found
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ applicationId: "app-123" }])
              })
            })
          })
        };
      }
      // existing rating → none
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
            ratingId: "rat-001",
            companyId: COMPANY_ID,
            ratingScore: 4,
            review: "Great culture"
          }
        ])
      })
    });

    const response = await request(app)
      .post("/ratings")
      .set(seekerHeader)
      .send({ companyId: COMPANY_ID, ratingScore: 4, review: "Great culture" });

    expect(response.status).toBe(201);
    expect(response.body.data.ratingScore).toBe(4);
  });

  it("POST /ratings — blocked if never applied to company", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { companyId: COMPANY_ID, companyName: "Demo Corp" }
            ])
          })
        };
      }
      // hasApplied → empty
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([])
            })
          })
        })
      };
    });

    const response = await request(app)
      .post("/ratings")
      .set(seekerHeader)
      .send({ companyId: COMPANY_ID, ratingScore: 3 });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You can only rate companies you have applied to");
  });

  it("POST /ratings — blocked if already rated this company", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { companyId: COMPANY_ID, companyName: "Demo Corp" }
            ])
          })
        };
      }
      if (callCount === 2) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ applicationId: "app-123" }])
              })
            })
          })
        };
      }
      // existing rating found
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ ratingId: "existing" }])
        })
      };
    });

    const response = await request(app)
      .post("/ratings")
      .set(seekerHeader)
      .send({ companyId: COMPANY_ID, ratingScore: 5 });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("You have already rated this company");
  });

  it("POST /ratings — recruiter cannot rate", async () => {
    const response = await request(app)
      .post("/ratings")
      .set(recruiterHeader)
      .send({ companyId: COMPANY_ID, ratingScore: 3 });

    expect(response.status).toBe(403);
  });
});

// ─── Notifications ────────────────────────────────────────────────────────────

describe("Notifications API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /notifications — returns paginated list with unread count", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // notifications list
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([
                    {
                      notificationId: NOTIF_ID,
                      type: "application_status",
                      title: "Status Updated",
                      body: "Your app moved to screening",
                      isRead: false,
                      createdAt: new Date().toISOString()
                    }
                  ])
                })
              })
            })
          })
        };
      }
      if (callCount === 2) {
        // total count
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 1 }])
          })
        };
      }
      // unread count
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ unread: 1 }])
        })
      };
    });

    const response = await request(app)
      .get("/notifications")
      .set(seekerHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.notifications).toHaveLength(1);
    expect(response.body.data.unreadCount).toBe(1);
  });

  it("PATCH /notifications/:id/read — marks a notification as read", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ notificationId: NOTIF_ID }])
      })
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { notificationId: NOTIF_ID, isRead: true }
          ])
        })
      })
    });

    const response = await request(app)
      .patch(`/notifications/${NOTIF_ID}/read`)
      .set(seekerHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.isRead).toBe(true);
  });

  it("PATCH /notifications/read-all — marks all as read", async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([])
      })
    });

    const response = await request(app)
      .patch("/notifications/read-all")
      .set(seekerHeader);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("All notifications marked as read");
  });

  it("GET /notifications — requires authentication", async () => {
    const response = await request(app).get("/notifications");
    expect(response.status).toBe(401);
  });
});