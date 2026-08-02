import type { Request, Response, NextFunction } from "express";
import {
  createQuiz,
  createQuizAssignments,
  findAssignedQuizzesForUser,
  findLatestQuizForUser,
  findLatestPublishedQuizForTeam,
  findQuizById,
  findQuizByIdForTeam,
  findTeamQuizzesWithAssignments,
  isValidQuizStatus,
  markAssignmentComplete,
  deleteQuizForTeam,
  updateQuizQuestions,
  updateQuizStatus,
} from "../models/quiz.model";
import { findDocumentByIdForTeam } from "../models/document.model";
import { findTeamById } from "../models/team.model";
import { findTeamMembersByRole, findUsersByIdsForTeam } from "../models/user.model";
import { sendMail } from "../services/mailer";
import { env } from "../config/env";
import { generateQuiz as generateQuizQuestions } from "../services/quizGenerator";
import type { GenerationConfig, QuizQuestion } from "../services/quizTypes";

// Team-scoped (not a bare findQuizById) so one team can't fetch another
// team's quiz by guessing an id — this is the primary fetch path once a
// new hire loads a specific assigned quiz by id from their list.
export async function getQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const id = Number(req.params.quizId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: "Invalid quiz id" } });
    }

    const quiz = await findQuizByIdForTeam(id, user.teamId);
    if (!quiz) return res.status(404).json({ error: { message: "Quiz not found" } });
    res.json(quiz);
  } catch (err) {
    next(err);
  }
}

// Returns "the quiz to show me" and is role-aware:
//   - manager: their most recently generated quiz (to resume editing/publishing)
//   - new hire: the latest *published* quiz on their team (their assignment) —
//     new hires author nothing, so a creator-scoped lookup would always be null.
// Responds 200 with null (not 404) when there's no quiz yet, since "no quiz" is
// a normal state here, not an error.
export async function getLatestQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quiz =
      user.role === "manager"
        ? await findLatestQuizForUser(user.id, user.teamId)
        : await findLatestPublishedQuizForTeam(user.teamId);
    res.json(quiz ?? null);
  } catch (err) {
    next(err);
  }
}

// Scoped to the requesting user's team so one team can't publish/unpublish
// another team's quiz by guessing an id.
export async function updateQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const id = Number(req.params.quizId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: "Invalid quiz id" } });
    }

    const { status } = req.body ?? {};
    if (!isValidQuizStatus(status)) {
      return res
        .status(400)
        .json({ error: { message: "status must be one of: draft, published" } });
    }

    const result = await updateQuizStatus(id, user.teamId, status);
    if (result.count === 0) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const quiz = await findQuizById(id);
    res.json(quiz);
  } catch (err) {
    next(err);
  }
}

// Deletes a draft quiz on the manager's own team.
export async function deleteQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const id = Number(req.params.quizId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: "Invalid quiz id" } });
    }

    const quiz = await findQuizByIdForTeam(id, user.teamId);
    if (!quiz) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }
    if (quiz.status !== "draft") {
      return res
        .status(400)
        .json({ error: { message: "Only draft quizzes can be deleted." } });
    }

    const result = await deleteQuizForTeam(id, user.teamId);
    if (result.count === 0) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

type QuizSourceDocument = {
  id: number;
  title: string;
  rawText: string;
};

// Integration seam: loads a document's extracted text, scoped to the team.
async function getDocumentSource(id: number, teamId: number): Promise<QuizSourceDocument> {
  const doc = await findDocumentByIdForTeam(id, teamId);
  if (!doc) {
    throw Object.assign(new Error(`Document ${id} not found`), { status: 404 });
  }
  if (doc.status !== "ready" || !doc.rawText) {
    throw Object.assign(
      new Error(`Document ${id} has no extracted text (status: ${doc.status})`),
      { status: 400 }
    );
  }
  return {
    id: doc.id,
    title: doc.title,
    rawText: doc.rawText,
  };
}

