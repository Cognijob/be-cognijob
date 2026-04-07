import { describe, expect, it } from "vitest";

const mapRecruiterStatusToApplicantStatus = (
  status: "submitted" | "reviewed" | "next_stage" | "accepted" | "rejected"
) => {
  switch (status) {
    case "submitted":
      return "applied";
    case "reviewed":
      return "screening";
    case "next_stage":
      return "interview";
    case "accepted":
      return "offer";
    case "rejected":
      return "rejected";
  }
};

describe("mapRecruiterStatusToApplicantStatus", () => {
  it("maps recruiter statuses to applicant statuses according to PRD", () => {
    expect(mapRecruiterStatusToApplicantStatus("submitted")).toBe("applied");
    expect(mapRecruiterStatusToApplicantStatus("reviewed")).toBe("screening");
    expect(mapRecruiterStatusToApplicantStatus("next_stage")).toBe("interview");
    expect(mapRecruiterStatusToApplicantStatus("accepted")).toBe("offer");
    expect(mapRecruiterStatusToApplicantStatus("rejected")).toBe("rejected");
  });
});
