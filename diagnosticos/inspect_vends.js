const { execSync } = require('child_process');

function runQuery(query) {
    try {
        const cleanQuery = query.replace(/\r?\n|\r/g, ' ');
        const fs = require('fs');
        const queryFile = 'temp_query.sql';
        fs.writeFileSync(queryFile, `SET NOCOUNT ON;\n${cleanQuery}\n`);
        const cmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -s "," -W -i "${queryFile}"`;
        const stdout = execSync(cmd, { encoding: 'utf-8' });
        if (fs.existsSync(queryFile)) fs.unlinkSync(queryFile);
        return stdout.trim().split('\n');
    } catch (e) {
        return [e.message];
    }
}

console.log("=== COLUMNS OF vends ===");
console.log(runQuery("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vends'"));

console.log("\n=== DATA OF vends ===");
console.log(runQuery("SELECT TOP 5 VENDEDOR, NOMBRE FROM vends"));
