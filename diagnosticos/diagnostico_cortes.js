const { execSync } = require('child_process');

function runSqlcmdQuery(query) {
    try {
        const cleanQuery = query.replace(/\r?\n|\r/g, ' ');
        const wrappedQuery = `SET NOCOUNT ON; ${cleanQuery} FOR JSON PATH;`;
        const cmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -w 65535 -y 0 -Q "${wrappedQuery.replace(/"/g, '\\"')}"`;
        const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
        const cleaned = stdout.trim().replace(/\r\n/g, '').replace(/\n/g, '');
        if (!cleaned || cleaned.startsWith('Msg ') || cleaned === '') return [];
        return JSON.parse(cleaned);
    } catch (err) {
        return [];
    }
}

// 1. Escanear qué tablas de ventas o tickets tienen datos en la BD
console.log("=== Comprobar tamaño de tablas principales ===");
const counts = {
    ventas: runSqlcmdQuery("SELECT COUNT(*) as total FROM ventas")[0] || {total: 0},
    cobdet: runSqlcmdQuery("SELECT COUNT(*) as total FROM cobdet")[0] || {total: 0},
    flujo: runSqlcmdQuery("SELECT COUNT(*) as total FROM flujo")[0] || {total: 0},
    corteszx: runSqlcmdQuery("SELECT COUNT(*) as total FROM corteszx")[0] || {total: 0},
    partvta: runSqlcmdQuery("SELECT COUNT(*) as total FROM partvta")[0] || {total: 0}
};
console.log(counts);

// 2. Obtener 3 cortes representativos de cortes (el último, uno del medio, y uno de los primeros)
console.log("\n=== Obtener Cortes Disponibles ===");
const todosCortes = runSqlcmdQuery("SELECT numeroCorte, totalCaja, CONVERT(varchar, usufecha, 126) as usufecha FROM corteszx WHERE corte = 'z' ORDER BY numeroCorte DESC");
console.log("Total cortes:", todosCortes.length);

if (todosCortes.length > 0) {
    const ultimo = todosCortes[0];
    const medio = todosCortes[Math.floor(todosCortes.length / 2)];
    const primero = todosCortes[todosCortes.length - 1];
    
    const cortesAEvaluar = [
        { desc: 'ÚLTIMO CORTE', data: ultimo },
        { desc: 'CORTE MEDIO', data: medio },
        { desc: 'PRIMER CORTE', data: primero }
    ];
    
    for (const c of cortesAEvaluar) {
        console.log(`\n========================================`);
        console.log(`${c.desc}: Corte #${c.data.numeroCorte} de fecha ${c.data.usufecha}`);
        console.log(`========================================`);
        
        // Buscar el flujo de caja del corte para saber de qué flujo a qué flujo va
        const dateStr = c.data.usufecha.substring(0, 10);
        const endRes = runSqlcmdQuery(`SELECT TOP 1 FLUJO FROM flujo WHERE CONCEPTO = 'CORTZ' AND IMPORTE = ${c.data.totalCaja} AND CONVERT(varchar, FECHA, 126) LIKE '${dateStr}%' ORDER BY FLUJO DESC`);
        
        if (endRes.length > 0) {
            const flujoEnd = endRes[0].FLUJO;
            const startRes = runSqlcmdQuery(`SELECT TOP 1 FLUJO FROM flujo WHERE CONCEPTO = 'CORTZ' AND FLUJO < ${flujoEnd} ORDER BY FLUJO DESC`);
            const flujoStart = startRes.length > 0 ? startRes[0].FLUJO : 0;
            
            console.log(`Rango de flujos: Flujo > ${flujoStart} hasta Flujo <= ${flujoEnd}`);
            
            // Consultar cobranza/ventas asociadas a este rango
            const queryFlujos = `
                SELECT FLUJO, CONCEPTO, concepto2, IMPORTE, id_cobdet 
                FROM flujo 
                WHERE FLUJO > ${flujoStart} AND FLUJO <= ${flujoEnd}
            `;
            const flujosCorte = runSqlcmdQuery(queryFlujos);
            console.log(`Total de flujos en el corte: ${flujosCorte.length}`);
            
            const cobdetIds = flujosCorte.filter(f => f.CONCEPTO.trim() === 'CLIEN' && f.id_cobdet).map(f => f.id_cobdet);
            console.log("IDs de cobdet encontrados en este corte:", cobdetIds);
            
            if (cobdetIds.length > 0) {
                // Consultar cobdet
                const queryCobdet = `
                    SELECT 
                        d.id, 
                        d.COBRANZA, 
                        d.CLIENTE, 
                        d.TIPO_DOC, 
                        d.Cargo_ab, 
                        d.IMPORTE, 
                        d.VENTA, 
                        d.ABONO,
                        (SELECT TOP 1 c_orig.venta FROM cobdet c_orig WHERE LTRIM(RTRIM(c_orig.COBRANZA)) = LTRIM(RTRIM(d.COBRANZA)) AND c_orig.CLIENTE = d.CLIENTE AND c_orig.Cargo_ab = 'C') as venta_orig
                    FROM cobdet d 
                    WHERE d.id IN (${cobdetIds.join(',')})
                `;
                const cobdets = runSqlcmdQuery(queryCobdet);
                console.log("\nDetalle de cobdet en el corte:");
                console.log(cobdets);
                
                // Buscar ventas asociadas en la tabla ventas si hay alguna
                const ventaIds = cobdets.map(d => d.venta_orig || d.VENTA).filter(v => v > 0);
                if (ventaIds.length > 0) {
                    const queryVentasInfo = `
                        SELECT VENTA, VEND, IMPORTE, COSTO, CLIENTE, FACTURA 
                        FROM ventas 
                        WHERE VENTA IN (${ventaIds.join(',')})
                    `;
                    const ventasInfo = runSqlcmdQuery(queryVentasInfo);
                    console.log("\nInformación de ventas en la tabla 'ventas':");
                    console.log(ventasInfo);
                } else {
                    console.log("\nNo se pudieron enlazar IDs de venta original mayores a 0.");
                }
            } else {
                console.log("Este corte no tiene ingresos por cobro de clientes (CLIEN).");
            }
        } else {
            console.log("No se pudo localizar el flujo CORTZ correspondiente.");
        }
    }
}
