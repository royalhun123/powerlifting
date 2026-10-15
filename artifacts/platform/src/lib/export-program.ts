import type { Program } from "@workspace/api-client-react";

/** Export prescriptions only, never somebody's completed workout data. */
export async function exportProgramXlsx(program: Program): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Navy Powerlifting";
  const summary = workbook.addWorksheet("Program");
  summary.columns = [{ width: 22 }, { width: 85 }];
  for (const row of [
    ["Program", program.name], ["Description", program.description],
    ["Uploaded by", program.uploaderName || "Not recorded"],
    ["Phase", program.phase], ["Weeks", program.weeks],
    ["Status", program.archived ? "Archived" : "Active"], ["Weight unit", "lb"],
    ["Export contents", "Program prescriptions only. Completed workouts and private notes are not included."],
  ]) summary.addRow(row);
  const sheet = workbook.addWorksheet("Workouts", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    ["Week", 8], ["Day", 8], ["Workout", 28], ["Exercise", 30], ["Sets", 12],
    ["Reps / range", 16], ["Effort", 22], ["Weight prescription (lb)", 26],
    ["Per-set weights (lb)", 36], ["Lift", 14], ["Programming notes", 60],
  ].map(([header, width]) => ({ header: String(header), width: Number(width) }));
  for (const workout of [...program.workouts].sort((a,b)=>a.week-b.week || a.day-b.day)) {
    if (!workout.exercises.length) sheet.addRow([workout.week, workout.day, workout.name]);
    for (const exercise of workout.exercises) {
      sheet.addRow([workout.week, workout.day, workout.name, exercise.name, exercise.sets,
        exercise.reps, exercise.effort, exercise.weight,
        exercise.setWeights?.map((weight,i)=>`Set ${i+1}: ${weight == null ? "No override" : weight}`).join("; ") || "",
        exercise.lift, exercise.notes]);
    }
  }
  // Explicit strings prevent dates/ranges and leading '=' text becoming formulas.
  sheet.getColumn(5).numFmt = "@";
  sheet.getColumn(6).numFmt = "@";
  sheet.autoFilter = { from: "A1", to: "K1" };
  for (const ws of [summary, sheet]) {
    ws.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:"top",wrapText:true};}));
    ws.getRow(1).eachCell(cell=>{
      cell.font={bold:true,color:{argb:"FFFFFFFF"}};
      cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF00205B"}};
    });
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${program.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").slice(0,100) || "program"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
