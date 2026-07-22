import { Router } from "express";
import { upload } from "../middleware/upload";
import { requireRole } from "../middleware/requireRole";
import {
  deleteDocument,
  getMyDocuments,
  getTeamDocuments,
  importGoogleDriveDocument,
  importGoogleDriveFolder,
  importGithubRepo,
  uploadDocument,
  getDocumentById,
} from "../controllers/documents.controller";


const router = Router();

// If app.ts already has app.use("/api", requireAuth), you do NOT need requireAuth here.
router.post("/upload", requireRole("manager"), upload.single("file"), uploadDocument);
router.post("/import/google-drive", requireRole("manager"), importGoogleDriveDocument);
router.post("/import/google-drive-folder", requireRole("manager"), importGoogleDriveFolder);
router.post("/import/github-repo", requireRole("manager"), importGithubRepo);
router.get("/mine", getMyDocuments);
router.get("/team", getTeamDocuments);
router.get("/:documentId", getDocumentById);
router.delete("/:documentId", deleteDocument);

export default router;
