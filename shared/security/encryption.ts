import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// Reversible, symmetric encryption for third-party/integration secrets
// that must be *read back* to use (e.g. recomputing an HMAC to verify an
// inbound webhook signature) — unlike a login password, which only ever
// needs one-way verification (see modules/auth/utils/password.util.ts's
// bcrypt hash/compare). Named for the TenantDeliveryConfig.credentialsEncrypted
// field that first anticipated this utility (prisma/schema.prisma's
// Delivery Integration section) and now also backs
// TenantWebhookIntegration.apiSecretEncrypted / WebhookEndpoint.signingSecret
// (see Docs/webhooks.md §7).
//
// AES-256-GCM: a random 12-byte IV per call (never reused with the same
// key) + a 16-byte auth tag that detects any tampering with the
// ciphertext. Encoded as `${iv}:${authTag}:${ciphertext}`, each part
// base64 — one string, safe to store in a single @db.Text column.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function getKey(): Buffer {
  const hex = requireEnv("ENCRYPTION_KEY");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte (64 hex character) value — generate one with `openssl rand -hex 32`");
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
