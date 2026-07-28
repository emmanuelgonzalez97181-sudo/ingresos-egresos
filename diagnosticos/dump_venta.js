const { execSync } = require('child_process');

function runBasicQuery(query) {
    try {
        const cleanQuery = query.replace(/\r?\n|\r/g, ' ');
        const fs = require('fs');
        const path = require('path');
        const queryFile = path.join(__dirname, 'temp_query.sql');
        fs.writeFileSync(queryFile, `SET NOCOUNT ON;\n${cleanQuery}\n`);
        
        const basicCmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -s "," -W -i "${queryFile}"`;
        const basicStdout = execSync(basicCmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 });
        
        if (fs.existsSync(queryFile)) fs.unlinkSync(queryFile);
        
        const lines = basicStdout.trim().split('\n');
        if (lines.length <= 1) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '' || lines[i].includes('rows affected') || lines[i].startsWith('---')) continue;
            const values = lines[i].split(',').map(v => v.trim());
            const obj = {};
            headers.forEach((h, index) => {
                obj[h] = values[index] || null;
            });
            results.push(obj);
        }
        return results;
    } catch (e) {
        console.error("Error básico:", e.message);
        return [];
    }
}

console.log("=== COLUMNAS DE ventas PARA VENTA = 4345 ===");
const allCols = runBasicQuery("SELECT * FROM ventas WHERE LTRIM(RTRIM(VENTA)) = '4345'");
const realRows = allCols.filter(r => r.VENTA && !r.VENTA.startsWith('-'));
if (realRows.length > 0) {
    const row = realRows[0];
    Object.keys(row).forEach(k => {
        if (row[k] !== null && row[k] !== '' && row[k] !== '0' && row[k] !== '0.00' && row[k] !== '0.0') {
            console.log(`${k}: ${row[k]}`);
        }
    });
}
