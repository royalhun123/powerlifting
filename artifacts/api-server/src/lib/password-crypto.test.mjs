import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword, hashSetupToken, normalizeUsername } from "./password-crypto.ts";

test("salted scrypt hashes verify only the original password and never contain plaintext", async () => {
  const password = randomBytes(24).toString("base64url");
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(a.includes(password), false);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(password + "wrong", a), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});
test("usernames normalize consistently; tokens are stored as deterministic digests", () => {
  assert.equal(normalizeUsername("  Navy.Coach  "), "navy.coach");
  const token = randomBytes(32).toString("base64url");
  assert.match(hashSetupToken(token), /^[a-f0-9]{64}$/);
  assert.equal(hashSetupToken(token), hashSetupToken(token));
  assert.notEqual(hashSetupToken(token), token);
});
