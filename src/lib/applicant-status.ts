import type { RecruiterApplicationStatus } from "../db/schema.js";
import { HttpError } from "./http-error.js";

export const APPLICANT_STATUS_MAP: Record<RecruiterApplicationStatus, string> = {
  submitted: "applied",
  reviewed: "screening",
  next_stage: "interview",
  accepted: "offer",
  rejected: "rejected"
};

export const APPLICANT_STATUS_MESSAGE_MAP: Record<RecruiterApplicationStatus, string> = {
  submitted: "Lamaran kamu telah kami terima dan sedang menunggu review recruiter.",
  reviewed: "Lamaran kamu sedang di-review oleh tim kami. Tunggu update selanjutnya ya!",
  next_stage: "Selamat! Lamaran kamu lanjut ke tahap berikutnya. Silakan cek pesan untuk detail.",
  accepted: "Selamat! Kamu diterima! Offer sudah dikirim. Cek detail offer di Messages.",
  rejected: "Maaf, saat ini kami memutuskan untuk lanjut dengan kandidat lain. Tetap semangat!"
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