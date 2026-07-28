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

console.log("=== TABLAS RELACIONADAS CON INGRESOS O PAGOS ===");
const query = `
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME LIKE '%ing%' 
       OR TABLE_NAME LIKE '%pag%' 
       OR TABLE_NAME LIKE '%fpago%'
       OR TABLE_NAME LIKE '%con%'
    ORDER BY TABLE_NAME
`;
const tables = runSqlcmdQuery(query);
console.log(tables.map(t => t.TABLE_NAME));
