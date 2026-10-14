"""Extract source workbook as prescription templates, not inferred completions.

Excel coerced ranges into date serials. Preserve raw values and flag any proposed
month/day reconstruction for manual confirmation rather than silently trusting it.
"""
import datetime
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

source = next(Path(".local/conversation-workspace/files").rglob("*.xlsx"))
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
programs = []
with zipfile.ZipFile(source) as z:
    strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        strings = ["".join(e.itertext()) for e in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    sheets = ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", ns)
    for si, sheet in enumerate(sheets):
        name = sheet.get("name")
        root = ET.fromstring(z.read(f"xl/worksheets/sheet{si+1}.xml"))
        cells = {}
        for c in root.findall(".//m:sheetData/m:row/m:c", ns):
            v, inline = c.find("m:v", ns), c.find("m:is", ns)
            value = v.text if v is not None else "".join(inline.itertext()) if inline is not None else ""
            if c.get("t") == "s" and value:
                value = strings[int(value)]
            cells[c.get("r")] = value or ""
        def col(n):
            out = ""
            while n:
                n, r = divmod(n - 1, 26)
                out = chr(65 + r) + out
            return out
        def cell(c, r):
            return cells.get(f"{col(c)}{r}", "").strip()
        def val(v):
            try:
                n = float(v)
                return str(int(n)) if n.is_integer() else str(n)
            except ValueError:
                return v
        startrow, columns = (2, [1,9,17,25]) if name == "Peak" else (1, [1]) if name == "deload" else (1,[1,8,15,22])
        workouts = []
        for wi, startcol in enumerate(columns):
            current = None
            daycount = 0
            for r in range(startrow+1, 65):
                if cell(startcol,r).lower() == "exercise":
                    title = cell(startcol,r-1) or f"Session {daycount+1}"
                    daycount += 1
                    day = next((i+1 for i,n in enumerate(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]) if n in title.lower()), [1,3,5,6][min(daycount-1,3)])
                    current = {"id": f"w{wi+1}-d{daycount}", "name": title, "week":wi+1, "day":day, "exercises":[]}
                    workouts.append(current)
                    continue
                if not current or not cell(startcol,r):
                    continue
                if not any(cell(startcol+i,r) for i in range(1,6)):
                    continue
                vals = [val(cell(startcol+i,r)) for i in range(6)]
                review = False
                warnings = []
                for i in [1,2,5]:
                    try:
                        n = float(vals[i])
                        if 30000 < n < 60000:
                            date = datetime.datetime(1899,12,30) + datetime.timedelta(days=n)
                            suggested = f"{date.month}-{date.day}"
                            warnings.append(f"Import review: {'sets' if i==1 else 'reps' if i==2 else 'notes'} source Excel date serial {vals[i]} may mean {suggested}. Confirm against original.")
                            vals[i] = suggested + "?"
                            review = True
                    except ValueError:
                        pass
                try:
                    effort = float(vals[3])
                    if 0 < effort <= 1:
                        vals[3] = f"{effort*100:g}%"
                except ValueError:
                    pass
                lower = vals[0].lower()
                lift = "squat" if lower in ["comp squat", "competition squat"] else "bench" if lower in ["comp bench","competition bench"] else "deadlift" if lower in ["deadlift","comp dead","comp deadlift","competition deadlift"] else "accessory"
                notes = vals[5]
                if vals[4]:
                    notes = ("Source weight (unit not specified): "+vals[4]+". "+notes).strip()
                if warnings:
                    notes += "\n" + "\n".join(warnings)
                current["exercises"].append({"id":f"e{r}","name":vals[0],"sets":vals[1],"reps":vals[2],"effort":vals[3],"weight":vals[4],"notes":notes,"review":review,"lift":lift})
        programs.append({
            "id": f"source-{si+1}", "name": "Meet Peak" if name=="Peak" else "Deload" if name=="deload" else name,
            "description": "Imported from your workbook. Prescriptions and source references only, not completed workout history. "+("Percentages use Block 2 week 4 singles; set your reference maxes before starting." if name=="Peak" else "Review flagged Excel date conversions before assigning."),
            "phase": "peak" if name=="Peak" else "deload" if name=="deload" else "volume" if name=="Block 1" else "strength",
            "weeks":len(columns), "archived":name=="old Block 2", "workouts":workouts,
            "source": source.name,
            "reviewCount":sum(e["review"] for w in workouts for e in w["exercises"])
        })
output = Path("artifacts/api-server/src/data/imported-programs.json")
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(programs,indent=2))
print(json.dumps([{"name":p["name"],"weeks":p["weeks"],"workouts":len(p["workouts"]),"exercises":sum(len(w["exercises"]) for w in p["workouts"]),"review":p["reviewCount"]} for p in programs],indent=2))
