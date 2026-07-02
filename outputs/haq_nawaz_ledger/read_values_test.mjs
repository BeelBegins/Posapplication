import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("D:\\OneDrive\\Desktop\\Haq_Nawaz_Sahib_Ledger.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Ledger Transactions");
const values = sheet.getRange("A1:F12").values;
await fs.writeFile("D:\\erpnext-offline-pos\\outputs\\haq_nawaz_ledger\\values_test.json", JSON.stringify(values, null, 2), "utf8");
console.log("saved values_test.json");
