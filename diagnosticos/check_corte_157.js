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

const cobrosQuery = `
    SELECT 
        d.id,
        d.importe AS importe_cobrado,
        COALESCE(v.IMPORTE, (SELECT TOP 1 v_orig.IMPORTE FROM ventas v_orig WHERE LTRIM(RTRIM(v_orig.VENTA)) = LTRIM(RTRIM(ISNULL(NULLIF(d.venta, 0), (SELECT TOP 1 c_orig.venta FROM cobdet c_orig WHERE LTRIM(RTRIM(c_orig.COBRANZA)) = LTRIM(RTRIM(d.COBRANZA)) AND c_orig.CLIENTE = d.CLIENTE AND c_orig.Cargo_ab = 'C')))))) AS venta_total,
        ISNULL(
            (SELECT SUM(p.CANTIDAD * p.COSTO) FROM partvta p WHERE LTRIM(RTRIM(p.VENTA)) = LTRIM(RTRIM(ISNULL(NULLIF(d.venta, 0), (SELECT TOP 1 c_orig.venta FROM cobdet c_orig WHERE LTRIM(RTRIM(c_orig.COBRANZA)) = LTRIM(RTRIM(d.COBRANZA)) AND c_orig.CLIENTE = d.CLIENTE AND c_orig.Cargo_ab = 'C'))))), 
            0
        ) AS venta_costo
    FROM cobdet d
    LEFT JOIN ventas v ON LTRIM(RTRIM(d.venta)) = LTRIM(RTRIM(v.VENTA)) AND d.venta > 0
    WHERE d.id IN (9102, 9103, 9104)
`;

console.log("=== EJECUTAR CONSULTA DE COSTOS PARA 157 ===");
console.log(runBasicQuery(cobrosQuery));
