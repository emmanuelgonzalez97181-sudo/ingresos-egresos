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

const start = '2026-06-21';
const end = '2026-06-27';

// 1. Get cuts
const cuts = runBasicQuery(`
    SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, CONVERT(varchar, usufecha, 23) as usufecha, usuhora, estacion
    FROM corteszx 
    WHERE corte = 'z' 
      AND CONVERT(varchar, usufecha, 23) >= '${start}'
      AND CONVERT(varchar, usufecha, 23) <= '${end}'
`);

console.log(`Encontrados ${cuts.length} cortes.`);

// Process each cut
const cutsDetails = [];
let totalCostoGlobal = 0;

cuts.forEach(c => {
    // Find the end flow
    const dateStr = c.usufecha;
    const findEndQuery = `
        SELECT TOP 1 FLUJO 
        FROM flujo 
        WHERE CONCEPTO = 'CORTZ' 
          AND ESTACION = '${c.estacion}'
          AND IMPORTE = ${c.totalCaja}
          AND CONVERT(varchar, FECHA, 23) = '${dateStr}'
        ORDER BY FLUJO DESC
    `;
    const endResult = runBasicQuery(findEndQuery);
    if (endResult.length > 0) {
        const flujoEnd = parseInt(endResult[0].FLUJO);
        
        const findStartQuery = `
            SELECT TOP 1 FLUJO 
            FROM flujo 
            WHERE CONCEPTO = 'CORTZ' 
              AND ESTACION = '${c.estacion}'
              AND FLUJO < ${flujoEnd}
            ORDER BY FLUJO DESC
        `;
        const startResult = runBasicQuery(findStartQuery);
        const flujoStart = startResult.length > 0 ? parseInt(startResult[0].FLUJO) : 0;
        
        const getFlujosQuery = `
            SELECT f.FLUJO, f.ING_EG, f.CONCEPTO, f.concepto2, f.IMPORTE, f.id_cobdet
            FROM flujo f
            WHERE f.FLUJO > ${flujoStart} AND f.FLUJO <= ${flujoEnd} AND f.ESTACION = '${c.estacion}'
        `;
        const flujos = runBasicQuery(getFlujosQuery);
        
        const cobdetIds = flujos.filter(f => f.CONCEPTO.trim() === 'CLIEN' && f.id_cobdet).map(f => parseInt(f.id_cobdet));
        
        let corteCosto = 0;
        if (cobdetIds.length > 0) {
            const cobrosQuery = `
                SELECT 
                    d.importe AS importe_cobrado,
                    COALESCE(v.IMPORTE, (SELECT TOP 1 v_orig.IMPORTE FROM ventas v_orig WHERE LTRIM(RTRIM(v_orig.VENTA)) = LTRIM(RTRIM(ISNULL(NULLIF(d.venta, 0), (SELECT TOP 1 c_orig.venta FROM cobdet c_orig WHERE LTRIM(RTRIM(c_orig.COBRANZA)) = LTRIM(RTRIM(d.COBRANZA)) AND c_orig.CLIENTE = d.CLIENTE AND c_orig.Cargo_ab = 'C')))))) AS venta_total,
                    ISNULL(
                        (SELECT SUM(p.CANTIDAD * p.COSTO) FROM partvta p WHERE LTRIM(RTRIM(p.VENTA)) = LTRIM(RTRIM(ISNULL(NULLIF(d.venta, 0), (SELECT TOP 1 c_orig.venta FROM cobdet c_orig WHERE LTRIM(RTRIM(c_orig.COBRANZA)) = LTRIM(RTRIM(d.COBRANZA)) AND c_orig.CLIENTE = d.CLIENTE AND c_orig.Cargo_ab = 'C'))))), 
                        0
                    ) AS venta_costo
                FROM cobdet d
                LEFT JOIN ventas v ON LTRIM(RTRIM(d.venta)) = LTRIM(RTRIM(v.VENTA)) AND d.venta > 0
                WHERE d.id IN (${cobdetIds.join(',')})
            `;
            const rawCobros = runBasicQuery(cobrosQuery);
            rawCobros.forEach(rc => {
                const imp = parseFloat(rc.importe_cobrado || 0);
                const tot = parseFloat(rc.venta_total || 0);
                const cos = parseFloat(rc.venta_costo || 0);
                const proporcion = tot > 0 ? (imp / tot) : 1;
                corteCosto += cos * proporcion;
            });
        }
        
        totalCostoGlobal += corteCosto;
        cutsDetails.push({
            corte: c.numeroCorte,
            fecha: c.usufecha,
            estacion: c.estacion,
            ingresos: parseFloat(c.totalIngresos),
            egresos: parseFloat(c.totalEgresos),
            costoProporcional: corteCosto
        });
    }
});

console.log("=== DETALLE DE CORTES ===");
console.log(cutsDetails);
console.log("Costo total global:", totalCostoGlobal);