// Kept in sync with the frontend's input `max` (ConfigureQuizPage.tsx) —
// enforced here too since the frontend limit is only a UI hint and this is
// the actual guard against a request bypassing it. 30 is also a practical
// ceiling: even with batching, more than a handful of batches per quiz
// stops being a great UX (long generation time, lots of source-document
// context re-sent per batch).
const MAX_QUIZ_QUESTIONS = 30;

function parseConfig(raw: any): GenerationConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const { numQuestions, difficulty, questionTypes, topic } = raw;
  if (
    typeof numQuestions !== "number" ||
    !Number.isFinite(numQuestions) ||
    numQuestions < 1 ||
    numQuestions > MAX_QUIZ_QUESTIONS
  ) {
    return null;
  }
  if (!["easy", "medium", "hard"].includes(difficulty)) return null;
  if (!Array.isArray(questionTypes) || questionTypes.length === 0) return null;

  const config: GenerationConfig = { numQuestions, difficulty, questionTypes };
  if (typeof topic === "string" && topic.trim() !== "") config.topic = topic.trim();
  return config;
}

type QuizMetadata = {
  title?: string;
  passingScore?: number;
  timeLimitMinutes?: number;
  dueDate?: Date;
};

// All optional/best-effort: a malformed metadata field is dropped rather than
// failing the whole generation request, since the AI-generation path is the
// part worth protecting from a bad request body.
function parseMetadata(raw: any): QuizMetadata {
  const metadata: QuizMetadata = {};
  if (!raw || typeof raw !== "object") return metadata;

  if (typeof raw.moduleTitle === "string" && raw.moduleTitle.trim() !== "") {
    metadata.title = raw.moduleTitle.trim();
  }
  if (
    typeof raw.passingScore === "number" &&
    Number.isFinite(raw.passingScore) &&
    raw.passingScore >= 0 &&
    raw.passingScore <= 100
  ) {
    metadata.passingScore = raw.passingScore;
  }
  if (
    typeof raw.timeLimitMinutes === "number" &&
    Number.isFinite(raw.timeLimitMinutes) &&
    raw.timeLimitMinutes > 0
  ) {
    metadata.timeLimitMinutes = raw.timeLimitMinutes;
  }
  if (typeof raw.dueDate === "string" && raw.dueDate.trim() !== "") {
    const parsedDate = new Date(raw.dueDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      metadata.dueDate = parsedDate;
    }
  }
  return metadata;
}

// Streams progress over SSE while the LLM generates, so the frontend can show
// live "generating question X of N" feedback instead of a blind spinner.
// Once headers are flushed as text/event-stream, failures are reported as an
// "error" event in the stream (status code can no longer change), not a
// normal HTTP error response.
export async function generateQuiz(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const { documentIds } = req.body ?? {};

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return res
      .status(400)
      .json({ error: { message: "documentIds must be a non-empty array" } });
  }

  const config = parseConfig(req.body?.config);
  if (!config) {
    return res.status(400).json({ error: { message: "Invalid generation config" } });
  }

  const metadata = parseMetadata(req.body?.metadata);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const sourceDocuments = await Promise.all(
      documentIds.map((id: number) => getDocumentSource(id, user.teamId))
    );

    const questions = await generateQuizQuestions(sourceDocuments, config, {
      onProgress: ({ attempt, questionsDetected, batch, totalBatches }) => {
        send({
          type: "progress",
          attempt,
          questionsDetected,
          totalQuestions: config.numQuestions,
          batch,
          totalBatches,
        });
      },
      onQuestion: (index, question) => {
        send({ type: "question", index, question });
      },
    });

    const quiz = await createQuiz({
      teamId: user.teamId,
      createdByUserId: user.id,
      title:
        metadata.title ??
        `Quiz from document${documentIds.length > 1 ? "s" : ""} ${documentIds.join(", ")}`,
      sourceDocumentIds: documentIds,
      generationConfig: config,
      questionsPayload: questions,
      passingScore: metadata.passingScore,
      timeLimitMinutes: metadata.timeLimitMinutes,
      dueDate: metadata.dueDate,
    });

    send({ type: "done", quiz });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate quiz";
    send({ type: "error", message });
  } finally {
    res.end();
  }
}

