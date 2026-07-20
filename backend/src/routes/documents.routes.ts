import { Router } from "express";
import { upload } from "../middleware/upload";
// import { requireAuth } from "../middleware/requireAuth"; // optional if you want route-level auth
import {
  deleteDocument,
  getMyDocuments,
  uploadDocument,
  getDocumentById,
} from "../controllers/documents.controller";


const router = Router();

// If app.ts already has app.use("/api", requireAuth), you do NOT need requireAuth here.
router.post("/upload", upload.single("file"), uploadDocument);
router.get("/mine", getMyDocuments);
router.get("/:documentId", getDocumentById);
router.delete("/:documentId", deleteDocument);

export default router;