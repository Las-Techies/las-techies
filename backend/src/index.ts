import { app } from "./app";
import { env } from "./config/env";
import { ensureDocumentsBucket } from "./services/documentStorage";

ensureDocumentsBucket().catch((error) => {
  console.error("Failed to ensure Supabase Storage bucket exists:", error);
});

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
});
