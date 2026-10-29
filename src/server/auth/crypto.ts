import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";

// argon2id with OWASP-recommended minimums.
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, ARGON);
export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password).catch(() => false);

/** URL-safe random token returned to the client once; only its hash is stored. */
export const generateToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const MIN_PASSWORD_LENGTH = 12;
