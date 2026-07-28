const XLSX = require('xlsx');

try {
    const workbook = XLSX.readFile('tikets.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    // Find ticket number 4345
    console.log("=== BUSCAR TICKET 4345 EN EXCEL ===");
    const rows4345 = data.filter(r => r["__EMPTY_1"] == 4345 || r["__EMPTY_1"] == "4345");
    console.log(rows4345);

    console.log("\n=== BUSCAR CLIENTE DE TICKET 4345 ===");
    // What about ticket 4357?
    const rows4357 = data.filter(r => r["__EMPTY_1"] == 4357);
    console.log(rows4357);

    // Let's filter some rows around 6487 / 6488
    console.log("\n=== BUSCAR TICKET 6487 Y 6488 EN EXCEL ===");
    console.log(data.filter(r => r["__EMPTY_1"] == 6487 || r["__EMPTY_1"] == 6488));

} catch (err) {
    console.error("Error:", err.message);
}
