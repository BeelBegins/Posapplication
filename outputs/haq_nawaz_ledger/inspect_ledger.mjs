import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "D:\\OneDrive\\Desktop\\Haq_Nawaz_Sahib_Ledger.xlsx";
const outputDir = "D:\\erpnext-offline-pos\\outputs\\haq_nawaz_ledger";

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
await fs.writeFile(path.join(outputDir, "inspect_summary.ndjson"), summary.ndjson, "utf8");

const sheets = JSON.parse(`[${(await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
})).ndjson.trim().split(/\r?\n/).join(",")}]`);

for (const sheet of sheets) {
  const sheetName = sheet.name;
  const safe = sheetName.replace(/[\\/:*?"<>|]+/g, "_");
  const region = await workbook.inspect({
    kind: "region",
    sheetId: sheetName,
    range: "A1:Z120",
    maxChars: 30000,
  });
  await fs.writeFile(path.join(outputDir, `region_${safe}.ndjson`), region.ndjson, "utf8");

  const formulas = await workbook.inspect({
    kind: "formula",
    sheetId: sheetName,
    range: "A1:Z200",
    maxChars: 12000,
    options: { maxResults: 200 },
  });
  await fs.writeFile(path.join(outputDir, `formulas_${safe}.ndjson`), formulas.ndjson, "utf8");

  const profit = await workbook.inspect({
    kind: "match",
    sheetId: sheetName,
    searchTerm: "profit|Profit|PROFIT|منافع|نفع|فائدہ|کمیشن",
    options: { useRegex: true, maxResults: 200 },
    maxChars: 20000,
  });
  await fs.writeFile(path.join(outputDir, `profit_matches_${safe}.ndjson`), profit.ndjson, "utf8");

  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(path.join(outputDir, `preview_${safe}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
  maxChars: 12000,
});
await fs.writeFile(path.join(outputDir, "formula_errors.ndjson"), errors.ndjson, "utf8");

console.log(`Inspection complete. Sheets: ${sheets.map((s) => s.name).join(", ")}`);
