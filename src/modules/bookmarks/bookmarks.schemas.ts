import { z } from "zod";

export const bookmarkParamsSchema = z.object({
  jobId: z.uuid()
});
