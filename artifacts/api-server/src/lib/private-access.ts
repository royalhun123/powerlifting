import { createHash, randomBytes } from "node:crypto";

export const PRIVATE_PREFIX="private:";
export const privateLoginEnabled=()=>process.env.AUTH_MODE==="private-link" || process.env.VERCEL==="1";
export const hashPrivateToken=(token:string)=>PRIVATE_PREFIX+createHash("sha256").update(token).digest("hex");
export const newPrivateToken=()=>randomBytes(32).toString("base64url");
export const PRIVATE_SESSION_TTL=30*24*60*60*1000;
