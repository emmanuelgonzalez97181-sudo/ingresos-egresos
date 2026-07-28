require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan credenciales de Supabase en el archivo .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const dbPath = path.join(__dirname, 'db.json');

async function migrateData() {
    console.log('Iniciando migración desde db.json a Supabase...');

    if (!fs.existsSync(dbPath)) {
        console.error('No se encontró el archivo db.json en', dbPath);
        return;
    }

    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    // 1. Migrar Usuarios
    if (db.usuarios && db.usuarios.length > 0) {
        console.log(`Migrando ${db.usuarios.length} usuarios...`);
        const { error } = await supabase.from('ie_usuarios').upsert(
            db.usuarios.map(u => ({
                username: u.username,
                salt: u.salt || null,
                password_hash: u.passwordHash,
                rol: u.rol,
                nombre: u.nombre
            })),
            { onConflict: 'username' }
        );
        if (error) console.error('Error migrando usuarios:', error.message);
        else console.log('Usuarios migrados correctamente.');
    }

    // 2. Migrar Cuentas
    if (db.cuentas && db.cuentas.length > 0) {
        console.log(`Migrando ${db.cuentas.length} cuentas...`);
        const { error } = await supabase.from('ie_cuentas').upsert(
            db.cuentas.map(c => ({
                id: c.id,
                nombre: c.nombre,
                saldo: c.saldo,
                numero_cuenta: c.numeroCuenta || null,
                activa: c.activa !== false
            })),
            { onConflict: 'id' }
        );
        if (error) console.error('Error migrando cuentas:', error.message);
        else console.log('Cuentas migradas correctamente.');
    }

    // 3. Migrar Conciliaciones
    if (db.conciliaciones && Object.keys(db.conciliaciones).length > 0) {
        const concKeys = Object.keys(db.conciliaciones);
        console.log(`Migrando ${concKeys.length} conciliaciones...`);
        const { error } = await supabase.from('ie_conciliaciones').upsert(
            concKeys.map(k => ({
                id: k,
                fecha_conciliacion: db.conciliaciones[k].fechaConciliacion,
                distribucion: db.conciliaciones[k].distribucion,
                observaciones: db.conciliaciones[k].observaciones || null
            })),
            { onConflict: 'id' }
        );
        if (error) console.error('Error migrando conciliaciones:', error.message);
        else console.log('Conciliaciones migradas correctamente.');
    }

    // 4. Migrar Movimientos Manuales
    if (db.movimientos_manuales && db.movimientos_manuales.length > 0) {
        console.log(`Migrando ${db.movimientos_manuales.length} movimientos manuales...`);
        const { error } = await supabase.from('ie_movimientos_manuales').upsert(
            db.movimientos_manuales.map(m => ({
                id: m.id,
                fecha: m.fecha,
                tipo: m.tipo,
                cuenta_id: m.cuentaId,
                importe: m.importe,
                concepto: m.concepto,
                usuario: m.usuario || 'sistema',
                conciliacion_id: m.conciliacionId || null
            })),
            { onConflict: 'id' }
        );
        if (error) console.error('Error migrando movimientos:', error.message);
        else console.log('Movimientos migrados correctamente.');
    }

    // 5. Migrar Bitácora
    if (db.bitacora && db.bitacora.length > 0) {
        console.log(`Migrando ${db.bitacora.length} registros de bitácora...`);
        const { error } = await supabase.from('ie_bitacora').upsert(
            db.bitacora.map(b => ({
                id: b.id,
                fecha: b.fecha,
                usuario: b.usuario,
                nombre_usuario: b.nombreUsuario,
                accion: b.accion,
                detalles: b.detalles || null
            })),
            { onConflict: 'id' }
        );
        if (error) console.error('Error migrando bitácora:', error.message);
        else console.log('Bitácora migrada correctamente.');
    }

    console.log('Migración completada. Ahora puedes ejecutar la aplicación en Vercel.');
}

migrateData();
