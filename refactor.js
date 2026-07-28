const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

const newFunctions = `
const util = require('util');
let dbLock = Promise.resolve();

async function readLocalDbAsync() {
    try {
        if (!fs.existsSync(dbPath)) {
            return readLocalDb();
        }
        const data = await fs.promises.readFile(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading local db async", e);
        return { cuentas: [], conciliaciones: {}, movimientos_manuales: [] };
    }
}

async function writeLocalDbAsync(data) {
    try {
        await fs.promises.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing local db async", e);
    }
}

function updateDb(callback) {
    return new Promise((resolve, reject) => {
        dbLock = dbLock.then(async () => {
            try {
                const db = await readLocalDbAsync();
                await callback(db);
                await writeLocalDbAsync(db);
                resolve(db);
            } catch (err) {
                console.error("Error in updateDb queue", err);
                reject(err);
            }
        });
    });
}
`;

content = content.replace(/function writeLocalDb\(data\) \{[\s\S]*?\}\n/, match => match + newFunctions);

// Regex for wrapping routes in updateDb
// Matches: const db = readLocalDb(); ... writeLocalDb(db);
// This is very complex to match reliably because some routes use `res.json({ success: true, db });` AFTER `writeLocalDb(db)`.
// Actually, it's safer to just redefine `readLocalDb` and `writeLocalDb` to keep them synchronous, but run the server using `worker_threads`? No.
// Let's just output the modified file with newFunctions and I will manually update the critical routes.
fs.writeFileSync('server.js.new', content, 'utf8');
console.log("Success");
