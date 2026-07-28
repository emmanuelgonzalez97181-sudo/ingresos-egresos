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

// 1. Tamaño de tablas de clientes alternativas
console.log("=== Comprobar registros de tablas de clientes ===");
const counts = {
    clients: runSqlcmdQuery("SELECT COUNT(*) as total FROM clients")[0] || {total: 0},
    Clients_catalog: runSqlcmdQuery("SELECT COUNT(*) as total FROM Clients_catalog")[0] || {total: 0},
    clientspocket: runSqlcmdQuery("SELECT COUNT(*) as total FROM clientspocket")[0] || {total: 0}
};
console.log(counts);

// 2. Ver una muestra de Clients_catalog si tiene registros
if (counts.Clients_catalog.total > 0) {
    console.log("\n=== Muestra de Clients_catalog ===");
    const cols = runSqlcmdQuery("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Clients_catalog'");
    console.log(cols.map(c => c.COLUMN_NAME));
    const data = runSqlcmdQuery("SELECT TOP 5 * FROM Clients_catalog");
    console.log(data);
}

// 3. Ver una muestra de clients si tiene registros
if (counts.clients.total > 0) {
    console.log("\n=== Muestra de clients ===");
    const cols = runSqlcmdQuery("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'clients'");
    console.log(cols.map(c => c.COLUMN_NAME));
    const data = runSqlcmdQuery("SELECT TOP 5 * FROM clients");
    console.log(data);
}
