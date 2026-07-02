import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("D:\\OneDrive\\Desktop\\Haq_Nawaz_Sahib_Ledger.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("D:\\erpnext-offline-pos\\outputs\\haq_nawaz_ledger\\artifact_roundtrip.xlsx");
console.log("saved");
