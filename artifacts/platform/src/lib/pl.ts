import type { Exercise, LoggedSet, Profile, Session } from "@workspace/api-client-react";

export const INVITE_KEY = "platform.inviteToken";

export type Lift = "squat" | "bench" | "deadlift" | "accessory";

export const LIFT_LABEL: Record<string, string> = {
  squat: "Squat",
  bench: "Bench",
  deadlift: "Deadlift",
  accessory: "Accessory",
};

export const LIFT_VAR: Record<string, string> = {
  squat: "hsl(var(--squat))",
  bench: "hsl(var(--bench))",
  deadlift: "hsl(var(--deadlift))",
  accessory: "hsl(var(--accessory))",
};

export const PHASE_LABEL: Record<string, string> = {
  volume: "Volume",
  strength: "Strength",
  deload: "Deload",
  peak: "Peak",
};

export function firstInt(s: string, fallback: number): number {
  const m = /\d+/.exec(s ?? "");
  if (!m) return fallback;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parsePercent(effort: string): number | null {
  const m = /(\d{2,3}(?:\.\d+)?)\s*%/.exec(effort ?? "");
  if (!m) return null;
  const p = parseFloat(m[1]);
  return p > 0 && p <= 120 ? p : null;
}

export function parseRpe(effort: string): number | null {
  const m = /(?:rpe|@)\s*(\d+(?:\.\d+)?)/i.exec(effort ?? "");
  if (!m) return null;
  const r = parseFloat(m[1]);
  return r >= 0 && r <= 10 ? r : null;
}

export function roundLoad(w: number, unit: string): number {
  const step = unit === "kg" ? 2.5 : 5;
  return Math.round(w / step) * step;
}

/** Resolve which reference max applies: classification first, then exercise name (backdowns, paused, tempo variants). */
export function referenceLift(lift: string, name: string): string {
  if (lift !== "accessory") return lift;
  if (/squat/i.test(name)) return "squat";
  if (/bench/i.test(name)) return "bench";
  if (/dead\s*lift|\bdl\b|sumo|rdl/i.test(name)) return "deadlift";
  return "accessory";
}

export function maxFor(profile: Profile | undefined, lift: string): number {
  if (!profile) return 0;
  if (lift === "squat") return profile.squatMax;
  if (lift === "bench") return profile.benchMax;
  if (lift === "deadlift") return profile.deadliftMax;
  return 0;
}

/** Target load derived from a percentage prescription and the athlete's reference max. */
export function targetLoad(ex: Exercise, profile: Profile | undefined): number | null {
  const pct = parsePercent(ex.effort);
  const max = maxFor(profile, referenceLift(ex.lift, ex.name));
  if (!pct || !max) return null;
  return roundLoad((max * pct) / 100, profile?.unit ?? "lb");
}

export function buildSets(exercises: Exercise[], profile: Profile | undefined): LoggedSet[] {
  const out: LoggedSet[] = [];
  for (const ex of exercises) {
    const n = Math.min(firstInt(ex.sets, 1), 20);
    // A prescription is not an actual result, especially when it is a range.
    const reps = 0;
    for (let i = 1; i <= n; i++) {
      out.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        lift: ex.lift,
        setNumber: i,
        weight: targetLoad(ex, profile) ?? 0,
        reps,
        rpe: 0,
        completed: false,
        notes: "",
      });
    }
  }
  return out;
}

/** Only percentages are prescriptions; workbook weights were historical results. */
export function setTargetLoad(ex: Exercise, setIndex: number, profile: Profile | undefined, unit: string): number | null {
  const percentage = targetLoad(ex, profile);
  if (percentage !== null) {
    const converted = profile?.unit === unit ? percentage : unit === "kg" ? percentage / 2.2046226218 : percentage * 2.2046226218;
    return roundLoad(converted, unit);
  }
  return null;
}

export function isSetPerformed(set: Pick<LoggedSet, "reps" | "weight" | "lift">): boolean {
  return set.reps > 0 && (set.weight > 0 || set.lift === "accessory");
}

export function repRange(value: string): { min: number; max: number } | null {
  const match = /^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/.exec(value);
  if (!match) return null;
  const min = Number(match[1]), max = Number(match[2]);
  return min > 0 && max >= min ? { min, max } : null;
}

export function epley(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1000).toFixed(1) + "k";
  return fmtNum(n);
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function parseISODate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s ?? "")) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(s: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  const d = parseISODate(s) ?? new Date(s);
  if (isNaN(d.getTime())) return s || "—";
  return d.toLocaleDateString(undefined, opts);
}

export function daysUntil(s: string): number | null {
  const d = parseISODate(s);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function sessionVolume(s: Session): number {
  return s.volume;
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function convertLoad(w: number, from: string, to: string): number {
  if (from === to || !w) return w;
  const v = from === "lb" ? w / 2.20462 : w * 2.20462;
  return Math.round(roundLoad(v, to) * 10) / 10;
}
