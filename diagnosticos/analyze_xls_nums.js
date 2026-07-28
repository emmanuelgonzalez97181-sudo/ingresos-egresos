const XLSX = require('xlsx');

try {
    const workbook = XLSX.readFile('tikets.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    console.log("=== MUESTRA DE NUMEROS EN EXCEL (__EMPTY_1) ===");
    const nums = data.map(r => r["__EMPTY_1"]).filter(n => n !== undefined && typeof n === 'number' || !isNaN(n));
    console.log("Muestra de números:", nums.slice(0, 100));
    console.log("Mínimo número:", Math.min(...nums));
    console.log("Máximo número:", Math.max(...nums));

    console.log("\n=== CONTEO DE TIPOS DE DOCUMENTO (Doc.) ===");
    const docs = {};
    data.forEach(r => {
        const doc = r["Remisiones y Tickets del periodo  (no incluye remisiones o tickets cancelados en totales)"];
        if (doc) {
            docs[doc] = (docs[doc] || 0) + 1;
        }
    });
    console.log(docs);
} catch (err) {
    console.error("Error:", err.message);
}
