import readXlsxFile from "read-excel-file/browser";
import { parseWorkbookSheets, type WorkbookPreview } from "./workbook-parser";

export async function importWorkbook(file: File): Promise<WorkbookPreview> {
  if(!/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx Excel workbook.");
  if(file.size>10*1024*1024) throw new Error("Workbook must be 10 MB or smaller.");
  if(!file.size) throw new Error("The workbook is empty.");
  // Read locally; only reviewed prescription JSON is sent to the server.
  // No file bytes are persisted, no formulas/macros are executed.
  const sheets=await readXlsxFile(file);
  return parseWorkbookSheets(sheets);
}
