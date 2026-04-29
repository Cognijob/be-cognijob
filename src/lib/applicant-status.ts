import type { RecruiterApplicationStatus } from "../db/schema.js";
import { HttpError } from "./http-error.js";

export const APPLICANT_STATUS_MAP: Record<RecruiterApplicationStatus, string> = {
  submitted: "applied",
  reviewed: "screening",
  next_stage: "interview",
  accepted: "offer",
  rejected: "rejected"
};

// Valid next statuses per current status
const VALID_TRANSITIONS: Record<RecruiterApplicationStatus, RecruiterApplicationStatus[]> = {
  submitted: ["reviewed", "rejected"],
  reviewed: ["next_stage", "rejected"],
  next_stage: ["accepted", "rejected"],
  accepted: [],
  rejected: []
};

export const assertValidStatusTransition = (
  current: RecruiterApplicationStatus,
  next: RecruiterApplicationStatus
) => {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new HttpError(
      400,
      `Cannot transition from "${current}" to "${next}". Allowed: ${
        allowed.length ? allowed.join(", ") : "none (terminal status)"
      }`
    );
  }
};