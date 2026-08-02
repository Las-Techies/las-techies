import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { env } from "../config/env";

// AES-256-GCM encryption for secrets we must store at rest (currently the
// per-user GitHub OAuth token) plus HMAC signing for the OAuth `state`
// parameter. Both use env.githubTokenEncKey — a single 32-byte key, supplied as
// 64 hex chars or base64. Keeping key handling in one module means the "how do
// we derive the raw key" question is answered exactly once.

const IV_LENGTH = 12; // 96-bit nonce, the standard/recommended size for GCM.

// Resolve the configured key string into raw 32 bytes. Accepts hex (64 chars)
// or base64. Throws loudly if unset or the wrong length — a misconfigured key
// must fail fast at first use, not silently produce undecryptable data.
function getKey(): Buffer {
  const raw = env.githubTokenEncKey?.trim();
  if (!raw) {
    throw new Error(
      "GITHUB_TOKEN_ENC_KEY is not set. Generate one with `openssl rand -hex 32`."
    );
  }

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "GITHUB_TOKEN_ENC_KEY must decode to 32 bytes (use `openssl rand -hex 32`)."
    );
  }
  return key;
}

// Encrypts plaintext to a self-describing "iv:tag:ciphertext" string, each part
// base64. The IV is random per call, so encrypting the same token twice yields
// different output — expected for GCM.
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

// Reverses encryptSecret. Throws if the payload is malformed or the auth tag
// fails (tampered ciphertext / wrong key) — callers treat a throw as "no usable
// token, prompt the user to reconnect."
export function decryptSecret(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted payload.");
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// HMAC-SHA256 of the given value, hex-encoded. Used to sign the OAuth `state`
// so the callback can verify the state it receives is one we issued (CSRF
// defense) without storing anything server-side.
export function signState(value: string): string {
  return createHmac("sha256", getKey()).update(value).digest("hex");
}

// Constant-time comparison of two HMAC signatures. Rejects mismatched lengths
// before timingSafeEqual (which throws on unequal-length buffers).
export function verifyStateSignature(value: string, signature: string): boolean {
  const expected = signState(value);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
