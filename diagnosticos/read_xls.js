const XLSX = require('xlsx');

try {
    const workbook = XLSX.readFile('tikets.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    console.log("=== EXCEL DATA SAMPLE (FIRST 5 ROWS) ===");
    console.log(JSON.stringify(data.slice(0, 5), null, 2));
    
    console.log("\n=== TOTAL ROWS IN EXCEL ===");
    console.log(data.length);

    console.log("\n=== COLUMN NAMES ===");
    if (data.length > 0) {
        console.log(Object.keys(data[0]));
    }
} catch (err) {
    console.error("Error reading xls file:", err.message);
}
