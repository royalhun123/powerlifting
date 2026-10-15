import type { Exercise, ProgramInput, Workout } from "@workspace/api-client-react";

type Sheet = { sheet: string; data: unknown[][] };
export type WorkbookPreview = { programs: ProgramInput[]; warnings: string[] };
const text = (v: unknown): string => v == null ? "" : v instanceof Date ? v.toISOString().slice(0,10) : String(v).trim();
const key = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9%]/g,"");
const weekdays = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

export function prescription(v: unknown): string {
  if(v instanceof Date) return `${v.getUTCMonth()+1}-${v.getUTCDate()}`;
  if(typeof v==="number" && v>30000 && v<60000) {
    const date=new Date(Date.UTC(1899,11,30)+v*86400000);
    return `${date.getUTCMonth()+1}-${date.getUTCDate()}`;
  }
  const value=text(v);
  const m=value.match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:T.*)?$/)
    || value.match(/^(\d{1,2})[-/](\d{1,2})[-/]\d{4}$/)
    || value.match(/^(\d+)\s*[-–—]\s*(\d+)\??$/);
  return m ? `${Number(m[1])}-${Number(m[2])}` : value;
}

function dayNumber(value: unknown, fallback: number): number {
  const day=weekdays.findIndex(d=>text(value).toLowerCase().includes(d));
  if(day>=0) return day+1;
  const n=Number(text(value).replace(/^day\s*/i,""));
  return Number.isInteger(n) && n>=1 && n<=7 ? n : fallback;
}
function integer(value: unknown, label: string, max: number): number {
  const n=Number(text(value).replace(/^(week|day)\s*/i,""));
  if(!Number.isInteger(n)||n<1||n>max) throw new Error(`${label} must be between 1 and ${max}.`);
  return n;
}
function exercise(row: unknown[], columns: Map<string,number>): Exercise {
  const at=(...aliases:string[])=>{
    const k=aliases.find(a=>columns.has(a));
    return k===undefined ? undefined : row[columns.get(k)!];
  };
  const name=text(at("exercise","exercisename","movement"));
  const sets=prescription(at("sets")), reps=prescription(at("reps","repetitions","reprange"));
  const effortValue=at("effort","rpe","%1rm","percent","percentage","intensity");
  let effort=text(effortValue);
  if(typeof effortValue==="number" && effortValue>0 && effortValue<=1) effort=`${Number((effortValue*100).toFixed(2))}%`;
  else if(columns.has("rpe") && !columns.has("effort") && effort) effort=`RPE ${effort}`;
  else if(["%1rm","percent","percentage"].some(k=>columns.has(k)) && effort && !effort.includes("%")) effort=`${effort}%`;
  const notesValue=at("notes","note");
  const notes=text(notesValue);
  const canonical=name.toLowerCase();
  const explicit=key(at("lift","lifttype"));
  const lift: Exercise["lift"] = ["squat","bench","deadlift","accessory"].includes(explicit)
    ? explicit as Exercise["lift"]
    : /^(comp(?:etition)? )?squat$/.test(canonical) ? "squat"
    : /^(comp(?:etition)? )?bench(?: press)?$/.test(canonical) ? "bench"
    : /^(comp(?:etition)? )?(deadlift|dead)$/.test(canonical) ? "deadlift" : "accessory";
  for(const [label,value] of [["sets",sets],["reps",reps]]) {
    const range=value.match(/^(\d+)-(\d+)$/);
    if(range && (+range[1]<1 || +range[2]<+range[1] || +range[2]>1000)) throw new Error(`${name}: invalid ${label} range ${value}.`);
    if(value.length>100) throw new Error(`${name}: ${label} is too long.`);
  }
  if(name.length>200 || notes.length>2000 || effort.length>200) throw new Error(`${name.slice(0,50)}: a cell exceeds the program text limit.`);
  return {id:crypto.randomUUID(),name,sets,reps,effort,weight:"",sourceUnit:"lb",setWeights:[],notes,
    review:!sets || !reps || notesValue instanceof Date,lift};
}

