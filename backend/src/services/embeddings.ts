import { env as transformersEnv, pipeline } from "@huggingface/transformers";
import path from "path";

// 384-dim sentence embedding model that runs entirely locally via
// Transformers.js/ONNX Runtime — no API key and no external network calls
// after the model weights are cached on first use. Matches the
// `vector(384)` column on DocumentChunk in prisma/schema.prisma.
const MODEL_ID = process.env.EMBEDDING_MODEL || "onnx-community/all-MiniLM-L6-v2-ONNX";

// Cache downloaded model weights under backend/.cache instead of the
// package default (./.cache relative to whatever the process cwd happens to
// be), so repeated `npm run dev`/script runs reuse the same download.
transformersEnv.cacheDir = path.join(__dirname, "../../.cache");

type Extractor = (
  texts: string | string[],
  options?: { pooling?: "none" | "mean" | "cls"; normalize?: boolean }
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

// Loaded once per process and reused for every embed call; the first call
// pays the model download/load cost, subsequent calls are fast.
function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID) as unknown as Promise<Extractor>;
  }
  return extractorPromise;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

export async function embedText(text: string): Promise<number[]> {
  const embeddings = await embedBatch([text]);
  const embedding = embeddings[0];
  if (!embedding) {
    throw new Error("Embedding model returned no output");
  }
  return embedding;
}
