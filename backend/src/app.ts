import express from "express";
import cors from "cors";
import { requireAuth } from "./middleware/requireAuth";
import { errorHandler } from "./middleware/errorHandler";
import quizzesRouter from "./routes/quizzes.routes";
import documentsRouter from "./routes/documents.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", requireAuth);
app.use("/api/quizzes", quizzesRouter);
app.use("/api/documents", documentsRouter);

app.use(errorHandler);
