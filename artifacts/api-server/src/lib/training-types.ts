import type { z } from "zod";
import { GetWorkspaceResponse, GetAnalyticsResponse, SaveProgramResponse, SaveSessionResponse, UpdateProfileResponse, AssignProgramResponse } from "@workspace/api-zod";

export type Workspace = z.infer<typeof GetWorkspaceResponse>;
export type Analytics = z.infer<typeof GetAnalyticsResponse>;
export type Program = z.infer<typeof SaveProgramResponse>;
export type Session = z.infer<typeof SaveSessionResponse>;
export type Profile = z.infer<typeof UpdateProfileResponse>;
export type Assignment = z.infer<typeof AssignProgramResponse>;
export function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export const dateValid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
export const today = () => new Date().toISOString().slice(0,10);
export const round = (n: number) => Math.round(n * 100) / 100;
export const convert = (n: number, from: string, to: string) => from === to ? n : from === "kg" ? n * 2.2046226218 : n / 2.2046226218;
export const sessionVolume = (s: Pick<Session, "sets">) => round(s.sets.filter(x => x.completed && x.reps > 0).reduce((sum, x) => sum + x.weight*x.reps,0));