// Mirrors the shape-checks in quizGenerator.ts's validate(), scaled down to a
// single manually-edited question rather than a whole batch. Keeps the
// original question's id regardless of what (if anything) the client sends.
function validateQuestionBody(raw: any, questionId: number): QuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.prompt !== "string" || raw.prompt.trim() === "") return null;
  if (!Array.isArray(raw.options) || raw.options.length < 2) return null;
  if (raw.options.some((o: any) => typeof o?.text !== "string" || o.text.trim() === "")) {
    return null;
  }
  const correctCount = raw.options.filter((o: any) => o?.isCorrect === true).length;
  if (correctCount !== 1) return null;
  if (typeof raw.explanation !== "string" || raw.explanation.trim() === "") return null;

  const citation = raw.citation;
  if (
    !citation ||
    typeof citation !== "object" ||
    typeof citation.sourceDocumentId !== "number" ||
    typeof citation.sourceDocumentTitle !== "string" ||
    typeof citation.sourceSnippet !== "string"
  ) {
    return null;
  }

  return {
    id: questionId,
    prompt: raw.prompt.trim(),
    type: "multiple_choice",
    options: raw.options.map((option: any, index: number) => ({
      id: typeof option.id === "number" ? option.id : index + 1,
      text: String(option.text).trim(),
      isCorrect: option.isCorrect === true,
    })),
    explanation: raw.explanation.trim(),
    citation: {
      sourceDocumentId: citation.sourceDocumentId,
      sourceDocumentTitle: citation.sourceDocumentTitle,
      sourceSnippet: citation.sourceSnippet,
    },
  };
}

// Lets a manager hand-edit a single question (prompt/options/correct
// answer/explanation) without regenerating the whole quiz.
export async function updateQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quizId = Number(req.params.quizId);
    const questionId = Number(req.params.questionId);
    if (!Number.isFinite(quizId) || !Number.isFinite(questionId)) {
      return res.status(400).json({ error: { message: "Invalid quiz or question id" } });
    }

    const quiz = await findQuizByIdForTeam(quizId, user.teamId);
    if (!quiz) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const questions = quiz.questionsPayload as unknown as QuizQuestion[];
    const index = questions.findIndex((question) => question.id === questionId);
    if (index === -1) {
      return res.status(404).json({ error: { message: "Question not found on this quiz" } });
    }

    const updatedQuestion = validateQuestionBody(req.body, questionId);
    if (!updatedQuestion) {
      return res.status(400).json({
        error: {
          message:
            "Invalid question: needs a prompt, at least 2 non-empty options with exactly one marked correct, an explanation, and a citation.",
        },
      });
    }

    const nextQuestions = [...questions];
    nextQuestions[index] = updatedQuestion;

    await updateQuizQuestions(quizId, user.teamId, nextQuestions);
    const refreshed = await findQuizById(quizId);
    res.json(refreshed);
  } catch (err) {
    next(err);
  }
}

