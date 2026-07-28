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

console.log("=== VENDS DATA ===");
console.log(runQuery("SELECT Vend, Nombre, Activo FROM vends"));