/** Converts prescriptions only. Recorded weights and completed history are never imported. */
export function parseWorkbookSheets(sheets: Sheet[]): WorkbookPreview {
  if(sheets.length>30) throw new Error("Please upload a workbook with 30 or fewer sheets.");
  const result:WorkbookPreview={programs:[],warnings:[]};
  for(const {sheet,data} of sheets) {
    if(data.length>5000 || data.some(r=>r.length>200)) throw new Error(`${sheet}: sheet is too large (maximum 5,000 rows and 200 columns).`);
    const workouts:Workout[]=[];
    const flatHeader=data.findIndex(row=>{
      const keys=row.map(key);
      return keys.includes("week") && keys.includes("day") && keys.includes("exercise") && keys.includes("sets") && keys.includes("reps");
    });
    try {
      if(flatHeader>=0) {
        const columns=new Map(data[flatHeader].map((v,i)=>[key(v),i]));
        const get=(row:unknown[],k:string)=>row[columns.get(k)!];
        for(const [index,row] of data.entries()) {
          if(index<=flatHeader || !text(get(row,"exercise"))) continue;
          if(key(get(row,"exercise"))==="exercise") continue;
          const week=integer(get(row,"week"),`${sheet} row ${index+1}: week`,52);
          const day=dayNumber(get(row,"day"),0);
          if(!day) throw new Error(`Row ${index+1}: enter day 1–7 or a weekday name.`);
          const name=text(get(row,"workout"))||text(get(row,"session"))||`Day ${day}`;
          let workout=workouts.find(w=>w.week===week && w.day===day && w.name===name);
          if(!workout) {workout={id:crypto.randomUUID(),name,week,day,exercises:[]};workouts.push(workout);}
          workout.exercises.push(exercise(row,columns));
        }
      } else {
        // Original workbook: repeated Exercise/Sets/Reps headers in horizontal
        // week blocks. Detect columns rather than hardcoding sheet names.
        const starts=[...new Set(data.flatMap(row=>row.flatMap((v,c)=>
          key(v)==="exercise" && key(row[c+1])==="sets" && key(row[c+2])==="reps" ? [c] : [])))].sort((a,b)=>a-b);
        for(const [weekIndex,start] of starts.entries()) {
          const end=starts[weekIndex+1]??Math.max(...data.map(r=>r.length));
          let current:Workout|undefined;
          let columns=new Map<string,number>();
          let dayCount=0, week=weekIndex+1;
          for(let r=0;r<data.length;r++) {
            const row=data[r], heading=text(row[start]), weekMatch=heading.match(/^week\s+(\d+)$/i);
            if(weekMatch) {week=integer(weekMatch[1],"Week",52);dayCount=0;current=undefined;continue;}
            if(key(row[start])==="exercise" && key(row[start+1])==="sets") {
              dayCount++;
              const name=text(data[r-1]?.[start])||`Session ${dayCount}`;
              columns=new Map(row.slice(start,end).map((v,i)=>[key(v),start+i]));
              current={id:crypto.randomUUID(),name,week,day:dayNumber(name,Math.min(dayCount,7)),exercises:[]};
              workouts.push(current);
              continue;
            }
            if(!current || !heading) continue;
            // Skip titles, rest-day text and totals rather than invent exercises.
            if(![row[start+1],row[start+2],row[start+3]].some(v=>text(v))) continue;
            current.exercises.push(exercise(row,columns));
          }
        }
      }
      const nonempty=workouts.filter(w=>w.exercises.length);
      if(!nonempty.length) {result.warnings.push(`${sheet}: no supported exercise table found; this sheet was not imported.`);continue;}
      if(nonempty.length>364 || nonempty.some(w=>w.exercises.length>50)) throw new Error("Maximum 364 workouts per program and 50 exercises per workout.");
      const weeks=Math.max(...nonempty.map(w=>w.week));
      if(weeks>52) throw new Error("Maximum program length is 52 weeks.");
      const phase:ProgramInput["phase"]=/peak|meet/i.test(sheet)?"peak":/deload/i.test(sheet)?"deload":/strength|block 2/i.test(sheet)?"strength":"volume";
      result.programs.push({name:sheet.slice(0,120),description:"",phase,weeks,archived:false,workouts:nonempty});
      const flagged=nonempty.flatMap(w=>w.exercises).filter(e=>e.review).length;
      if(flagged) result.warnings.push(`${sheet}: ${flagged} exercises need review for missing sets/reps or date-formatted notes.`);
    } catch(error) {
      // Explicit failure for a sheet, never a partly imported prescription.
      result.warnings.push(`${sheet}: not imported. ${error instanceof Error ? error.message : "Invalid format."}`);
    }
  }
  if(!result.programs.length) throw new Error(result.warnings.join("\n") || "No supported exercise tables found.");
  return result;
}
