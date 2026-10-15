import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const params = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, params, (error, key) => error ? reject(error) : resolve(key));
  });
}
// Fixed dummy hash gives unknown users the same expensive verification path.
const dummy = `scrypt$32768$8$3$${"00".repeat(16)}$${"00".repeat(64)}`;
export const hashSetupToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const normalizeUsername = (name: string) => name.trim().toLowerCase();

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const result = await derive(password, salt);
  return `scrypt$32768$8$3$${salt}$${result.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const value = stored ?? dummy;
  const parts = value.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$32768$8$3" ||
      !/^[a-f0-9]{32}$/.test(parts[4]!) || !/^[a-f0-9]{128}$/.test(parts[5]!)) {
    await derive(password, "00".repeat(16));
    return false;
  }
  const actual = await derive(password, parts[4]!);
  return timingSafeEqual(actual, Buffer.from(parts[5]!, "hex")) && stored !== null;
}
