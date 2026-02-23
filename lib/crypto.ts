/**
 * lib/crypto.ts — Application-layer encryption for patient phone numbers.
 *
 * Algorithm: AES-256-GCM (authenticated encryption — detects tampering)
 * Key size:  256-bit (32 bytes), from PHONE_ENCRYPTION_KEY env var (64 hex chars)
 * IV:        Random 96-bit per encryption (GCM recommended size)
 * Auth tag:  128-bit, appended to ciphertext
 *
 * Wire format stored in DB:
 *   patient_phone_encrypted = base64(iv) + "." + base64(ciphertext + authtag)
 *
 * Dedup index uses HMAC-SHA256 (not plain SHA-256 — plain is rainbow-table reversible
 * for 10-digit numbers in milliseconds; HMAC requires the secret to reverse).
 *
 * Key rotation procedure (documented, not automated):
 *   1. Generate new PHONE_ENCRYPTION_KEY_NEW
 *   2. Run migration script: decrypt with old key, re-encrypt with new key for all rows
 *   3. Rotate PHONE_ENCRYPTION_KEY env var
 *   4. Drop PHONE_ENCRYPTION_KEY_NEW
 *   Full rotation script at: /docs/key-rotation.md
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

// ── Environment validation ────────────────────────────────────────────────────
function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required environment variable: ${key}`);
    return val;
}

function getEncryptionKey(): Buffer {
    const hex = requireEnv("PHONE_ENCRYPTION_KEY");
    if (hex.length !== 64) {
        throw new Error("PHONE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)");
    }
    return Buffer.from(hex, "hex");
}

function getHmacSecret(): string {
    return requireEnv("PHONE_HMAC_SECRET");
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

/**
 * Encrypts a normalized phone number using AES-256-GCM.
 * Returns the DB-storable string: base64(iv) + "." + base64(ciphertext||authTag)
 */
export function encryptPhone(phone: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(12); // 96-bit IV recommended for GCM

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(phone, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag(); // 128-bit GCM auth tag

    const ivB64 = iv.toString("base64");
    const dataB64 = Buffer.concat([encrypted, authTag]).toString("base64");

    return `${ivB64}.${dataB64}`;
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

/**
 * Decrypts a stored AES-256-GCM ciphertext back to the original phone number.
 * Only call this when: sending WhatsApp, receptionist presses Call, or audited export.
 *
 * @throws if ciphertext is malformed or auth tag fails (tampering detected)
 */
export function decryptPhone(stored: string): string {
    const key = getEncryptionKey();

    const dotIdx = stored.indexOf(".");
    if (dotIdx === -1) throw new Error("Invalid encrypted phone format: missing IV separator");

    const iv = Buffer.from(stored.slice(0, dotIdx), "base64");
    const data = Buffer.from(stored.slice(dotIdx + 1), "base64");

    // Last 16 bytes = GCM auth tag
    const authTag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(0, data.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// ── HMAC hash for deduplication ───────────────────────────────────────────────

/**
 * Produces a stable HMAC-SHA256 of the normalized phone number.
 * Used for: unique index deduplication, looking up existing tokens by phone.
 * This is a one-way operation — the hash cannot be reversed to get the phone.
 *
 * The PHONE_HMAC_SECRET acts as a pepper: without it, the hash is useless to an attacker.
 */
export function hashPhone(phone: string): string {
    const secret = getHmacSecret();
    return createHmac("sha256", secret).update(phone).digest("hex");
}

// ── Utility: check if a value looks like an encrypted phone ──────────────────

/**
 * Returns true if the string matches the stored format (base64.base64).
 * Useful for migration: skip rows that are already encrypted.
 */
export function isEncryptedPhone(value: string | null | undefined): boolean {
    if (!value) return false;
    const parts = value.split(".");
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}
