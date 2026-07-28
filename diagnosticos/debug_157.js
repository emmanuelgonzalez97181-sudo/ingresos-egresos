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
        console.error("Error SQL:", err.message);
        return [];
    }
}

const start = '2026-06-21';
const end = '2026-06-27';

const query = `
    SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, CONVERT(varchar, usufecha, 23) as usufecha, usuhora, estacion
    FROM corteszx 
    WHERE corte = 'z' 
      AND CONVERT(varchar, usufecha, 23) >= '${start}'
      AND CONVERT(varchar, usufecha, 23) <= '${end}'
`;

const cutsInRange = runSqlcmdQuery(query);

const flowsQuery = `
    SELECT f.FLUJO, f.ING_EG, f.CONCEPTO, f.concepto2, f.IMPORTE, f.ESTACION, CONVERT(varchar, f.FECHA, 23) as FECHA, f.id_cobdet, ISNULL(c.DESCRIP, f.CONCEPTO) as DESCRIP
    FROM flujo f
    LEFT JOIN conegre c ON RTRIM(LTRIM(f.CONCEPTO)) = RTRIM(LTRIM(c.CONCEPTO))
    WHERE CONVERT(varchar, f.FECHA, 23) >= '${start}' AND CONVERT(varchar, f.FECHA, 23) <= '${end}'
`;
const allFlows = runSqlcmdQuery(flowsQuery);

const flowsByStation = {};
allFlows.forEach(f => {
    if (!flowsByStation[f.ESTACION]) flowsByStation[f.ESTACION] = [];
    flowsByStation[f.ESTACION].push(f);
});

console.log("=== DEBUGGING CORTE 157 ===");
const c = cutsInRange.find(x => x.numeroCorte == 157);
if (c) {
    const stationFlows = flowsByStation[c.estacion] || [];
    console.log(`Total flujos en estación ${c.estacion}: ${stationFlows.length}`);
    
    const endFlowIndex = stationFlows.findIndex(f => 
        f.CONCEPTO.trim() === 'CORTZ' && 
        parseFloat(f.IMPORTE) === parseFloat(c.totalCaja) &&
        f.FECHA === c.usufecha
    );
    console.log(`endFlowIndex: ${endFlowIndex}`);
    
    if (endFlowIndex !== -1) {
        const flujoEnd = parseInt(stationFlows[endFlowIndex].FLUJO);
        let flujoStart = 0;
        for (let i = endFlowIndex - 1; i >= 0; i--) {
            if (stationFlows[i].CONCEPTO.trim() === 'CORTZ') {
                flujoStart = parseInt(stationFlows[i].FLUJO);
                break;
            }
        }
        console.log(`flujoStart: ${flujoStart}, flujoEnd: ${flujoEnd}`);
        
        const cobdetIds = [];
        stationFlows.forEach(f => {
            const idFlujo = parseInt(f.FLUJO);
            if (idFlujo > flujoStart && idFlujo <= flujoEnd) {
                console.log(`Procesando Flujo #${idFlujo}: CONCEPTO=${f.CONCEPTO}, ING_EG=${f.ING_EG}, id_cobdet=${f.id_cobdet}`);
                if (f.ING_EG === 'I') {
                    if (f.CONCEPTO.trim() === 'CLIEN' && f.id_cobdet) {
                        cobdetIds.push(parseInt(f.id_cobdet));
                    }
                }
            }
        });
        console.log(`cobdetIds encontrados:`, cobdetIds);
    }
}
