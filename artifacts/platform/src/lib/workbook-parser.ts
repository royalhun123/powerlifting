import type { Exercise, ProgramInput } from "@workspace/api-client-react";

/**
 * Local, heuristic workbook reader. It makes best guesses about layout and
 * reports every guess as a flag or warning so a coach can correct it in the
 * review step before anything is saved. Nothing here is a guarantee.
 *
 * Imports are prescriptions only: recorded/actual weight columns are never
 * imported and no completed history is ever created.
 */

type Sheet = { sheet: string; data: unknown[][] };

export type Field =
  | "exercise" | "sets" | "reps" | "setsReps" | "percent" | "rpe" | "effort"
  | "notes" | "week" | "day" | "workout" | "liftType";
export const FIELDS: { field: Field; label: string }[] = [
  { field: "exercise", label: "Exercise" },
  { field: "sets", label: "Sets" },
  { field: "reps", label: "Reps" },
  { field: "setsReps", label: "Sets x reps (combined)" },
  { field: "percent", label: "Percent of max" },
  { field: "rpe", label: "RPE / RIR" },
  { field: "effort", label: "Effort / intensity" },
  { field: "notes", label: "Notes" },
  { field: "week", label: "Week" },
  { field: "day", label: "Day / session" },
  { field: "workout", label: "Workout name" },
  { field: "liftType", label: "Lift type" },
];

export type ColumnMapping = { headerRow: number; columns: Partial<Record<Field, number>> };
export type DraftExercise = Exercise & { flags: string[]; source: string };
export type DraftWorkout = { id: string; name: string; week: number; day: number; flags: string[]; exercises: DraftExercise[] };
export type SkippedLine = { row: number; text: string; reason: string };
export type SheetDraft = {
  sheet: string;
  name: string;
  phase: ProgramInput["phase"];
  weeks: number;
  layout: "table" | "blocks" | "freeform" | "mapped" | "none";
  workouts: DraftWorkout[];
  warnings: string[];
  skipped: SkippedLine[];
  mapping?: ColumnMapping;
  data: unknown[][];
};
export type WorkbookPreview = { drafts: SheetDraft[]; programs: ProgramInput[]; warnings: string[] };

const uid = () => crypto.randomUUID();
const text = (v: unknown): string => v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
const key = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9%]/g, "");

/** Sets/reps cell: Excel may have turned "3-5" into a date. Accept it as a range. */
export function prescription(v: unknown): string {
  if (v instanceof Date) return `${v.getUTCMonth() + 1}-${v.getUTCDate()}`;
  if (typeof v === "number" && v > 30000 && v < 60000) {
    const date = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  }
  const value = text(v);
  const m = value.match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:T.*)?$/)
    || value.match(/^(\d{1,2})[-/](\d{1,2})[-/]\d{4}$/)
    || value.match(/^(\d+)\s*[-–—]\s*(\d+)\??$/);
  return m ? `${Number(m[1])}-${Number(m[2])}` : value;
}

// ---------- headers ----------
const PRIMARY_EX = /^(exercise|exercises|exercisename|movement|movements)$/;
const SECONDARY_EX = /^(lift|lifts|name)$/;
const RECORDED = /^(actual|actuals|recorded|result|results|completed|done|logged|achieved|weight|weights|load|loads|weightused|loadused|actualweight|actualload|topset|lb|lbs|kg|kgs|weightlbs|weightkg|loadlbs|loadkg|weightlb)$/;
const ALIASES: [Field, RegExp][] = [
  ["setsReps", /^(setsxreps|setsreps|setxreps|setsandreps|setsxrep|sxr|scheme|prescription|volume|setsbyreps)$/],
  ["sets", /^(sets|set|noofsets|numsets|numberofsets|s)$/],
  ["reps", /^(reps|rep|repetitions|reprange|r|repsperset)$/],
  ["percent", /^(%|%1rm|1rm%|percent|percentage|pct|%max|intensity%|load%|%oftm|%tm|%of1rm|percentof1rm)$/],
  ["rpe", /^(rpe|targetrpe|rpetarget|rir|targetrir|@rpe)$/],
  ["effort", /^(effort|intensity|target|targeteffort)$/],
  ["notes", /^(notes|note|comments|comment|cues|cue|coachnotes|coachingnotes|instructions|tempo)$/],
  ["week", /^(week|wk|weekno|weeknumber|weeknum)$/],
  ["day", /^(day|dayno|daynumber|weekday|dayofweek|session|sessionno|trainingday)$/],
  ["workout", /^(workout|workoutname|sessionname|title|focus|dayname)$/],
  ["liftType", /^(lifttype|category|type|liftcategory)$/],
];
function headerField(v: unknown): Field | "recorded" | "exercise2" | undefined {
  const k = key(v);
  if (!k) return undefined;
  if (PRIMARY_EX.test(k)) return "exercise";
  if (SECONDARY_EX.test(k)) return "exercise2";
  if (RECORDED.test(k)) return "recorded";
  for (const [f, re] of ALIASES) if (re.test(k)) return f;
  return undefined;
}
const PRES: Field[] = ["sets", "reps", "setsReps", "percent", "rpe", "effort"];