// Removes one question and asks the AI for a single replacement drawn from
// the same source documents/config the quiz was originally generated with,
// telling it not to repeat any question still on the quiz.
export async function regenerateQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quizId = Number(req.params.quizId);
    const questionId = Number(req.params.questionId);
    if (!Number.isFinite(quizId) || !Number.isFinite(questionId)) {
      return res.status(400).json({ error: { message: "Invalid quiz or question id" } });
    }

    const quiz = await findQuizByIdForTeam(quizId, user.teamId);
    if (!quiz) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const questions = quiz.questionsPayload as unknown as QuizQuestion[];
    const index = questions.findIndex((question) => question.id === questionId);
    if (index === -1) {
      return res.status(404).json({ error: { message: "Question not found on this quiz" } });
    }

    const sourceDocumentIds = quiz.sourceDocumentIds as unknown as number[];
    if (!Array.isArray(sourceDocumentIds) || sourceDocumentIds.length === 0) {
      return res
        .status(400)
        .json({ error: { message: "Quiz has no source documents to regenerate from" } });
    }

    const baseConfig = quiz.generationConfig as unknown as GenerationConfig | null;
    if (
      !baseConfig ||
      typeof baseConfig.difficulty !== "string" ||
      !Array.isArray(baseConfig.questionTypes)
    ) {
      return res
        .status(400)
        .json({ error: { message: "Quiz is missing a valid generation config" } });
    }

    const sourceDocuments = await Promise.all(
      sourceDocumentIds.map((id) => getDocumentSource(id, user.teamId))
    );

    const avoidPrompts = questions
      .filter((_, i) => i !== index)
      .map((question) => question.prompt);

    const [replacement] = await generateQuizQuestions(
      sourceDocuments,
      { ...baseConfig, numQuestions: 1 },
      { avoidPrompts }
    );
    if (!replacement) {
      throw new Error("AI did not return a replacement question");
    }

    const nextQuestions = [...questions];
    nextQuestions[index] = { ...replacement, id: questionId };

    await updateQuizQuestions(quizId, user.teamId, nextQuestions);
    const refreshed = await findQuizById(quizId);
    res.json(refreshed);
  } catch (err) {
    next(err);
  }
}

