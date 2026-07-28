const { execSync } = require('child_process');

// Recreamos runSqlcmdQuery de server.js
function runSqlcmdQuery(query) {
    try {
        const cleanQuery = query.replace(/\r?\n|\r/g, ' ');
        const wrappedQuery = `SET NOCOUNT ON; ${cleanQuery} FOR JSON PATH;`;
        
        const cmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -w 65535 -y 0 -Q "${wrappedQuery.replace(/"/g, '\\"')}"`;
        const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
        
        const cleaned = stdout.trim().replace(/\r\n/g, '').replace(/\n/g, '');
        if (!cleaned || cleaned.startsWith('Msg ') || cleaned === '') {
            return [];
        }
        return JSON.parse(cleaned);
    } catch (err) {
        console.error("FOR JSON PATH failed:", err.message);
        try {
            const basicCmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -s "," -W -Q "SET NOCOUNT ON; ${query}"`;
            const basicStdout = execSync(basicCmd, { encoding: 'utf-8' });
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
        } catch (err2) {
            console.error("Basic fallback failed:", err2.message);
            return [];
        }
    }
}

const query = `
    SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, CONVERT(varchar, usufecha, 23) as usufecha, usuhora, estacion
    FROM corteszx 
    WHERE corte = 'z' 
      AND CONVERT(varchar, usufecha, 23) >= '2026-05-01'
      AND CONVERT(varchar, usufecha, 23) <= '2026-05-31'
`;

const res = runSqlcmdQuery(query);
console.log("Result length:", res.length);
console.log("Sample result:", res[0]);
