// src/modules/applications/application-summary.routes.ts
// GET /applications/summary
//
// Mengembalikan count lamaran per status untuk job seeker yang sedang login.
// Dipakai di halaman "Applicant Status" — bagian "Ringkasan Status":
//
// Submitted: 1  Reviewed: 1  Next Stage: 1  Accepted: 1  Rejected: 1
//
// URUTAN MOUNT — route ini HARUS didaftarkan SEBELUM /:id di app.ts
// agar Express tidak salah parse string "summary" sebagai UUID parameter.
//
// Cara mount yang benar di src/app.ts / routes/index.ts:
// - app.use("/applications/summary", applicationSummaryRouter);  // ← dulu
// - app.use("/applications", applicationRouter);          // ← belakangan
import { count, eq } from "drizzle-orm";
import { Router } from "express";
import { db, schema } from "../../db/index.js";
import { APPLICANT_STATUS_MAP } from "../../lib/applicant-status.js";
import { successResponse } from "../../lib/api-response.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
export const applicationSummaryRouter = Router();
const ALL_STATUSES = [
    "submitted",
    "reviewed",
    "next_stage",
    "accepted",
    "rejected",
];
/**
 * @swagger
 * /applications/summary:
 *   get:
 *     tags: [Applications]
 *     summary: Get application status summary (job seeker)
 *     description: |
 *       Mengembalikan total lamaran dan breakdown count per status.
 *       Semua 5 status selalu ada di response meskipun count-nya 0,
 *       sehingga frontend tidak perlu null-check.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               data:
 *                 total: 5
 *                 byStatus:
 *                   submitted:  { applicantLabel: "applied",    count: 1 }
 *                   reviewed:   { applicantLabel: "screening",  count: 1 }
 *                   next_stage: { applicantLabel: "interview",  count: 1 }
 *                   accepted:   { applicantLabel: "offer",      count: 1 }
 *                   rejected:   { applicantLabel: "rejected",   count: 1 }
 */
applicationSummaryRouter.get("/", authenticate, authorize("job_seeker"), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        // Satu query GROUP BY — lebih efisien daripada 5 query terpisah
        const rows = await db
            .select({
            status: schema.jobApplications.recruiterStatus,
            count: count(),
        })
            .from(schema.jobApplications)
            .where(eq(schema.jobApplications.userId, userId))
            .groupBy(schema.jobApplications.recruiterStatus);
        const countMap = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
        // Pastikan semua 5 status selalu ada (count 0 jika tidak ada data)
        const byStatus = Object.fromEntries(ALL_STATUSES.map((status) => [
            status,
            {
                applicantLabel: APPLICANT_STATUS_MAP[status],
                count: countMap[status] ?? 0,
            },
        ]));
        const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
        return res.json(successResponse("Application summary fetched successfully", {
            total,
            byStatus,
        }));
    }
    catch (error) {
        return next(error);
    }
});