/** Exercise-column positions if this row looks like a table header. */
function headerStarts(row: unknown[]): { starts: number[]; guessed: boolean } | null {
  const fields = row.map(headerField);
  const pres = fields.some((f) => f && (PRES as string[]).includes(f));
  if (!pres) return null;
  let starts = fields.flatMap((f, i) => f === "exercise" ? [i] : []);
  if (!starts.length) starts = fields.flatMap((f, i) => f === "exercise2" ? [i] : []);
  if (starts.length) return { starts, guessed: false };
  // No exercise header: assume the blank-headed column left of sets is the exercise name.
  const firstPres = fields.findIndex((f) => f === "sets" || f === "setsReps" || f === "reps");
  if (firstPres > 0 && !text(row[firstPres - 1])) return { starts: [firstPres - 1], guessed: true };
  return null;
}

type Cols = Partial<Record<Field, number>> & { rir?: boolean };
function mapHeader(row: unknown[], from: number, to: number, start: number, ignored: Set<string>): Cols {
  const cols: Cols = { exercise: start };
  for (let c = from; c < to; c++) {
    if (c === start) continue;
    let f = headerField(row[c]);
    if (f === "recorded") { ignored.add(text(row[c])); continue; }
    if (f === "exercise2") f = "liftType";
    if (f === "exercise") continue;
    if (f && cols[f] === undefined) {
      cols[f] = c;
      if (f === "rpe" && /rir/i.test(text(row[c]))) cols.rir = true;
    } else if (text(row[c]) && !f) ignored.add(text(row[c]));
  }
  return cols;
}

