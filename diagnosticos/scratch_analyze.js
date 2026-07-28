const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const desktopPath = 'c:/Users/Emmanuel/Desktop';
const files = ['flu.xls', 'HISTORIAL AVINA (version 2).xlsb.xlsx', 'TOTAL COMISIONES.xlsx', 'PEDIDOS POR VENDEDOR.xlsx'];

files.forEach(filename => {
    const fullPath = path.join(desktopPath, filename);
    if (!fs.existsSync(fullPath)) {
        console.log(`File not found: ${filename}`);
        return;
    }
    
    try {
        const workbook = xlsx.readFile(fullPath);
        console.log(`\n=========================================`);
        console.log(`FILE: ${filename}`);
        console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);
        
        // Read first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        
        console.log(`Rows: ${range.e.r + 1}, Columns: ${range.e.c + 1}`);
        
        // Get first few rows as JSON
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        console.log(`Sample rows (first 5):`);
        jsonData.slice(0, 8).forEach((row, i) => {
            console.log(`  Row ${i + 1}:`, row.slice(0, 10));
        });
    } catch (err) {
        console.log(`Error reading ${filename}: ${err.message}`);
    }
});
