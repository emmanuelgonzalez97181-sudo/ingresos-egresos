const { execSync } = require('child_process');

function runBasicQuery(query) {
    try {
        const cleanQuery = query.replace(/\r?\n|\r/g, ' ');
        // Escapamos las comillas dobles y usamos un archivo temporal para pasar la consulta a sqlcmd para evitar fallos de shell en Windows
        const fs = require('fs');
        const path = require('path');
        const queryFile = path.join(__dirname, 'temp_query.sql');
        fs.writeFileSync(queryFile, `SET NOCOUNT ON;\n${cleanQuery}\n`);
        
        const basicCmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -s "," -W -i "${queryFile}"`;
        const basicStdout = execSync(basicCmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 5 });
        
        // Limpiamos el archivo temporal
        if (fs.existsSync(queryFile)) fs.unlinkSync(queryFile);
        
        const lines = basicStdout.trim().split('\n');
        if (lines.length <= 1) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '' || lines[i].includes('rows affected')) continue;
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

console.log("=== Artículos vendidos en las partidas de venta ===");
const query = `
    SELECT 
        VENTA, 
        ARTICULO, 
        PRDESCRIP, 
        CANTIDAD, 
        PRECIO, 
        COSTO 
    FROM partvta 
    WHERE VENTA IN (4345, 6487, 4357, 6488)
`;
const res = runBasicQuery(query);
console.log(res);
