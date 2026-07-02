import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "D:\\erpnext-offline-pos\\outputs\\haq_nawaz_ledger";
const files = [
  "Haq_Nawaz_Sahib_Ledger_Recalculated_Nil_Check.xlsx",
  "Haq_Nawaz_Sahib_Ledger_Profit_Highlighted_Urdu_Corrected.xlsx",
];

async function sheetsFor(workbook) {
  const ndjson = (await workbook.inspect({
    kind: "sheet",
    include: "id,name",
    maxChars: 12000,
  })).ndjson.trim();
  return ndjson ? ndjson.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

for (const file of files) {
  const filePath = path.join(outputDir, file);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const safeBase = file.replace(/\.xlsx$/i, "");
  const sheets = await sheetsFor(workbook);

  const overview = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 14000,
    tableMaxRows: 10,
    tableMaxCols: 8,
    tableMaxCellChars: 100,
  });
  await fs.writeFile(path.join(outputDir, `${safeBase}_verify_overview.ndjson`), overview.ndjson, "utf8");

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
    maxChars: 12000,
  });
  await fs.writeFile(path.join(outputDir, `${safeBase}_formula_errors.ndjson`), errors.ndjson, "utf8");

  for (const sheet of sheets) {
    const sheetName = sheet.name;
    const safeSheet = sheetName.replace(/[\\/:*?"<>|]+/g, "_");
    const preview = await workbook.render({
      sheetName,
      autoCrop: "all",
      scale: 1,
      format: "png",
    });
    await fs.writeFile(path.join(outputDir, `${safeBase}_preview_${safeSheet}.png`), new Uint8Array(await preview.arrayBuffer()));
  }

  const nilCheck = sheets.some((s) => s.name === "Nil Check")
    ? await workbook.inspect({
        kind: "table",
        range: "Nil Check!A1:B9",
        include: "values,formulas",
        tableMaxRows: 12,
        tableMaxCols: 3,
        maxChars: 8000,
      })
    : null;
  if (nilCheck) {
    await fs.writeFile(path.join(outputDir, `${safeBase}_nil_check.ndjson`), nilCheck.ndjson, "utf8");
  }

  const highlightCheck = sheets.some((s) => s.name === "Profit Highlights")
    ? await workbook.inspect({
        kind: "table",
        range: "Profit Highlights!A1:D4",
        include: "values,formulas",
        tableMaxRows: 8,
        tableMaxCols: 5,
        maxChars: 8000,
      })
    : null;
  if (highlightCheck) {
    await fs.writeFile(path.join(outputDir, `${safeBase}_profit_highlights.ndjson`), highlightCheck.ndjson, "utf8");
  }
}

console.log("verification artifacts rendered");
