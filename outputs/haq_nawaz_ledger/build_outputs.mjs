import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "D:\\OneDrive\\Desktop\\Haq_Nawaz_Sahib_Ledger.xlsx";
const outputDir = "D:\\erpnext-offline-pos\\outputs\\haq_nawaz_ledger";
const sheetName = "Ledger Transactions";
const firstDataRow = 5;
const lastDataRow = 95;
const totalRow = 96;

const correctionRules = [
  [/براہ ماہ/g, "برائے ماہ"],
  [/برائےانفاق/g, "برائے انفاق"],
  [/%1 برائے انفاق/g, "1% برائے انفاق"],
  [/%1 برائے فی سبیل اللہ/g, "1% برائے انفاق فی سبیل اللہ"],
  [/بنک/g, "بینک"],
  [/پرافٹ ائم ٹرانسفر کیپٹل/g, "پرافٹ ایم ٹرانسفر کیپٹل"],
  [/پرافٹ ماہ اپریل 24/g, "پرافٹ ماہ اپریل 2024"],
  [/پرافٹ مئی 24/g, "پرافٹ ماہ مئی 2024"],
  [/پرافٹ جون 24/g, "پرافٹ ماہ جون 2024"],
];

function correctedText(value) {
  if (typeof value !== "string") return value;
  let next = value;
  for (const [pattern, replacement] of correctionRules) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function isProfitAddedRow(rowValues) {
  const narration = String(rowValues[1] ?? "");
  const credit = Number(rowValues[3] ?? 0);
  return narration.includes("پرافٹ") && credit > 0;
}

function profitStats(workbook) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getRange(`A${firstDataRow}:F${lastDataRow}`).values;
  const rows = [];
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (isProfitAddedRow(values[i])) {
      rows.push(firstDataRow + i);
      total += Number(values[i][3] ?? 0);
    }
  }
  return { rows, total };
}

async function importWorkbook() {
  const input = await FileBlob.load(inputPath);
  return SpreadsheetFile.importXlsx(input);
}

function applyTextCorrections(workbook, logRows) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const used = sheet.getRange("A1:I96").values;
  for (let r = 0; r < used.length; r += 1) {
    for (let c = 0; c < used[r].length; c += 1) {
      const current = used[r][c];
      const next = correctedText(current);
      if (next !== current) {
        const cell = sheet.getCell(r, c);
        cell.values = [[next]];
        logRows.push([cell.address, current, next]);
      }
    }
  }

  const stray = sheet.getRange("I11").values?.[0]?.[0];
  if (stray) {
    sheet.getRange("I11").clear({ applyTo: "contents" });
    logRows.push(["I11", String(stray), ""]);
  }
}

function styleSmallSheet(sheet, width = "A:D") {
  sheet.showGridLines = false;
  sheet.getRange("A1:D1").format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(width).format.autofitColumns();
}

function addCorrectionsSheet(workbook, logRows) {
  const sheet = workbook.worksheets.add("Urdu Corrections");
  sheet.getRange("A1:C1").values = [["Cell", "Before", "After"]];
  sheet.getRange("A1:C1").format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF" },
  };
  if (logRows.length) {
    sheet.getRangeByIndexes(1, 0, logRows.length, 3).values = logRows;
  } else {
    sheet.getRange("A2:C2").values = [["-", "No changes", "No changes"]];
  }
  sheet.getRange("A:C").format.autofitColumns();
  sheet.getRange("A:C").format.wrapText = true;
  sheet.showGridLines = false;
}

function addNilCheckSheet(workbook, stats) {
  const sheet = workbook.worksheets.add("Nil Check");
  sheet.getRange("A1:B1").values = [["Nil Check Summary", null]];
  sheet.getRange("A3:B9").values = [
    ["Total Debit", null],
    ["Total Credit", null],
    ["Credit - Debit Difference", null],
    ["Final Ledger Balance", null],
    ["Status", null],
    ["Profit Credit Rows", null],
    ["Profit Credit Total", null],
  ];
  sheet.getRange("B3:B9").formulas = [
    [`='${sheetName}'!C${totalRow}`],
    [`='${sheetName}'!D${totalRow}`],
    ["=B4-B3"],
    [`='${sheetName}'!F${totalRow}`],
    ['=IF(B5=0,"Verified Nil","Not Nil")'],
    [null],
    [null],
  ];
  sheet.getRange("B8:B9").values = [[stats.rows.length], [stats.total]];
  sheet.getRange("A1:B1").merge();
  sheet.getRange("A3:A9").format = { font: { bold: true } };
  sheet.getRange("B3:B5").format.numberFormat = "#,##0";
  sheet.getRange("B8:B9").format.numberFormat = "#,##0";
  sheet.getRange("B7").format = {
    fill: "#E2F0D9",
    font: { bold: true, color: "#375623" },
  };
  styleSmallSheet(sheet, "A:B");
}

