import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("GET /health", () => {
  it("returns API health status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Cognijob API is running");
  });
});
