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

console.log("=== COLUMNAS DE c_FormaPago ===");
const cols = runSqlcmdQuery("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'c_FormaPago'");
console.log(cols.map(c => c.COLUMN_NAME));

console.log("\n=== REGISTROS DE c_FormaPago ===");
const data = runSqlcmdQuery("SELECT TOP 10 * FROM c_FormaPago");
console.log(data);
