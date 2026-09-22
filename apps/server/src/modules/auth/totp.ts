import { createHmac, randomBytes } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (no padding), for authenticator apps. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Tencent / Google Authenticator compatible TOTP (SHA1, 30s, 6 digits). */
export function verifyTotp(
  secretBase32: string,
  token: string,
  window = 1,
  stepSec = 30,
): boolean {
  const cleaned = String(token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  if (!secret.length) return false;
  const counter = Math.floor(Date.now() / 1000 / stepSec);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w) === cleaned) return true;
  }
  return false;
}

export function otpauthUrl(opts: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer ?? "JoyAI";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(opts.accountName)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
