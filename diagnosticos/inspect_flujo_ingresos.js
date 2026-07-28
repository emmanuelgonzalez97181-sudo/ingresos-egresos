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

console.log("=== VALORES UNICOS EN flujo.concepto2 PARA INGRESOS ===");
const query = `
    SELECT concepto2, COUNT(*) as cantidad, SUM(IMPORTE) as total_acumulado
    FROM flujo
    WHERE ING_EG = 'I'
    GROUP BY concepto2
    ORDER BY cantidad DESC
`;
console.log(runSqlcmdQuery(query));
