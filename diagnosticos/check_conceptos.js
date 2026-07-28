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
        console.error("Error:", err.message);
        return [];
    }
}

// 1. Columnas de conegre
console.log("=== Columnas de conegre ===");
const cols = runSqlcmdQuery("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'conegre' ORDER BY ORDINAL_POSITION");
console.log(JSON.stringify(cols, null, 2));

// 2. Todo el contenido de conegre
console.log("\n=== Contenido completo de conegre ===");
const data = runSqlcmdQuery("SELECT * FROM conegre");
console.log(JSON.stringify(data, null, 2));