// Assigns a quiz to a set of new hires on the manager's own team. Validates
// both that the quiz belongs to the manager's team and that every target id
// is actually a new_hire on that same team, so a manager can't assign work
// across teams or to another manager.
export async function assignQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quizId = Number(req.params.quizId);
    if (!Number.isFinite(quizId)) {
      return res.status(400).json({ error: { message: "Invalid quiz id" } });
    }

    const { userIds } = req.body ?? {};
    if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every((id) => Number.isFinite(id))) {
      return res
        .status(400)
        .json({ error: { message: "userIds must be a non-empty array of user ids" } });
    }

    const quiz = await findQuizByIdForTeam(quizId, user.teamId);
    if (!quiz) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const teamMembers = await findUsersByIdsForTeam(userIds, user.teamId);
    const validUserIds = teamMembers.map((member) => member.id);
    if (validUserIds.length === 0) {
      return res
        .status(400)
        .json({ error: { message: "None of the provided user ids belong to your team" } });
    }

    await createQuizAssignments(quizId, validUserIds, user.id);

    // Best-effort notification email for existing team members who were just
    // assigned this quiz. Assignment itself should still succeed even if
    // one or more emails fail to send.
    const quizTitle = quiz.title || "New Quiz Assignment";
    const escapedQuizTitle = quizTitle
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const pandaImageUrl =
      "https://raw.githubusercontent.com/Las-Techies/las-techies/main/frontend/src/assets/panda-cheer-fullhat.png";
    const learnerModuleLink = `${env.appUrl}/learner-module?quizId=${quiz.id}`;
    const emailResults = await Promise.allSettled(
      teamMembers.map((member) =>
        sendMail({
          to: member.email,
          subject: `📚 New quiz assigned: ${quizTitle}`,
          text: `Hi ${member.firstName},

Great news — you've been assigned a new quiz in SageForce!

Quiz: ${quizTitle}

Log in to SageForce, then open your learner module to start:
${learnerModuleLink}

If the button doesn't work, click this link:
${learnerModuleLink}

You've got this 🚀
`,
          html: `
            <div style="margin:0;padding:0;background:#eef4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0e2a47;">
              <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
                You have a new SageForce quiz assignment waiting.
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef4ff;padding:32px 12px;">
                <tr>
                  <td align="center">
                    <img
                      src="${pandaImageUrl}"
                      alt="Celebrating SageForce panda"
                      width="180"
                      style="display:block;margin:0 auto -44px;position:relative;z-index:2;border:0;outline:none;text-decoration:none;max-width:65%;height:auto;"
                    />
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #d6e4ff;box-shadow:0 16px 40px rgba(26,123,224,0.14);">
                      <tr>
                        <td style="background:linear-gradient(135deg,#1657c0 0%,#2f8bff 55%,#7bc0ff 100%);padding:56px 28px 30px;color:#ffffff;text-align:center;">
                          <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">✦ SageForce</div>
                          <div style="margin-top:10px;font-size:34px;line-height:1.15;font-weight:800;">New Quiz Assigned 📚</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:30px 34px 10px;text-align:center;">
                          <p style="margin:0 0 10px;font-size:18px;line-height:1.6;color:#173b63;">
                            Hi ${member.firstName}, you’ve been assigned a new quiz.
                          </p>
                          <p style="margin:0 0 20px;font-size:17px;line-height:1.55;color:#1e446a;">
                            <strong>${escapedQuizTitle}</strong>
                          </p>
                          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#395f86;">
                            Log in to SageForce to start your quiz.
                          </p>
                          <div style="text-align:center;margin:10px 0 18px;">
                            <a href="${learnerModuleLink}" style="display:inline-block;background:#1a7be0;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:14px 28px;border-radius:999px;box-shadow:0 6px 16px rgba(26,123,224,0.35);">
                              Open Learner Module →
                            </a>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 34px 16px;">
                          <div style="font-size:14px;line-height:1.6;color:#395f86;">
                            Button not working? Click here:
                          </div>
                          <a href="${learnerModuleLink}" style="display:inline-block;color:#1a7be0;text-decoration:underline;font-size:14px;line-height:1.6;margin-top:4px;">
                            Click here
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:18px 34px 26px;border-top:1px solid #ebf2ff;font-size:13px;line-height:1.7;color:#6a86a5;">
                          You can also find this quiz anytime in your Learner Module.<br />
                          Sent with 🐼 by SageForce
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
          `,
        })
      )
    );
    const failedEmailCount = emailResults.filter((result) => result.status === "rejected").length;

    res.status(201).json({
      data: {
        quizId,
        assignedTo: teamMembers,
        notificationSummary: {
          attempted: teamMembers.length,
          sent: teamMembers.length - failedEmailCount,
          failed: failedEmailCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// "Assigned to me" — the real per-learner counterpart to `mine/latest`
// (which only ever returns quizzes the caller *created*, so it's always
// empty for a new hire). Returns every published quiz assigned to the
// caller, soonest-due-and-still-pending first.
export async function getAssignedQuizzes(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const entries = await findAssignedQuizzesForUser(user.id);
    res.json(
      entries.map(({ assignment, quiz }) => ({
        assignmentId: assignment.id,
        quizId: quiz.id,
        title: quiz.title,
        description: quiz.description,
        dueDate: quiz.dueDate,
        status: assignment.status,
        passingScore: quiz.passingScore,
        // Durable result fields so the new hire's Progress page can render a
        // completed quiz's score/time even without the local attempt cache
        // (different browser/device, cleared storage, etc.).
        score: assignment.score,
        timeTakenSeconds: assignment.timeTakenSeconds,
        completedAt: assignment.completedAt,
        attemptCount: assignment.attemptCount,
      }))
    );
  } catch (err) {
    next(err);
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// Powers the manager dashboard (GET /api/quizzes/manager/dashboard): one
// call returns everything needed to render both a per-quiz view ("how did
// each published quiz perform") and a per-learner view ("how is each new
// hire doing across everything they've been assigned"), team-wide rather
// than scoped to just the requesting manager — new hires belong to the
// team, not to whichever manager happened to create a given quiz.
export async function getManagerDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    // A manager with no active team hasn't finished team setup yet (e.g. their
    // team creation at signup was skipped because email confirmation deferred
    // the session). This is an onboarding state, not an auth failure — signal
    // it so the dashboard can prompt them to create a team instead of showing a
    // misleading "session expired" sign-out.
    if (!user.teamId) {
      return res.json({ data: { quizzes: [], learners: [], needsTeam: true } });
    }

    const [teamQuizData, learners, activeTeam] = await Promise.all([
      findTeamQuizzesWithAssignments(user.teamId),
      findTeamMembersByRole(user.teamId, "new_hire"),
      findTeamById(user.teamId),
    ]);
    const quizzes = teamQuizData?.quizzes ?? [];
    const joinedAssignments = teamQuizData?.joinedAssignments ?? [];

    const quizSummaries = quizzes.map((quiz) => {
      const forThisQuiz = joinedAssignments
        .filter((entry) => entry.assignment.quizId === quiz.id)
        .map((entry) => entry.assignment);
      const completed = forThisQuiz.filter((assignment) => assignment.status === "completed");
      const scores = completed
        .map((assignment) => assignment.score)
        .filter((score): score is number => typeof score === "number");
      const times = completed
        .map((assignment) => assignment.timeTakenSeconds)
        .filter((time): time is number => typeof time === "number");

      return {
        id: quiz.id,
        title: quiz.title,
        status: quiz.status,
        createdAt: quiz.createdAt,
        dueDate: quiz.dueDate,
        passingScore: quiz.passingScore,
        assignedCount: forThisQuiz.length,
        completedCount: completed.length,
        averageScore: average(scores),
        averageTimeTakenSeconds: average(times),
      };
    });

    const learnerSummaries = learners.map((learner) => {
      const assignments = joinedAssignments
        .filter((entry) => entry.assignment.assignedToUserId === learner.id)
        .map(({ assignment, quiz }) => ({
          quizId: quiz.id,
          quizTitle: quiz.title,
          status: assignment.status,
          score: assignment.score,
          timeTakenSeconds: assignment.timeTakenSeconds,
          completedAt: assignment.completedAt,
          attemptCount: assignment.attemptCount,
          passingScore: quiz.passingScore,
          dueDate: quiz.dueDate,
        }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "completed" ? 1 : -1;
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return aDue - bDue;
        });

      return {
        id: learner.id,
        name: `${learner.firstName} ${learner.lastName}`.trim(),
        email: learner.email,
        assignments,
      };
    });

    res.json({
      data: {
        quizzes: quizSummaries,
        learners: learnerSummaries,
        needsTeam: false,
        // The DB is the source of truth for the manager's active team (they
        // switch teams server-side without a session refresh, so the JWT's
        // team_id can be stale). Echo it back so the client marks the right
        // team as active without reading it from the token — and its name, so
        // the team switcher shows the real team on first paint instead of a
        // placeholder while it separately loads the owned-teams list.
        activeTeamId: user.teamId,
        activeTeamName: activeTeam?.name ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Marks the caller's own assignment for this quiz complete. Best-effort by
// design: if no assignment row exists (e.g. the quiz was reached without a
// formal assignment), it still returns 200 so it never blocks the learner
// from seeing their results.
export async function completeAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quizId = Number(req.params.quizId);
    if (!Number.isFinite(quizId)) {
      return res.status(400).json({ error: { message: "Invalid quiz id" } });
    }

    const score = typeof req.body?.score === "number" ? req.body.score : undefined;
    const timeTakenSeconds =
      typeof req.body?.timeTakenSeconds === "number" && req.body.timeTakenSeconds >= 0
        ? Math.round(req.body.timeTakenSeconds)
        : undefined;
    const result = await markAssignmentComplete(quizId, user.id, score, timeTakenSeconds);
    // Relay the durable record back so the client can render it immediately
    // (chiefly attemptCount, which has no browser-local equivalent and would
    // otherwise only appear a beat later once the results page refetches).
    res.json({
      updated: result.count > 0,
      attemptCount: result.attemptCount,
      score: result.score,
      timeTakenSeconds: result.timeTakenSeconds,
      completedAt: result.completedAt,
    });
  } catch (err) {
    next(err);
  }
}
