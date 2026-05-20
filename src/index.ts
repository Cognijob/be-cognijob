import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

// Hanya jalankan server jika bukan di Vercel
if (process.env.VERCEL !== "1") {
  app.listen(env.PORT, () => {
    logger.info(`Server running on ${env.APP_BASE_URL}`);
  });
}

export default app;