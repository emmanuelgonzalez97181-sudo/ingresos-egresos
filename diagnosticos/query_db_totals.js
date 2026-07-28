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

// 1. Get cortes
const cuts = runBasicQuery(`
    SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, CONVERT(varchar, usufecha, 23) as usufecha, usuhora, estacion
    FROM corteszx 
    WHERE corte = 'z' 
      AND CONVERT(varchar, usufecha, 23) >= '${start}'
      AND CONVERT(varchar, usufecha, 23) <= '${end}'
    ORDER BY numeroCorte ASC
`);

console.log("=== CORTES ENCONTRADOS ===");
console.log(cuts);

let totalIngresosAll = 0;
let totalEgresosAll = 0;
let totalCostoAll = 0;

console.log("\n=== PROCESANDO CORTE POR CORTE ===");
cuts.forEach(c => {
    // End flow
    const findEndQuery = `
        SELECT TOP 1 FLUJO 
        FROM flujo 
        WHERE CONCEPTO = 'CORTZ' 
          AND ESTACION = '${c.estacion}'
          AND IMPORTE = ${c.totalCaja}
          AND CONVERT(varchar, FECHA, 23) = '${c.usufecha}'
        ORDER BY FLUJO DESC
    `;
    const endResult = runBasicQuery(findEndQuery);
    if (endResult.length === 0) {
        console.log(`Corte #${c.numeroCorte}: No se encontró flujo CORTZ correspondiente.`);
        return;
    }
    const flujoEnd = parseInt(endResult[0].FLUJO);
    
    // Start flow
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
    
    // Get flows (egresos and cobdet IDs)
    const flujos = runBasicQuery(`
        SELECT FLUJO, ING_EG, CONCEPTO, IMPORTE, id_cobdet
        FROM flujo
        WHERE FLUJO > ${flujoStart} AND FLUJO <= ${flujoEnd} AND ESTACION = '${c.estacion}'
    `);
    
    let egresosCorte = 0;
    const cobdetIds = [];
    
    flujos.forEach(f => {
        const imp = parseFloat(f.IMPORTE || 0);
        if (f.ING_EG === 'E' && f.CONCEPTO.trim() !== 'CORTZ') {
            egresosCorte += imp;
        } else if (f.ING_EG === 'I' && f.CONCEPTO.trim() === 'CLIEN' && f.id_cobdet) {
            cobdetIds.push(parseInt(f.id_cobdet));
        }
    });
    
    // Calculate cost
    let costoCorte = 0;
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
            costoCorte += cos * proporcion;
        });
    }
    
    const ing = parseFloat(c.totalIngresos);
    const utilB = ing - costoCorte;
    const utilN = utilB - egresosCorte;
    
    totalIngresosAll += ing;
    totalEgresosAll += egresosCorte;
    totalCostoAll += costoCorte;
    
    console.log(`\nCorte #${c.numeroCorte} (${c.usufecha} - ${c.estacion}):`);
    console.log(`  - Ingresos (totalIngresos): $${ing.toFixed(2)}`);
    console.log(`  - Costo de Mercancía: $${costoCorte.toFixed(2)}`);
    console.log(`  - Utilidad Bruta (Ing - Costo): $${utilB.toFixed(2)}`);
    console.log(`  - Egresos (Retiros): $${egresosCorte.toFixed(2)}`);
    console.log(`  - Utilidad Neta (Utilidad Bruta - Egresos): $${utilN.toFixed(2)}`);
});

const totalIngresos = totalIngresosAll;
const totalEgresos = totalEgresosAll;
const totalCosto = totalCostoAll;
const totalUtilidadBruta = totalIngresos - totalCosto;
const totalUtilidadNeta = totalUtilidadBruta - totalEgresos;

console.log("\n========================================");
console.log("=== TOTALES GLOBALES DEL PERIODO ===");
console.log("========================================");
console.log(`TOTAL INGRESOS:        $${totalIngresos.toFixed(2)}`);
console.log(`TOTAL COSTO MERCANCÍA: $${totalCosto.toFixed(2)}`);
console.log(`TOTAL UTILIDAD BRUTA:  $${totalUtilidadBruta.toFixed(2)}`);
console.log(`TOTAL EGRESOS:         $${totalEgresos.toFixed(2)}`);
console.log(`TOTAL UTILIDAD NETA:   $${totalUtilidadNeta.toFixed(2)}`);
console.log("========================================");
