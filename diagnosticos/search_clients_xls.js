const XLSX = require('xlsx');

try {
    const workbook = XLSX.readFile('tikets.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    const clientIds = ['232101', '251434', '40711', '107715'];
    console.log("=== BUSCAR CLIENTES DEL CORTE 159 EN EL EXCEL ===");
    clientIds.forEach(id => {
        const matches = data.filter(r => r["__EMPTY_5"] == id || r["__EMPTY_5"] == id.trim());
        console.log(`\nCliente: ${id}`);
        console.log(matches.slice(0, 5));
    });

} catch (err) {
    console.error("Error:", err.message);
}
