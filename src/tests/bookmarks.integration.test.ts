import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../lib/jwt.js";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("../db/index.js", async () => {
  const actual = await vi.importActual<typeof import("../db/index.js")>("../db/index.js");

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

describe("Bookmarks API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns current user bookmarks", async () => {
    const whereMock = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([
        {
          bookmarkId: "b1111111-1111-4111-8111-111111111111",
          jobId: "22222222-2222-4222-8222-222222222222",
          title: "Frontend Engineer",
          companyName: "Cognijob Labs"
        }
      ])
    });

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: whereMock
          })
        })
      })
    });

    const response = await request(app).get("/bookmarks").set(authHeader);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      title: "Frontend Engineer",
      companyName: "Cognijob Labs"
    });
  });

  it("creates a bookmark for an existing job", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              jobId: "22222222-2222-4222-8222-222222222222"
            }
          ])
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      });

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            bookmarkId: "b1111111-1111-4111-8111-111111111111",
            jobId: "22222222-2222-4222-8222-222222222222",
            userId: "11111111-1111-4111-8111-111111111111"
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
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              jobId: "22222222-2222-4222-8222-222222222222"
            }
          ])
        })
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              bookmarkId: "b1111111-1111-4111-8111-111111111111"
            }
          ])
        })
      });

    const response = await request(app)
      .post("/bookmarks/22222222-2222-4222-8222-222222222222")
      .set(authHeader);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Job is already bookmarked");
  });

  it("deletes an existing bookmark", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            bookmarkId: "b1111111-1111-4111-8111-111111111111"
          }
        ])
      })
    });

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
