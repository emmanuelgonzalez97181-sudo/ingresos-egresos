const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// 1. Añadir dependencias de Supabase al principio
if (!content.includes('@supabase/supabase-js')) {
    content = `require('dotenv').config();\nconst { createClient } = require('@supabase/supabase-js');\nconst supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);\n\n` + content;
}

// 2. Reemplazar readLocalDb y writeLocalDb
const newDbFunctions = `
// --- NUEVAS FUNCIONES DE SUPABASE ---
async function readLocalDbAsync() {
    try {
        const [usuariosRes, cuentasRes, conciliacionesRes, movimientosRes, bitacoraRes] = await Promise.all([
            supabase.from('ie_usuarios').select('*'),
            supabase.from('ie_cuentas').select('*'),
            supabase.from('ie_conciliaciones').select('*'),
            supabase.from('ie_movimientos_manuales').select('*'),
            supabase.from('ie_bitacora').select('*')
        ]);

        const db = {
            usuarios: (usuariosRes.data || []).map(u => ({ ...u, passwordHash: u.password_hash })),
            cuentas: (cuentasRes.data || []).map(c => ({ ...c, numeroCuenta: c.numero_cuenta })),
            conciliaciones: {},
            movimientos_manuales: movimientosRes.data || [],
            bitacora: (bitacoraRes.data || []).map(b => ({ ...b, nombreUsuario: b.nombre_usuario }))
        };

        (conciliacionesRes.data || []).forEach(c => {
            db.conciliaciones[c.id] = {
                fechaConciliacion: c.fecha_conciliacion,
                distribucion: c.distribucion,
                observaciones: c.observaciones
            };
        });

        return db;
    } catch (e) {
        console.error("Error leyendo de Supabase:", e);
        return { usuarios: [], cuentas: [], conciliaciones: {}, movimientos_manuales: [], bitacora: [] };
    }
}

async function writeLocalDbAsync(db) {
    try {
        // En una refactorización ideal, cada endpoint actualizaría solo lo que cambió.
        // Como solución rápida para Vercel, hacemos upsert de todo (esto puede ser lento, pero funciona).
        if (db.usuarios && db.usuarios.length > 0) {
            await supabase.from('ie_usuarios').upsert(db.usuarios.map(u => ({ username: u.username, salt: u.salt, password_hash: u.passwordHash, rol: u.rol, nombre: u.nombre })), { onConflict: 'username' });
        }
        if (db.cuentas && db.cuentas.length > 0) {
            await supabase.from('ie_cuentas').upsert(db.cuentas.map(c => ({ id: c.id, nombre: c.nombre, saldo: c.saldo, numero_cuenta: c.numeroCuenta, activa: c.activa })), { onConflict: 'id' });
        }
        if (db.conciliaciones && Object.keys(db.conciliaciones).length > 0) {
            await supabase.from('ie_conciliaciones').upsert(Object.keys(db.conciliaciones).map(k => ({ id: k, fecha_conciliacion: db.conciliaciones[k].fechaConciliacion, distribucion: db.conciliaciones[k].distribucion, observaciones: db.conciliaciones[k].observaciones })), { onConflict: 'id' });
        }
        if (db.movimientos_manuales && db.movimientos_manuales.length > 0) {
            await supabase.from('ie_movimientos_manuales').upsert(db.movimientos_manuales.map(m => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, cuenta_id: m.cuentaId, importe: m.importe, concepto: m.concepto, usuario: m.usuario, conciliacion_id: m.conciliacionId })), { onConflict: 'id' });
        }
        if (db.bitacora && db.bitacora.length > 0) {
            await supabase.from('ie_bitacora').upsert(db.bitacora.map(b => ({ id: b.id, fecha: b.fecha, usuario: b.usuario, nombre_usuario: b.nombreUsuario, accion: b.accion, detalles: b.detalles })), { onConflict: 'id' });
        }
    } catch (e) {
        console.error("Error escribiendo en Supabase:", e);
    }
}
// --- FIN FUNCIONES SUPABASE ---
`;

// Insertar las nuevas funciones después de la definición de dbPath
content = content.replace(/(const dbPath = path\.join\(__dirname, 'db\.json'\);)/, '$1\n\n' + newDbFunctions);

// 3. Modificar las firmas de los endpoints a async
content = content.replace(/app\.(get|post|put|delete)\(([^,]+),\s*(authenticate,)?\s*\(req,\s*res\)\s*=>\s*\{/g, 'app.$1($2, $3 async (req, res) => {');
content = content.replace(/app\.use\(\(req,\s*res,\s*next\)\s*=>\s*\{/g, 'app.use(async (req, res, next) => {');

// 4. Modificar readLocalDb() a await readLocalDbAsync()
content = content.replace(/readLocalDb\(\)/g, 'await readLocalDbAsync()');

// 5. Modificar writeLocalDb(db) a await writeLocalDbAsync(db)
content = content.replace(/writeLocalDb\(([^)]+)\)/g, 'await writeLocalDbAsync($1)');

fs.writeFileSync('server.js', content, 'utf8');
console.log('Refactorización completada con éxito.');
