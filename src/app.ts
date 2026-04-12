import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttpModule from "pino-http";
import swaggerUi from "swagger-ui-express";
import { logger } from "./lib/logger.js";
import { swaggerSpec } from "./lib/swagger.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
const pinoHttp = pinoHttpModule.default ?? pinoHttpModule;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Cognijob API is running" });
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(apiRouter);

app.use(errorHandler);
