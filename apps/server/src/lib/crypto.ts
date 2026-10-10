import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Password hashing — scrypt (Node built-in, no native addon/bcrypt needed).
// Format: scrypt:<N>:<r>:<p>:<saltHex>:<hashHex>
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384; // CPU/memory cost factor
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt, Number(nStr), Number(rStr), Number(pStr), expected.length);
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function scryptAsync(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keyLen = KEY_LEN
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, { N, r, p, maxmem: 128 * N * r * 2 }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

// ---------------------------------------------------------------------------
// Symmetric encryption for secrets at rest (credentials, provider API keys).
// AES-256-GCM. Format: <ivHex>:<authTagHex>:<ciphertextHex>
// ---------------------------------------------------------------------------

let cachedKey: Buffer | null = null;

function resolveEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env.ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) {
      throw new Error("ENCRYPTION_KEY must decode (base64) to exactly 32 bytes");
    }
    cachedKey = key;
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY must be set in production (used to encrypt stored credentials/provider API keys). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  // Dev-only fallback: deterministic (NOT random) so encrypted rows survive
  // a restart within the same dev session — a random per-boot key would
  // make every previously-stored secret permanently undecryptable.
  console.warn(
    "[crypto] ENCRYPTION_KEY not set — using an insecure fixed development key. " +
      "Do not use this outside local development. Set ENCRYPTION_KEY in production."
  );
  cachedKey = crypto.createHash("sha256").update("dev-only-insecure-encryption-key").digest();
  return cachedKey;
}

/** Forces encryption-key resolution (and its production fail-fast check) at startup rather than on first use. */
export function ensureEncryptionKeyConfigured(): void {
  resolveEncryptionKey();
}

export function encryptSecret(plaintext: string): string {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(envelope: string): string {
  const [ivHex, tagHex, dataHex] = envelope.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted secret envelope");
  const key = resolveEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

// ---------------------------------------------------------------------------
// Opaque tokens (refresh tokens, API keys, invite/reset tokens): generated
// random, returned to the caller once, stored only as a sha256 hash — so a
// database leak never discloses a usable token.
// ---------------------------------------------------------------------------

export function generateToken(prefix: string, bytes = 32): { token: string; hash: string; visiblePrefix: string } {
  const raw = crypto.randomBytes(bytes).toString("base64url");
  const token = `${prefix}_${raw}`;
  return { token, hash: sha256Hex(token), visiblePrefix: token.slice(0, prefix.length + 9) };
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