// ---------- labels ----------
const WEEKDAYS: [RegExp, number][] = [
  [/^mon(day)?\b/i, 1], [/^tue(s|sday)?\b/i, 2], [/^wed(nesday)?\b/i, 3], [/^thu(r|rs|rsday)?\b/i, 4],
  [/^fri(day)?\b/i, 5], [/^sat(urday)?\b/i, 6], [/^sun(day)?\b/i, 7],
];
type Label = { week?: number; day?: number; dayGuessed?: string; name?: string };
export function parseLabel(raw: string): Label | null {
  const s = raw.trim();
  if (!s || s.length > 60) return null;
  const wd = s.match(/^w(?:k|eek)?\s*[#.:-]?\s*(\d{1,2})\s*[,/ -]*\s*d(?:ay)?\s*[#.:-]?\s*(\d{1,2})\b/i);
  if (wd) return withDay({ week: +wd[1] }, +wd[2], s);
  const w = s.match(/^(?:week|wk)\s*[#.:-]?\s*(\d{1,2})\b\s*[-–:,|]?\s*(.*)$/i);
  if (w) {
    const rest = w[2] ? parseLabel(w[2]) : null;
    return { week: +w[1], ...(rest && rest.day ? { day: rest.day, dayGuessed: rest.dayGuessed, name: rest.name } : {}) };
  }
  const d = s.match(/^day\s*[#.:-]?\s*(\d{1,2})\b/i);
  if (d) return withDay({}, +d[1], s);
  for (const [re, n] of WEEKDAYS) if (re.test(s)) return { day: n, name: s };
  const ses = s.match(/^(?:session|workout|training\s*day)\s*[#.:-]?\s*([a-z]|\d{1,2})\b/i);
  if (ses) {
    const v = ses[1];
    if (/^\d+$/.test(v)) return withDay({}, +v, s);
    const n = v.toLowerCase().charCodeAt(0) - 96;
    return { day: Math.min(Math.max(n, 1), 7), dayGuessed: `Day number guessed from letter "${v.toUpperCase()}"`, name: s };
  }
  return null;
}
function withDay(l: Label, n: number, name: string): Label {
  if (n >= 1 && n <= 7) return { ...l, day: n, name };
  return { ...l, day: 7, dayGuessed: `"${name}" is outside days 1-7; set to day 7`, name };
}
function weekNumber(v: unknown): number | null {
  const s = text(v);
  const m = s.match(/^(?:week|wk|w)?\s*[#.:-]?\s*(\d{1,2})$/i);
  return m && +m[1] >= 1 && +m[1] <= 52 ? +m[1] : null;
}

// ---------- prescriptions ----------
const RANGE = String.raw`\d+(?:\s*[-–]\s*\d+)?`;
const COMBO = new RegExp(String.raw`^(${RANGE})\s*[x×*]\s*(${RANGE}\+?|amrap|max)\s*(.*)$`, "i");
const SETS_OF = new RegExp(String.raw`^(${RANGE})\s*sets?\s*(?:of|x)\s*(${RANGE}\+?)\s*(?:reps?)?\s*(.*)$`, "i");
export function splitCombo(s: string): { sets: string; reps: string; rest: string } | null {
  const m = s.trim().match(COMBO) || s.trim().match(SETS_OF);
  if (!m) return null;
  const clean = (x: string) => x.replace(/\s+/g, "").replace(/[–]/g, "-");
  return { sets: clean(m[1]), reps: m[2].toLowerCase() === "amrap" || m[2].toLowerCase() === "max" ? m[2].toUpperCase() : clean(m[2]), rest: m[3].replace(/^[@,;:\s]+/, "").trim() };
}
/** "Squat 5x3 @ 80%" in one cell. */
const INLINE = new RegExp(String.raw`^(.*?[a-z].*?)[\s:,-]+(${RANGE}\s*[x×*]\s*(?:${RANGE}\+?|amrap|max).*)$`, "i");
export function splitInline(s: string): { name: string; sets: string; reps: string; rest: string } | null {
  const m = s.trim().match(INLINE);
  if (!m) return null;
  const c = splitCombo(m[2]);
  return c ? { name: m[1].trim(), ...c } : null;
}
function fmtPercent(v: unknown): string {
  if (typeof v === "number") return v > 0 && v <= 1.5 ? `${Number((v * 100).toFixed(1))}%` : `${v}%`;
  const s = text(v);
  if (!s) return "";
  return /%/.test(s) ? s : /^\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?$/.test(s) ? `${s.replace(/\s/g, "")}%` : s;
}
function fmtRpe(v: unknown, rir: boolean): string {
  const s = text(v);
  if (!s) return "";
  return /rpe|rir/i.test(s) ? s : `${rir ? "RIR" : "RPE"} ${s}`;
}
function fmtEffort(v: unknown, flags: string[]): string {
  if (typeof v === "number") {
    if (v > 0 && v <= 1.5) return fmtPercent(v);
    if (v > 1.5 && v <= 10) { flags.push(`Numeric intensity ${v} guessed as RPE`); return `RPE ${v}`; }
    if (v > 10 && v <= 120) { flags.push(`Numeric intensity ${v} guessed as a percentage`); return `${v}%`; }
  }
  return text(v);
}
function liftOf(name: string, explicit: string): Exercise["lift"] {
  const e = key(explicit);
  if (["squat", "bench", "deadlift", "accessory"].includes(e)) return e as Exercise["lift"];
  const n = name.toLowerCase().trim();
  if (/^(comp(etition)?\s+)?(back\s+)?squat$/.test(n)) return "squat";
  if (/^(comp(etition)?\s+)?bench(\s+press)?$/.test(n)) return "bench";
  if (/^(comp(etition)?\s+)?(conventional\s+|sumo\s+)?(deadlift|dead)$/.test(n)) return "deadlift";
  return "accessory";
}

type RawEx = { name: string; sets?: unknown; reps?: unknown; setsReps?: unknown; percent?: unknown; rpe?: unknown; rir?: boolean; effort?: unknown; notes?: unknown; liftType?: unknown; extraEffort?: string };
function buildExercise(r: RawEx, source: string, flags: string[]): DraftExercise {
  let sets = prescription(r.sets), reps = prescription(r.reps);
  const efforts: string[] = [];
  const combo = (v: string) => { const c = splitCombo(v); if (c) { sets = c.sets; reps = c.reps; if (c.rest) efforts.push(c.rest); } return !!c; };
  const sr = text(r.setsReps);
  if (sr && !combo(sr)) flags.push(`Could not split "${sr}" into sets and reps`);
  if (!sr && sets && !reps && /[x×*]|sets?\s*of/i.test(sets)) combo(sets);
  else if (!sr && reps && !sets && /[x×*]/i.test(reps)) combo(reps);
  const pct = fmtPercent(r.percent), rpe = fmtRpe(r.rpe, !!r.rir), eff = fmtEffort(r.effort, flags);
  const effort = [pct, rpe, eff, ...efforts, r.extraEffort ?? ""].filter(Boolean).join(" @ ");
  const notes = text(r.notes);
  if (r.notes instanceof Date) flags.push("Notes cell was formatted as a date; check the original text");
  if (!r.name) flags.push("Missing exercise name");
  if (!sets || !reps) flags.push("Sets or reps not found");
  return {
    id: uid(), name: r.name, sets, reps, effort, weight: "", sourceUnit: "lb", setWeights: [], notes,
    review: flags.length > 0, lift: liftOf(r.name, text(r.liftType)), flags, source,
  };
}

// ---------- engine ----------
const SKIP_WORDS = /^(rest|off|recovery|rest day|day off|total|totals|sum|tonnage|warm-?ups?|notes?:?)\b/i;
const phaseOf = (s: string): ProgramInput["phase"] => /peak|meet|taper/i.test(s) ? "peak" : /deload/i.test(s) ? "deload" : /strength|intensif|block 2/i.test(s) ? "strength" : "volume";

type Ctx = { week?: number; day?: number; dayName?: string; dayGuessed?: string; pending?: { name: string; row: number }; current: DraftWorkout | null; colWeek?: number; colDay?: unknown };

function newDraft(sheet: string, data: unknown[][]): SheetDraft {
  return { sheet, name: sheet.slice(0, 120), phase: phaseOf(sheet), weeks: 1, layout: "none", workouts: [], warnings: [], skipped: [], data };
}

function nextDay(draft: SheetDraft, week: number): number {
  const used = draft.workouts.filter((w) => w.week === week).map((w) => w.day);
  return used.length ? Math.max(...used) + 1 : 1;
}

function sequentialWorkout(draft: SheetDraft, ctx: Ctx, fallbackWeek: number, weekReason: string): DraftWorkout {
  if (ctx.current) return ctx.current;
  const flags: string[] = [];
  let week = ctx.week;
  if (!week) { week = fallbackWeek; flags.push(weekReason); }
  let day = ctx.day;
  if (!day) { day = nextDay(draft, week); flags.push(`Day ${day} guessed from order in the sheet`); }
  if (ctx.dayGuessed) flags.push(ctx.dayGuessed);
  if (day > 7) { flags.push(`More than 7 workouts in week ${week}; day set to 7, please check`); day = 7; }
  const name = [ctx.dayName, ctx.pending?.name].filter(Boolean).join(" · ") || `Day ${day}`;
  const w: DraftWorkout = { id: uid(), name: name.slice(0, 200), week, day, flags, exercises: [] };
  draft.workouts.push(w);
  ctx.current = w; ctx.day = undefined; ctx.dayName = undefined; ctx.dayGuessed = undefined; ctx.pending = undefined;
  return w;
}

function applyLabel(draft: SheetDraft, ctx: Ctx, l: Label) {
  if (ctx.pending && (l.week || !l.day)) draft.skipped.push({ row: ctx.pending.row, text: ctx.pending.name, reason: "Heading not attached to any workout" });
  if (l.week) { ctx.week = l.week; ctx.pending = undefined; }
  if (l.day) { ctx.day = l.day; ctx.dayName = l.name; ctx.dayGuessed = l.dayGuessed; }
  else { ctx.day = undefined; ctx.dayName = undefined; }
  ctx.current = null;
}

type Seg = { index: number; start: number; end: number; cols: Cols | null; ctx: Ctx };

function runTable(draft: SheetDraft, data: unknown[][], fixed?: ColumnMapping): boolean {
  const ignored = new Set<string>();
  const headerRows = new Map<number, number[]>();
  let guessedHeader = false;
  if (fixed) {
    if (fixed.columns.exercise === undefined) return false;
    headerRows.set(fixed.headerRow, [fixed.columns.exercise]);
  } else {
    data.forEach((row, r) => {
      const h = headerStarts(row);
      if (h) { headerRows.set(r, h.starts); guessedHeader ||= h.guessed; }
    });
  }
  if (!headerRows.size) return false;
  const width = Math.max(...data.map((r) => r.length), 1);
  const starts = [...new Set([...headerRows.values()].flat())].sort((a, b) => a - b);
  const firstStart = starts[0];
  const segs: Seg[] = starts.map((start, i) => ({ index: i, start, end: starts[i + 1] ?? width, cols: null, ctx: { current: null } }));
  const multi = segs.length > 1;
  let filledWeek = false, filledDay = false;
  draft.layout = fixed ? "mapped" : multi || headerRows.size > 1 ? "blocks" : "table";
  if (guessedHeader) draft.warnings.push("No Exercise header found; the blank-headed column left of Sets was assumed to hold exercise names.");

  const marginCols = new Set<number>();
  for (let r = 0; r < data.length; r++) {
    const row = data[r] ?? [];
    const rowNo = r + 1;
    const hdr = headerRows.get(r);
    if (hdr && (!fixed || r === fixed.headerRow)) {
      let shared: Cols = {};
      if (!fixed) {
        shared = mapHeader(row, 0, firstStart, -1, ignored);
        delete shared.exercise;
        for (const c of Object.values(shared)) if (typeof c === "number") marginCols.add(c);
      }
      for (const s of segs) {
        if (!hdr.includes(s.start)) continue;
        s.cols = fixed ? { ...fixed.columns } : { ...shared, ...mapHeader(row, s.start, s.end, s.start, ignored) };
        s.ctx.current = null;
      }
      continue;
    }
    // Left-margin labels (e.g. "Week 2" in column A) apply to every block.
    const margin = row.slice(0, fixed ? 0 : firstStart).map((v, c) => marginCols.has(c) ? "" : text(v)).filter(Boolean);
    let usedRow = false;
    if (margin.length) {
      const l = parseLabel(margin[0]);
      if (l) { segs.forEach((s) => applyLabel(draft, s.ctx, l)); usedRow = true; }
    }
    const leftovers: string[] = [];
    for (const s of segs) {
      const cells = fixed ? row : row.slice(s.start, s.end);
      const segText = cells.map(text).filter(Boolean);
      if (!segText.length) continue;
      if (!s.cols) {
        const l = parseLabel(segText[0]);
        if (l) applyLabel(draft, s.ctx, l);
        else if (!fixed || r > fixed.headerRow) leftovers.push(segText.join(" | "));
        else leftovers.push(segText.join(" | "));
        continue;
      }
      const c = s.cols;
      const at = (f: Field) => c[f] === undefined ? undefined : row[c[f]!];
      const exText = text(at("exercise"));
      const hasPres = PRES.some((f) => text(at(f)));
      if (!exText && !hasPres) {
        const l = parseLabel(segText[0]);
        if (l) applyLabel(draft, s.ctx, l); else leftovers.push(segText.join(" | "));
        continue;
      }
      if (exText && !hasPres) {
        const l = parseLabel(exText);
        if (l && c.week === undefined && c.day === undefined) { applyLabel(draft, s.ctx, l); continue; }
        const inline = splitInline(exText);
        if (inline) {
          const w = resolve(s, row, rowNo);
          w.exercises.push(buildExercise({ name: inline.name, sets: inline.sets, reps: inline.reps, extraEffort: inline.rest, notes: at("notes"), liftType: at("liftType") }, `Row ${rowNo}`, [`Name, sets and reps split from one cell "${exText}"`]));
          continue;
        }
        if (SKIP_WORDS.test(exText)) { draft.skipped.push({ row: rowNo, text: segText.join(" | "), reason: "Looks like a rest day, total or note line" }); continue; }
        const next = data[r + 1] ?? [];
        const nextHasData = text(next[c.exercise!]) && PRES.some((f) => c[f] !== undefined && text(next[c[f]!]));
        if (nextHasData && c.week === undefined && c.day === undefined && !text(at("notes"))) {
          if (s.ctx.pending) draft.skipped.push({ row: s.ctx.pending.row, text: s.ctx.pending.name, reason: "Heading not attached to any workout" });
          s.ctx.pending = { name: exText, row: rowNo };
          if (s.ctx.current && s.ctx.current.exercises.length) s.ctx.current = null;
          continue;
        }
      }
      const w = resolve(s, row, rowNo);
      w.exercises.push(buildExercise({ name: exText, sets: at("sets"), reps: at("reps"), setsReps: at("setsReps"), percent: at("percent"), rpe: at("rpe"), rir: c.rir, effort: at("effort"), notes: at("notes"), liftType: at("liftType") }, `Row ${rowNo}`, []));
    }
    if (leftovers.length && !usedRow) draft.skipped.push({ row: rowNo, text: leftovers.join(" | ").slice(0, 300), reason: "Outside any recognised exercise table" });
  }

  function resolve(s: Seg, row: unknown[], rowNo: number): DraftWorkout {
    const c = s.cols!;
    if (c.week === undefined && c.day === undefined) {
      if (s.ctx.pending && s.ctx.current) s.ctx.current = null;
      return sequentialWorkout(draft, s.ctx, multi ? s.index + 1 : 1, multi ? `Week ${s.index + 1} guessed from block position (left to right)` : "No week label found; assumed week 1");
    }
    const flags: string[] = [];
    let week: number | undefined;
    if (c.week !== undefined) {
      const raw = text(row[c.week]);
      if (raw) {
        const n = weekNumber(raw);
        if (n) s.ctx.colWeek = n; else flags.push(`Week value "${raw}" not understood (row ${rowNo})`);
      } else if (s.ctx.colWeek) filledWeek = true;
      week = s.ctx.colWeek;
    }
    week ??= s.ctx.week;
    if (!week) { week = 1; flags.push("No week found; assumed week 1"); }
    let day: number | undefined, dayName = "";
    if (c.day !== undefined) {
      const raw = row[c.day];
      if (text(raw)) s.ctx.colDay = raw; else if (s.ctx.colDay !== undefined) filledDay = true;
      const dv = text(s.ctx.colDay);
      if (dv) {
        if (/^\d+$/.test(dv)) {
          const n = +dv;
          if (n >= 1 && n <= 7) day = n; else { day = 7; flags.push(`Day "${dv}" outside 1-7; set to 7`); }
        } else {
          const l = parseLabel(dv);
          if (l?.day) { day = l.day; dayName = dv; if (l.dayGuessed) flags.push(l.dayGuessed); }
          else { dayName = dv; }
        }
      }
    }
    const name = (text(c.workout !== undefined ? row[c.workout] : "") || dayName || s.ctx.dayName || "").slice(0, 200);
    if (!day) {
      const same = draft.workouts.find((w) => w.week === week && name && w.name === name);
      if (same) return same;
      day = s.ctx.day ?? nextDay(draft, week);
      if (!s.ctx.day) flags.push(`Day ${day} guessed from order in the sheet${dayName ? ` for "${dayName}"` : ""}`);
      if (day > 7) { flags.push("More than 7 workouts in a week; set to day 7"); day = 7; }
    }
    const finalName = name || `Day ${day}`;
    let w = draft.workouts.find((x) => x.week === week && x.day === day && x.name === finalName);
    if (!w) { w = { id: uid(), name: finalName, week, day, flags, exercises: [] }; draft.workouts.push(w); }
    return w;
  }

  for (const s of segs) if (s.ctx.pending) draft.skipped.push({ row: s.ctx.pending.row, text: s.ctx.pending.name, reason: "Heading not attached to any workout" });
  if (filledWeek) draft.warnings.push("Blank week cells were filled from the row above (merged or omitted cells). Check workout weeks.");
  if (filledDay) draft.warnings.push("Blank day cells were filled from the row above (merged or omitted cells). Check workout days.");
  if (ignored.size) {
    const list = [...ignored];
    draft.warnings.push(`Columns not imported: ${list.slice(0, 8).join(", ")}${list.length > 8 ? "…" : ""}. Recorded or actual weights are never imported; use Map columns if one of these holds prescription data.`);
  }
  const first = segs.find((s) => s.cols)?.cols;
  const firstHeader = [...headerRows.keys()][0];
  if (first) {
    const columns: Partial<Record<Field, number>> = {};
    for (const f of FIELDS) if (first[f.field] !== undefined) columns[f.field] = first[f.field];
    draft.mapping = { headerRow: firstHeader, columns };
  }
  return true;
}

function runFreeform(draft: SheetDraft, data: unknown[][]) {
  draft.layout = "freeform";
  const ctx: Ctx = { current: null };
  let found = 0;
  data.forEach((row, r) => {
    const cells = row.map(text);
    const rowNo = r + 1;
    if (!cells.some(Boolean)) return;
    let idx = cells.findIndex((c) => !!splitCombo(c));
    let name = "", combo: ReturnType<typeof splitCombo> = null;
    if (idx >= 0) {
      combo = splitCombo(cells[idx]);
      for (let j = idx - 1; j >= 0; j--) if (cells[j] && /[a-z]/i.test(cells[j])) { name = cells[j]; break; }
    } else {
      idx = cells.findIndex((c) => !!splitInline(c));
      if (idx >= 0) { const i = splitInline(cells[idx])!; name = i.name; combo = i; }
    }
    if (combo) {
      const rest = cells.slice(idx + 1).filter(Boolean);
      const effortCells = rest.filter((c) => /%|rpe|rir|@/i.test(c));
      const noteCells = rest.filter((c) => !effortCells.includes(c));
      const w = sequentialWorkout(draft, ctx, 1, "No week label found; assumed week 1");
      w.exercises.push(buildExercise({ name, sets: combo.sets, reps: combo.reps, extraEffort: [combo.rest, ...effortCells].filter(Boolean).join(" @ "), notes: noteCells.join(" · ") }, `Row ${rowNo}`, ["Freeform guess: matched a sets x reps pattern without table headers"]));
      found++;
      return;
    }
    const first = cells.find(Boolean)!;
    const l = parseLabel(first);
    if (l) { applyLabel(draft, ctx, l); return; }
    if (SKIP_WORDS.test(first)) { draft.skipped.push({ row: rowNo, text: cells.filter(Boolean).join(" | "), reason: "Looks like a rest day, total or note line" }); return; }
    const filled = cells.filter(Boolean);
    if (filled.length === 1 && first.length <= 60) {
      if (ctx.pending) draft.skipped.push({ row: ctx.pending.row, text: ctx.pending.name, reason: "Heading not attached to any workout" });
      ctx.pending = { name: first, row: rowNo }; ctx.current = null; return;
    }
    draft.skipped.push({ row: rowNo, text: filled.join(" | ").slice(0, 300), reason: "No exercise pattern recognised" });
  });
  if (ctx.pending) draft.skipped.push({ row: ctx.pending.row, text: ctx.pending.name, reason: "Heading not attached to any workout" });
  if (found) draft.warnings.push("No table headers found. Exercises were guessed from cells like \"5x3\" or \"Squat 4x6 @ RPE 7\". Review every row, or use Map columns.");
}

function finish(draft: SheetDraft): SheetDraft {
  draft.workouts = draft.workouts.filter((w) => w.exercises.length);
  draft.workouts.sort((a, b) => a.week - b.week || a.day - b.day);
  if (!draft.workouts.length) {
    draft.layout = "none";
    draft.warnings.push("No exercises detected. Use Map columns to tell the importer which columns hold what, or skip this sheet.");
  }
  draft.weeks = Math.min(52, Math.max(1, ...draft.workouts.map((w) => w.week)));
  const flagged = draft.workouts.flatMap((w) => w.exercises).filter((e) => e.flags.length).length;
  const guessedWorkouts = draft.workouts.filter((w) => w.flags.length).length;
  if (flagged) draft.warnings.push(`${flagged} exercise row${flagged === 1 ? "" : "s"} flagged for review.`);
  if (guessedWorkouts) draft.warnings.push(`${guessedWorkouts} workout${guessedWorkouts === 1 ? " has" : "s have"} a guessed week or day.`);
  if (draft.skipped.length) draft.warnings.push(`${draft.skipped.length} line${draft.skipped.length === 1 ? " was" : "s were"} not imported; they are listed for you to check.`);
  return draft;
}

export function parseSheet(sheet: string, data: unknown[][]): SheetDraft {
  const draft = newDraft(sheet, data);
  if (!runTable(draft, data)) runFreeform(draft, data);
  return finish(draft);
}

/** Re-read a sheet with a coach-supplied column mapping. */
export function parseSheetWithMapping(sheet: string, data: unknown[][], mapping: ColumnMapping): SheetDraft {
  const draft = newDraft(sheet, data);
  if (!runTable(draft, data, mapping)) draft.warnings.push("Choose which column holds exercise names.");
  draft.mapping = mapping;
  return finish(draft);
}

export function draftToProgram(d: SheetDraft): ProgramInput {
  return {
    name: d.name.trim(), description: "", phase: d.phase, weeks: d.weeks, archived: false,
    workouts: d.workouts.filter((w) => w.exercises.length).map((w) => ({
      id: w.id, name: w.name.trim(), week: w.week, day: w.day,
      exercises: w.exercises.map(({ flags: _f, source: _s, ...e }) => ({ ...e, name: e.name.trim(), weight: "", setWeights: [] })),
    })),
  };
}

/** Errors that would make the server reject the program. Shown before saving. */
export function validateProgram(p: ProgramInput): string[] {
  const errs: string[] = [];
  if (!p.name.trim() || p.name.length > 120) errs.push("Program name is required (max 120 characters).");
  if (!Number.isInteger(p.weeks) || p.weeks < 1 || p.weeks > 52) errs.push("Weeks must be 1-52.");
  if (!p.workouts.length) errs.push("At least one workout with an exercise is required.");
  if (p.workouts.length > 364) errs.push("Maximum 364 workouts per program.");
  for (const w of p.workouts) {
    const where = `Week ${w.week} day ${w.day}`;
    if (!Number.isInteger(w.week) || w.week < 1 || w.week > 52) errs.push(`${w.name || "Workout"}: week must be 1-52.`);
    else if (w.week > p.weeks) errs.push(`${where}: week is beyond the program length (${p.weeks}).`);
    if (!Number.isInteger(w.day) || w.day < 1 || w.day > 7) errs.push(`${w.name || "Workout"}: day must be 1-7.`);
    if (!w.name.trim()) errs.push(`${where}: workout name is required.`);
    if (w.exercises.length > 50) errs.push(`${where}: maximum 50 exercises.`);
    for (const e of w.exercises) {
      const n = e.name.slice(0, 40) || "Unnamed row";
      if (!e.name.trim()) errs.push(`${where}: an exercise is missing its name.`);
      if (e.name.length > 200) errs.push(`${n}: name over 200 characters.`);
      if (e.sets.length > 100 || e.reps.length > 100) errs.push(`${n}: sets/reps over 100 characters.`);
      if (e.effort.length > 200) errs.push(`${n}: effort over 200 characters.`);
      if (e.notes.length > 2000) errs.push(`${n}: notes over 2000 characters.`);
      for (const v of [e.sets, e.reps]) {
        const r = v.match(/^(\d+)-(\d+)$/);
        if (r && (+r[1] < 1 || +r[2] < +r[1] || +r[2] > 1000)) errs.push(`${n}: invalid range ${v}.`);
      }
    }
  }
  return [...new Set(errs)];
}

/** Converts prescriptions only. Recorded weights and completed history are never imported. */
export function parseWorkbookSheets(sheets: Sheet[]): WorkbookPreview {
  if (sheets.length > 30) throw new Error("Please upload a workbook with 30 or fewer sheets.");
  const result: WorkbookPreview = { drafts: [], programs: [], warnings: [] };
  for (const { sheet, data } of sheets) {
    if (data.length > 5000 || data.some((r) => r.length > 200)) {
      result.warnings.push(`${sheet}: not read, sheet is too large (maximum 5,000 rows and 200 columns).`);
      continue;
    }
    if (!data.some((r) => r.some((v) => text(v)))) { result.warnings.push(`${sheet}: empty sheet skipped.`); continue; }
    const d = parseSheet(sheet, data);
    result.drafts.push(d);
    for (const w of d.warnings) result.warnings.push(`${sheet}: ${w}`);
    if (d.workouts.length) result.programs.push(draftToProgram(d));
  }
  if (!result.drafts.length) throw new Error(result.warnings.join("\n") || "No readable sheets found.");
  return result;
}
