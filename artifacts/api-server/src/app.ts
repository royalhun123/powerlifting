import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { ZodError } from "zod";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: { id?: string | number; method?: string; url?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: { statusCode?: number }) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(cors({ origin: false }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);
// Cookie sessions are same-site; additionally reject browser cross-site writes.
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const host = req.get("x-forwarded-host") || req.get("host");
    if (origin && new URL(origin).host !== host) {
      res.status(403).json({ error: "Cross-site request rejected" });
      return;
    }
  }
  next();
});

app.use("/api", router);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
    return;
  }
  const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 500;
  req.log.error({ err }, "Request failed");
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: status < 500 && err instanceof Error ? err.message : "Unable to complete request. Please try again." });
});

export default app;
