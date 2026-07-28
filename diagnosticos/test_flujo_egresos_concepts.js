const { execSync } = require('child_process');

function runQuery() {
    const start = '2026-05-01';
    const end = '2026-05-31';
    const sql = `
        SELECT CONCEPTO, SUM(IMPORTE) as total, COUNT(*) as qty
        FROM flujo 
        WHERE ING_EG = 'E' 
          AND CONVERT(varchar, FECHA, 23) >= '${start}'
          AND CONVERT(varchar, FECHA, 23) <= '${end}'
        GROUP BY CONCEPTO
    `;
    const cmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -w 65535 -y 0 -Q "${sql.replace(/\n/g, ' ')}"`;
    try {
        const stdout = execSync(cmd, { encoding: 'utf-8' });
        console.log("SQL Output:\n", stdout);
    } catch (e) {
        console.error("Query failed:", e.message);
    }
}

runQuery();
