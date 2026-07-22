import express from "express";
import cors from "cors";
import { requireAuth } from "./middleware/requireAuth";
import { errorHandler } from "./middleware/errorHandler";
import quizzesRouter from "./routes/quizzes.routes";
import documentsRouter from "./routes/documents.routes";
import libraryRouter from "./routes/library.routes";
import invitesRouter from "./routes/invites.routes";
import teamsRouter from "./routes/teams.routes";
import { getInviteByTokenHandler } from "./controllers/invites.controller";

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || /^http:\/\/localhost:\d+$/ }))
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Public invite preview: a new hire opens the email link BEFORE they have an
// account/JWT, so the signup page must be able to validate the token without
// auth. Registered ahead of requireAuth so GET matches here and skips it.
// (POST /api/invites and POST /:token/accept still go through requireAuth.)
app.get("/api/invites/:token", getInviteByTokenHandler);

app.use("/api", requireAuth);
app.use("/api/quizzes", quizzesRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/library", libraryRouter);
app.use("/api/invites", invitesRouter);
app.use("/api/teams", teamsRouter);

app.use(errorHandler);
