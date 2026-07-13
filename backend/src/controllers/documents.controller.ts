import type { NextFunction, Request, Response } from "express";
import {
  createDocument,
  findDocumentByIdForTeam,
} from "../models/document.model";
import { extractTextFromDocument } from "../services/documentProcessor";

type AuthUser = {
  id: number;
  teamId: number;
};

export async function uploadDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: "No file uploaded" } });
    }

    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    try {
      const rawText = await extractTextFromDocument(file);

      const document = await createDocument({
        teamId: user.teamId,
        uploadedByUserId: user.id,
        title: file.originalname,
        sourceType: "upload",
        rawText,
        status: "ready",
      });

      return res.status(201).json({
        data: {
          id: document.id,
          title: document.title,
          status: document.status,
          createdAt: document.createdAt,
        },
      });
    } catch (error) {
      const failedDocument = await createDocument({
        teamId: user.teamId,
        uploadedByUserId: user.id,
        title: file.originalname,
        sourceType: "upload",
        rawText: null,
        status: "failed",
      });

      return res.status(422).json({
        error: { message: (error as Error).message },
        data: {
          id: failedDocument.id,
          status: failedDocument.status,
        },
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function getDocumentById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res
        .status(400)
        .json({ error: { message: "Invalid documentId" } });
    }

    const user = (req as any).user as AuthUser | undefined;
    if (!user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const document = await findDocumentByIdForTeam(documentId, user.teamId);

    if (!document) {
      return res.status(404).json({ error: { message: "Document not found" } });
    }

    return res.json({ data: document });
  } catch (error) {
    next(error);
  }
}