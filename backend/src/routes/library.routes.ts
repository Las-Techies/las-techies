import { Router } from "express";
import {
  deleteConversation,
  getConversation,
  listConversations,
  postChatMessage,
} from "../controllers/library.controller";

const router = Router();

router.post("/chat", postChatMessage);
router.get("/chat/conversations", listConversations);
router.get("/chat/conversations/:conversationId", getConversation);
router.delete("/chat/conversations/:conversationId", deleteConversation);

export default router;