function recalculateLedger(workbook) {
  const sheet = workbook.worksheets.getItem(sheetName);
  sheet.getRange(`F${firstDataRow}`).formulas = [[`=IF(ROUND(D${firstDataRow}-C${firstDataRow},0)=0,"Nil",D${firstDataRow}-C${firstDataRow})`]];
  for (let row = firstDataRow + 1; row <= lastDataRow; row += 1) {
    sheet.getRange(`F${row}`).formulas = [[`=IF(ROUND(IF(F${row - 1}="Nil",0,F${row - 1})+D${row}-C${row},0)=0,"Nil",IF(F${row - 1}="Nil",0,F${row - 1})+D${row}-C${row})`]];
  }
  sheet.getRange(`C${totalRow}`).formulas = [[`=SUM(C${firstDataRow}:C${lastDataRow})`]];
  sheet.getRange(`D${totalRow}`).formulas = [[`=SUM(D${firstDataRow}:D${lastDataRow})`]];
  sheet.getRange(`F${totalRow}`).formulas = [[`=IF(ROUND(D${totalRow}-C${totalRow},0)=0,"Nil",D${totalRow}-C${totalRow})`]];
  sheet.getRange(`F${firstDataRow}:F${totalRow}`).format.numberFormat = "#,##0";
}

function highlightProfitRows(workbook) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getRange(`A${firstDataRow}:F${lastDataRow}`).values;
  const profitRows = [];
  for (let i = 0; i < values.length; i += 1) {
    const rowNumber = firstDataRow + i;
    if (isProfitAddedRow(values[i])) {
      sheet.getRange(`A${rowNumber}:F${rowNumber}`).format = {
        fill: "#FCE4D6",
        font: { bold: true, color: "#7F1D1D" },
      };
      profitRows.push(rowNumber);
    }
  }
  return profitRows;
}

function addProfitSummarySheet(workbook, stats) {
  const sheet = workbook.worksheets.add("Profit Highlights");
  sheet.getRange("A1:D1").values = [["Profit Highlights Summary", null, null, null]];
  sheet.getRange("A3:D3").values = [["Rows Highlighted", "Total Profit Credit", "First Row", "Last Row"]];
  sheet.getRange("A4:D4").values = [[stats.rows.length, stats.total, stats.rows[0] ?? "", stats.rows.at(-1) ?? ""]];
  sheet.getRange("A1:D1").merge();
  sheet.getRange("A3:D3").format = {
    fill: "#7F1D1D",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange("A4:D4").format.numberFormat = "#,##0";
  styleSmallSheet(sheet, "A:D");
}

async function saveWorkbook(workbook, filename) {
  const output = await SpreadsheetFile.exportXlsx(workbook);
  const outputPath = path.join(outputDir, filename);
  await output.save(outputPath);
  return outputPath;
}

await fs.mkdir(outputDir, { recursive: true });

const nilCorrectionLog = [];
const nilWorkbook = await importWorkbook();
applyTextCorrections(nilWorkbook, nilCorrectionLog);
recalculateLedger(nilWorkbook);
const nilStats = profitStats(nilWorkbook);
addNilCheckSheet(nilWorkbook, nilStats);
addCorrectionsSheet(nilWorkbook, nilCorrectionLog);
const nilPath = await saveWorkbook(nilWorkbook, "Haq_Nawaz_Sahib_Ledger_Recalculated_Nil_Check.xlsx");

const highlightCorrectionLog = [];
const highlightWorkbook = await importWorkbook();
applyTextCorrections(highlightWorkbook, highlightCorrectionLog);
const profitRows = highlightProfitRows(highlightWorkbook);
const highlightStats = profitStats(highlightWorkbook);
addProfitSummarySheet(highlightWorkbook, highlightStats);
addCorrectionsSheet(highlightWorkbook, highlightCorrectionLog);
const highlightPath = await saveWorkbook(highlightWorkbook, "Haq_Nawaz_Sahib_Ledger_Profit_Highlighted_Urdu_Corrected.xlsx");

console.log(JSON.stringify({
  nilPath,
  highlightPath,
  nilCorrections: nilCorrectionLog.length,
  highlightCorrections: highlightCorrectionLog.length,
  profitRows,
  profitTotal: highlightStats.total,
}, null, 2));
