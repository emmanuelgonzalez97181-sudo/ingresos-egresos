require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = path.join(__dirname, 'db.json');


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


let memoryDb = null;
let pendingSave = false;

function readLocalDb() {
    if (memoryDb) return memoryDb;
    try {
        if (!fs.existsSync(dbPath)) {
            const initialDb = { cuentas: [
                { id: "efectivo", nombre: "Caja Chica Efectivo", saldo: 0.0 },
                { id: "banorte", nombre: "Banorte", saldo: 0.0 },
                { id: "bancomer", nombre: "BBVA Bancomer", saldo: 0.0 }
            ], conciliaciones: {}, movimientos_manuales: [] };
            fs.writeFileSync(dbPath, JSON.stringify(initialDb, null, 2));
            memoryDb = initialDb;
            return memoryDb;
        }
        memoryDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return memoryDb;
    } catch (e) {
        console.error("Error reading local db", e);
        return { cuentas: [], conciliaciones: {}, movimientos_manuales: [] };
    }
}

function writeLocalDb(data) {
    memoryDb = data;
    if (!pendingSave) {
        pendingSave = true;
        setImmediate(async () => {
            try {
                await fs.promises.writeFile(dbPath, JSON.stringify(memoryDb, null, 2), 'utf8');
            } catch (e) {
                console.error("Error async writing local db", e);
            }
            pendingSave = false;
        });
    }
}


// --- SISTEMA DE SESIÓN Y AUTENTICACIÓN ---
const SESSIONS = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password, salt) {
    if (!salt) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: "No autorizado. Token faltante." });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const session = SESSIONS.get(token);
    if (!session) {
        return res.status(401).json({ error: "Sesión inválida o expirada." });
    }
    req.user = session;
    next();
}

async function logActivity(req, accion, detalles) {
    try {
        const db = await readLocalDbAsync();
        if (!db.bitacora) db.bitacora = [];
        db.bitacora.push({
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            fecha: new Date().toISOString(),
            usuario: req.user ? req.user.username : 'sistema',
            nombreUsuario: req.user ? req.user.nombre : 'Sistema',
            accion,
            detalles
        });
        await writeLocalDbAsync(db);
    } catch (e) {
        console.error("Error logging activity", e);
    }
}

// API: Obtener bitácora de auditoría
app.get('/api/bitacora', authenticate, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: "Permiso denegado. Se requiere rol de administrador." });
    }
    const db = await readLocalDbAsync();
    res.json([...(db.bitacora || [])].reverse());
});

// API: Obtener lista de usuarios (sin contraseñas)
app.get('/api/usuarios', authenticate, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: "Permiso denegado." });
    }
    const db = await readLocalDbAsync();
    const publicUsers = (db.usuarios || []).map(u => ({
        username: u.username,
        rol: u.rol,
        nombre: u.nombre
    }));
    res.json(publicUsers);
});

// API: Crear o actualizar usuario
app.post('/api/usuarios', authenticate, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: "Permiso denegado." });
    }
    const { username, password, rol, nombre } = req.body;
    if (!username || !rol || !nombre) {
        return res.status(400).json({ error: "Usuario, rol y nombre son requeridos." });
    }
    const db = await readLocalDbAsync();
    if (!db.usuarios) db.usuarios = [];
    
    const existingIndex = db.usuarios.findIndex(u => u.username.toLowerCase() === username.toLowerCase().trim());
    
    if (existingIndex !== -1) {
        // Actualizar
        const u = db.usuarios[existingIndex];
        u.rol = rol;
        u.nombre = nombre.trim();
        if (password) {
            u.salt = crypto.randomBytes(16).toString('hex');
            u.passwordHash = hashPassword(password, u.salt);
        }
        logActivity(req, 'Modificación de Usuario', `Actualizó datos del usuario "${u.username}" (Rol: ${u.rol})`);
    } else {
        // Crear
        if (!password) {
            return res.status(400).json({ error: "La contraseña es requerida para nuevos usuarios." });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const nuevoUsuario = {
            username: username.toLowerCase().trim(),
            salt: salt,
            passwordHash: hashPassword(password, salt),
            rol,
            nombre: nombre.trim()
        };
        db.usuarios.push(nuevoUsuario);
        logActivity(req, 'Creación de Usuario', `Creó un nuevo usuario "${nuevoUsuario.username}" (Rol: ${nuevoUsuario.rol})`);
    }
    
    await writeLocalDbAsync(db);
    res.json({ success: true });
});

// API: Eliminar usuario
app.delete('/api/usuarios/:username', authenticate, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: "Permiso denegado." });
    }
    const targetUsername = req.params.username.toLowerCase().trim();
    if (req.user.username.toLowerCase() === targetUsername) {
        return res.status(400).json({ error: "No puedes eliminar tu propio usuario." });
    }
    
    const db = await readLocalDbAsync();
    if (!db.usuarios) db.usuarios = [];
    
    const index = db.usuarios.findIndex(u => u.username.toLowerCase() === targetUsername);
    if (index === -1) {
        return res.status(404).json({ error: "Usuario no encontrado." });
    }
    
    db.usuarios.splice(index, 1);
    await writeLocalDbAsync(db);
    logActivity(req, 'Eliminación de Usuario', `Eliminó el usuario "${targetUsername}"`);
    res.json({ success: true });
});

// Endpoint de login
app.post('/api/login',  async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Usuario y contraseña son requeridos." });
    }
    const db = await readLocalDbAsync();
    const user = (db.usuarios || []).find(u => u.username.toLowerCase() === username.toLowerCase().trim());
    if (!user) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    const hashed = hashPassword(password, user.salt);
    if (user.passwordHash !== hashed) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    
    // Migración transparente para usuarios antiguos sin salt
    if (!user.salt) {
        user.salt = crypto.randomBytes(16).toString('hex');
        user.passwordHash = hashPassword(password, user.salt);
        await writeLocalDbAsync(db);
    }
    
    const token = generateToken();
    const sessionData = {
        username: user.username,
        rol: user.rol,
        nombre: user.nombre
    };
    SESSIONS.set(token, sessionData);
    
    res.json({
        success: true,
        token,
        user: sessionData
    });
});

// Endpoint de datos del usuario actual
app.get('/api/me', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

// Middleware Global de Autorización para APIs
app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/login') {
        return next();
    }
    
    authenticate(req, res, (err) => {
        if (err) return; // authenticate ya envió la respuesta
        
        const isWrite = ['POST', 'PUT', 'DELETE'].includes(req.method);
        if (isWrite && req.user.rol === 'socio') {
            return res.status(403).json({ error: "Permiso denegado. Los socios tienen acceso de solo lectura." });
        }
        
        // Validar rutas exclusivas de administrador
        const isAdminRoute = 
            (req.method === 'DELETE' && req.path.startsWith('/api/movimientos-manuales/')) ||
            (req.method === 'PUT' && req.path.startsWith('/api/movimientos-manuales/')) ||
            (req.method === 'POST' && req.path.endsWith('/desconciliar')) ||
            (req.method === 'POST' && req.path === '/api/cuentas') ||
            (req.method === 'PUT' && req.path.startsWith('/api/cuentas/'));
            
        if (isAdminRoute && req.user.rol !== 'admin') {
            return res.status(403).json({ error: "Permiso denegado. Se requiere rol de administrador." });
        }
        
        next();
    });
});

// Función para sanitizar inputs SQL y evitar Inyección SQL
function sanitizeSql(input) {
    if (typeof input !== 'string') return input;
    // Escapar comillas simples y remover secuencias peligrosas
    return input.replace(/'/g, "''").replace(/--/g, "").replace(/;/g, "");
}

// Ejecutar consulta usando la herramienta de consola sqlcmd (que sabemos funciona al 100%)
function runSqlcmdQuery(query) {
    try {
        // Limpiar saltos de línea para evitar errores de parseo en la consola de Windows
        const cleanQuery = query.replace(/\r?\n|\r/g, ' ');
        // Envolver la consulta para devolver los resultados estructurados en formato JSON de SQL Server
        const wrappedQuery = `SET NOCOUNT ON; ${cleanQuery} FOR JSON PATH;`;
        
        // Ejecutar sqlcmd de forma síncrona
        const cmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -w 65535 -y 0 -Q "${wrappedQuery.replace(/"/g, '\\"')}"`;
        const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
        
        // Limpiar la salida de sqlcmd y parsear a JSON
        const cleaned = stdout.trim().replace(/\r\n/g, '').replace(/\n/g, '');
        if (!cleaned || cleaned.startsWith('Msg ') || cleaned === '') {
            return [];
        }
        return JSON.parse(cleaned);
    } catch (err) {
        console.error("Error executing sqlcmd query:", err.message);
        // Si FOR JSON PATH falla o no es compatible, intentamos obtener los resultados básicos sin formato JSON
        try {
            const basicCmd = `sqlcmd -S ".\\MYBUSINESSPOSV24" -d "MyBusiness2024" -E -s "," -W -Q "SET NOCOUNT ON; ${query}"`;
            const basicStdout = execSync(basicCmd, { encoding: 'utf-8' });
            const lines = basicStdout.trim().split('\n');
            if (lines.length <= 1) return [];
            
            const headers = lines[0].split(',').map(h => h.trim());
            const results = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '' || lines[i].includes('rows affected')) continue;
                const values = lines[i].split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((h, index) => {
                    obj[h] = values[index] || null;
                });
                results.push(obj);
            }
            return results;
        } catch (innerErr) {
            console.error("Fallback query method also failed:", innerErr.message);
            return [];
        }
    }
}

// API: Obtener cuentas y saldos
app.get('/api/cuentas',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.cuentas);
});

// API: Actualizar datos de una cuenta
app.put('/api/cuentas/:id',  async (req, res) => {
    const cuentaId = req.params.id;
    const { nombre, saldo, numeroCuenta, activa } = req.body;
    const db = await readLocalDbAsync();
    
    const cuenta = db.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) {
        return res.status(404).json({ error: "Cuenta no encontrada." });
    }
    
    if (nombre !== undefined) cuenta.nombre = nombre;
    if (saldo !== undefined) cuenta.saldo = parseFloat(saldo);
    if (numeroCuenta !== undefined) cuenta.numeroCuenta = numeroCuenta;
    if (activa !== undefined) cuenta.activa = activa === true || activa === 'true';
    
    await writeLocalDbAsync(db);
    logActivity(req, 'Modificación de Cuenta', `Modificó la cuenta "${cuenta.nombre}" (ID: ${cuentaId}). Saldo: $${cuenta.saldo}, Referencia: ${cuenta.numeroCuenta}, Activa: ${cuenta.activa}`);
    res.json({ success: true, db });
});

// API: Registrar una nueva cuenta
app.post('/api/cuentas',  async (req, res) => {
    const { nombre, saldo, numeroCuenta } = req.body;
    if (!nombre) {
        return res.status(400).json({ error: "El nombre de la cuenta es obligatorio." });
    }
    
    const db = await readLocalDbAsync();
    
    // Generar un ID único a partir del nombre
    const id = nombre.toLowerCase().trim().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    
    const nuevaCuenta = {
        id,
        nombre: nombre.trim(),
        saldo: parseFloat(saldo) || 0.0,
        numeroCuenta: (numeroCuenta || '').trim(),
        activa: true
    };
    
    db.cuentas.push(nuevaCuenta);
    await writeLocalDbAsync(db);
    logActivity(req, 'Creación de Cuenta', `Creó la cuenta "${nuevaCuenta.nombre}" con saldo inicial de $${nuevaCuenta.saldo}`);
    
    res.json({ success: true, db });
});

// API: Obtener movimientos manuales externos
app.get('/api/movimientos-manuales',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.movimientos_manuales || []);
});

// API: Registrar movimiento manual de egreso/ingreso/traspaso externo
app.post('/api/movimientos-manuales',  async (req, res) => {
    const { concepto, importe, tipo, cuentaId, cuentaOrigenId, cuentaDestinoId, fecha } = req.body;
    const db = await readLocalDbAsync();
    
    // Validar restricción de fecha para auxiliares en cuentas de efectivo
    if (req.user && req.user.rol !== 'admin') {
        const usesCash = (cuentaId === 'efectivo') || (cuentaOrigenId === 'efectivo') || (cuentaDestinoId === 'efectivo');
        if (usesCash && fecha) {
            const localDate = new Date();
            const offset = localDate.getTimezoneOffset();
            const serverLocalDateStr = new Date(localDate.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
            if (fecha < serverLocalDateStr) {
                return res.status(403).json({ error: "Permiso denegado. Los auxiliares no pueden registrar movimientos de efectivo con fechas pasadas." });
            }
        }
    }
    
    const nuevoMovimiento = {
        id: 'mov_' + Date.now(),
        concepto,
        importe: parseFloat(importe),
        tipo, // 'I' (Ingreso), 'E' (Egreso) o 'T' (Traspaso)
        fecha: fecha || new Date().toISOString().split('T')[0]
    };
    
    if (tipo === 'T') {
        const cuentaOrigen = db.cuentas.find(c => c.id === cuentaOrigenId);
        const cuentaDestino = db.cuentas.find(c => c.id === cuentaDestinoId);
        if (cuentaOrigen) cuentaOrigen.saldo -= nuevoMovimiento.importe;
        if (cuentaDestino) cuentaDestino.saldo += nuevoMovimiento.importe;
        
        nuevoMovimiento.cuentaOrigenId = cuentaOrigenId;
        nuevoMovimiento.cuentaDestinoId = cuentaDestinoId;
        if (!nuevoMovimiento.concepto) {
            nuevoMovimiento.concepto = `Traspaso de ${cuentaOrigen ? cuentaOrigen.nombre : cuentaOrigenId} a ${cuentaDestino ? cuentaDestino.nombre : cuentaDestinoId}`;
        }
    } else {
        nuevoMovimiento.cuentaId = cuentaId;
        const cuenta = db.cuentas.find(c => c.id === cuentaId);
        if (cuenta) {
            if (tipo === 'I') {
                cuenta.saldo += nuevoMovimiento.importe;
            } else {
                cuenta.saldo -= nuevoMovimiento.importe;
            }
        }
    }
    
    if (!db.movimientos_manuales) db.movimientos_manuales = [];
    db.movimientos_manuales.push(nuevoMovimiento);
    await writeLocalDbAsync(db);
    logActivity(req, 'Registro de Movimiento', `Registró movimiento manual "${nuevoMovimiento.concepto}" (${nuevoMovimiento.tipo === 'I' ? 'Ingreso' : nuevoMovimiento.tipo === 'E' ? 'Egreso' : 'Traspaso'}). Importe: $${nuevoMovimiento.importe}`);
    res.json({ success: true, db });
});

// API: Eliminar un movimiento manual externo (y revertir su saldo)
app.delete('/api/movimientos-manuales/:id',  async (req, res) => {
    const movId = req.params.id;
    const db = await readLocalDbAsync();
    
    if (!db.movimientos_manuales) {
        return res.status(404).json({ error: "Movimiento no encontrado" });
    }
    
    // Caso especial: Reparto de utilidad grupal (eliminar lote completo)
    if (movId.startsWith('mov_soc_rep_')) {
        const socMovId = movId.replace('mov_soc_', '');
        const targetMov = (db.movimientos_socios || []).find(s => s.id === socMovId);
        
        if (targetMov && targetMov.periodoAsociado) {
            const periodo = targetMov.periodoAsociado;
            
            // Buscar todos los movimientos de socios que pertenecen a este mismo periodo de reparto
            const relatedSocioMoves = (db.movimientos_socios || []).filter(s => s.periodoAsociado === periodo && s.tipoSocio === 'reparto_utilidad');
            
            relatedSocioMoves.forEach(sm => {
                // Revertir saldo de la cuenta
                const c = db.cuentas.find(cuenta => cuenta.id === sm.cuentaId);
                if (c) {
                    c.saldo += parseFloat(sm.importe);
                }
                
                // Eliminar de movimientos manuales
                db.movimientos_manuales = db.movimientos_manuales.filter(m => m.id !== `mov_soc_${sm.id}`);
            });
            
            // Eliminar de movimientos de socios
            db.movimientos_socios = db.movimientos_socios.filter(s => !(s.periodoAsociado === periodo && s.tipoSocio === 'reparto_utilidad'));
            
            await writeLocalDbAsync(db);
            logActivity(req, 'Eliminación Reparto Utilidad', `Eliminó el lote de reparto de utilidades para el periodo "${periodo}"`);
            return res.json({ success: true, db });
        }
    }
    
    const index = db.movimientos_manuales.findIndex(m => m.id === movId);
    if (index === -1) {
        return res.status(404).json({ error: "Movimiento no encontrado" });
    }
    
    const mov = db.movimientos_manuales[index];
    
    // Revertir efecto en los saldos de las cuentas
    if (mov.tipo === 'T') {
        const cOrig = db.cuentas.find(c => c.id === mov.cuentaOrigenId);
        const cDest = db.cuentas.find(c => c.id === mov.cuentaDestinoId);
        if (cOrig) cOrig.saldo += parseFloat(mov.importe);
        if (cDest) cDest.saldo -= parseFloat(mov.importe);
    } else {
        const c = db.cuentas.find(c => c.id === mov.cuentaId);
        if (c) {
            if (mov.tipo === 'I') {
                c.saldo -= parseFloat(mov.importe);
            } else {
                c.saldo += parseFloat(mov.importe);
            }
        }
    }
    
    // Sincronizar y limpiar otras colecciones si corresponde
    if (movId.startsWith('mov_com_')) {
        const parts = movId.split('_');
        const corteNum = parseInt(parts[2]);
        if (corteNum && db.comisiones_pagadas) {
            db.comisiones_pagadas = db.comisiones_pagadas.filter(c => c.corteAsociado !== corteNum);
        }
    } else if (movId.startsWith('mov_nom_')) {
        const nomId = movId.replace('mov_nom_', '');
        if (db.nominas) {
            db.nominas = db.nominas.filter(n => n.id !== nomId);
        }
    } else if (movId.startsWith('mov_soc_')) {
        const socMovId = movId.replace('mov_soc_', '');
        if (db.movimientos_socios) {
            db.movimientos_socios = db.movimientos_socios.filter(s => s.id !== socMovId);
        }
    }
    
    db.movimientos_manuales.splice(index, 1);
    await writeLocalDbAsync(db);
    logActivity(req, 'Eliminación de Movimiento', `Eliminó el movimiento manual "${mov.concepto}" (${mov.tipo === 'I' ? 'Ingreso' : mov.tipo === 'E' ? 'Egreso' : 'Traspaso'}). Importe: $${mov.importe}`);
    res.json({ success: true, db });
});

// API: Modificar un movimiento manual externo (y re-calcular sus saldos)
app.put('/api/movimientos-manuales/:id',  async (req, res) => {
    const movId = req.params.id;
    const { concepto, importe, tipo, cuentaId, cuentaOrigenId, cuentaDestinoId, fecha } = req.body;
    const db = await readLocalDbAsync();
    
    if (!db.movimientos_manuales) {
        return res.status(404).json({ error: "Movimiento no encontrado" });
    }
    
    const index = db.movimientos_manuales.findIndex(m => m.id === movId);
    if (index === -1) {
        return res.status(404).json({ error: "Movimiento no encontrado" });
    }
    
    const oldMov = db.movimientos_manuales[index];
    
    // Validar restricción de fecha para auxiliares en cuentas de efectivo
    if (req.user && req.user.rol !== 'admin') {
        const usesCash = (cuentaId === 'efectivo') || (cuentaOrigenId === 'efectivo') || (cuentaDestinoId === 'efectivo') ||
                         (oldMov.cuentaId === 'efectivo') || (oldMov.cuentaOrigenId === 'efectivo') || (oldMov.cuentaDestinoId === 'efectivo');
        if (usesCash && fecha) {
            const localDate = new Date();
            const offset = localDate.getTimezoneOffset();
            const serverLocalDateStr = new Date(localDate.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
            if (fecha < serverLocalDateStr) {
                return res.status(403).json({ error: "Permiso denegado. Los auxiliares no pueden asignar fechas pasadas a movimientos de efectivo." });
            }
        }
    }
    
    // 1. Revertir saldo anterior
    if (oldMov.tipo === 'T') {
        const cOrig = db.cuentas.find(c => c.id === oldMov.cuentaOrigenId);
        const cDest = db.cuentas.find(c => c.id === oldMov.cuentaDestinoId);
        if (cOrig) cOrig.saldo += parseFloat(oldMov.importe);
        if (cDest) cDest.saldo -= parseFloat(oldMov.importe);
    } else {
        const c = db.cuentas.find(c => c.id === oldMov.cuentaId);
        if (c) {
            if (oldMov.tipo === 'I') {
                c.saldo -= parseFloat(oldMov.importe);
            } else {
                c.saldo += parseFloat(oldMov.importe);
            }
        }
    }
    
    // 2. Aplicar nuevos saldos
    const newImporte = parseFloat(importe);
    const updatedMov = {
        id: movId,
        concepto,
        importe: newImporte,
        tipo,
        fecha: fecha || new Date().toISOString().split('T')[0]
    };
    
    if (tipo === 'T') {
        const cOrig = db.cuentas.find(c => c.id === cuentaOrigenId);
        const cDest = db.cuentas.find(c => c.id === cuentaDestinoId);
        if (cOrig) cOrig.saldo -= newImporte;
        if (cDest) cDest.saldo += newImporte;
        
        updatedMov.cuentaOrigenId = cuentaOrigenId;
        updatedMov.cuentaDestinoId = cuentaDestinoId;
    } else {
        updatedMov.cuentaId = cuentaId;
        const c = db.cuentas.find(c => c.id === cuentaId);
        if (c) {
            if (tipo === 'I') {
                c.saldo += newImporte;
            } else {
                c.saldo -= newImporte;
            }
        }
    }
    
    db.movimientos_manuales[index] = updatedMov;
    await writeLocalDbAsync(db);
    logActivity(req, 'Modificación de Movimiento', `Modificó el movimiento manual "${oldMov.concepto}" (${oldMov.tipo === 'I' ? 'Ingreso' : oldMov.tipo === 'E' ? 'Egreso' : 'Traspaso'}, $${oldMov.importe}) a "${updatedMov.concepto}" (${updatedMov.tipo === 'I' ? 'Ingreso' : updatedMov.tipo === 'E' ? 'Egreso' : 'Traspaso'}, $${updatedMov.importe})`);
    res.json({ success: true, db });
});

// API: Lista de Cortes Z
app.get('/api/cortes',  async (req, res) => {
    try {
        const query = `
            SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, cajero, CONVERT(varchar, usufecha, 126) as usufecha, usuhora, estacion
            FROM corteszx 
            WHERE corte = 'z'
            ORDER BY numeroCorte DESC
        `;
        const cortes = runSqlcmdQuery(query);
        
        const db = await readLocalDbAsync();
        const response = cortes.map(c => {
            const key = `${c.numeroCorte}_z`;
            const isAudited = (db.bitacora || []).some(log => 
                log.accion.includes(`#${c.numeroCorte}`) || 
                log.detalles.includes(`#${c.numeroCorte}`)
            );
            return {
                corte: c.corte,
                numeroCorte: parseInt(c.numeroCorte),
                totalVentas: parseFloat(c.totalVentas || 0),
                totalIngresos: parseFloat(c.totalIngresos || 0),
                totalEgresos: parseFloat(c.totalEgresos || 0),
                totalCaja: parseFloat(c.totalCaja || 0),
                cajero: c.cajero,
                usufecha: c.usufecha,
                usuhora: c.usuhora,
                estacion: c.estacion,
                conciliado: !!db.conciliaciones[key],
                datosConciliados: db.conciliaciones[key] || null,
                auditado: isAudited
            };
        });

        // Paginación
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const total = response.length;
        const totalConciliados = response.filter(c => c.conciliado).length;
        const totalPendientes = total - totalConciliados;
        const paginatedCortes = response.slice(startIndex, endIndex);

        res.json({
            total,
            totalConciliados,
            totalPendientes,
            page,
            limit,
            pages: Math.ceil(total / limit),
            cortes: paginatedCortes
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Detalle completo de un Corte Z (con cruces de comisiones, vendedores y utilidades)
// API: Detalle completo de un Corte Z (con cruces de comisiones, vendedores y utilidades)
app.get('/api/cortes/:numero',  async (req, res) => {
    const numeroCorte = parseInt(req.params.numero);
    try {
        const batchQuery = `
DECLARE @numeroCorte INT = ${numeroCorte};
DECLARE @estacion VARCHAR(50);
DECLARE @totalCaja FLOAT;
DECLARE @dateStr VARCHAR(10);

SELECT TOP 1 
    @estacion = estacion, 
    @totalCaja = totalCaja, 
    @dateStr = CONVERT(varchar, usufecha, 126) 
FROM corteszx 
WHERE numeroCorte = @numeroCorte AND corte = 'z';

DECLARE @flujoEnd INT;
DECLARE @flujoStart INT;

SELECT TOP 1 @flujoEnd = FLUJO 
FROM flujo 
WHERE CONCEPTO = 'CORTZ' 
  AND ESTACION = @estacion 
  AND IMPORTE = @totalCaja 
  AND CONVERT(varchar, FECHA, 126) LIKE @dateStr + '%' 
ORDER BY FLUJO DESC;

SELECT TOP 1 @flujoStart = FLUJO 
FROM flujo 
WHERE CONCEPTO = 'CORTZ' 
  AND ESTACION = @estacion 
  AND FLUJO < @flujoEnd 
ORDER BY FLUJO DESC;

SET @flujoStart = ISNULL(@flujoStart, 0);

WITH TargetFlujos AS (
    SELECT f.FLUJO, f.ING_EG, f.CONCEPTO, f.concepto2, f.IMPORTE, CONVERT(varchar, f.FECHA, 126) as FECHA, f.HORA, f.ESTACION, f.USUARIO, f.id_cobdet, ISNULL(c.DESCRIP, f.CONCEPTO) as DESCRIP
    FROM flujo f
    LEFT JOIN conegre c ON f.CONCEPTO = c.CONCEPTO
    WHERE f.FLUJO > @flujoStart AND f.FLUJO <= @flujoEnd AND f.ESTACION = @estacion
),
TargetCobdet AS (
    SELECT id AS id_cobdet, cobranza, Cargo_ab AS cargo_ab, CLIENTE AS cliente_id, venta AS direct_venta, importe AS importe_cobrado, TIPO_DOC AS forma_pago
    FROM cobdet 
    WHERE id IN (SELECT id_cobdet FROM TargetFlujos WHERE CONCEPTO = 'CLIEN' AND id_cobdet IS NOT NULL)
),
ResolvedCobdet AS (
    SELECT t.*, ISNULL(NULLIF(t.direct_venta, 0), c_orig.venta) AS venta_id
    FROM TargetCobdet t
    OUTER APPLY (
        SELECT TOP 1 c.venta FROM cobdet c WHERE c.COBRANZA = t.cobranza AND c.CLIENTE = t.cliente_id AND c.Cargo_ab = 'C'
    ) c_orig
),
VentasWithCosts AS (
    SELECT 
        r.id_cobdet,
        r.cobranza,
        r.cargo_ab,
        r.cliente_id,
        r.venta_id AS venta,
        r.importe_cobrado,
        r.forma_pago,
        cl.NOMBRE AS cliente_nombre,
        COALESCE(v.VEND, v_orig.VEND) AS vendedor,
        COALESCE(v.ESTACION, v_orig.ESTACION) AS estacion,
        COALESCE(NULLIF(RTRIM(v.NO_REFEREN), ''), NULLIF(RTRIM(v.TICKET), ''), NULLIF(RTRIM(v_orig.NO_REFEREN), ''), NULLIF(RTRIM(v_orig.TICKET), '')) AS ticket,
        COALESCE(v.IMPORTE, v_orig.IMPORTE) AS venta_total,
        ISNULL(pv.total_costo, 0) AS venta_costo
    FROM ResolvedCobdet r
    LEFT JOIN clients cl ON cl.CLIENTE = r.cliente_id
    LEFT JOIN ventas v ON v.VENTA = r.venta_id AND r.venta_id > 0
    OUTER APPLY (
        SELECT TOP 1 v2.VEND, v2.ESTACION, v2.NO_REFEREN, v2.TICKET, v2.IMPORTE 
        FROM ventas v2 WHERE v2.VENTA = r.venta_id
    ) v_orig
    OUTER APPLY (
        SELECT SUM(p.CANTIDAD * p.COSTO) AS total_costo
        FROM partvta p WHERE p.VENTA = r.venta_id
    ) pv
)
SELECT 
    (SELECT TOP 1 corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, cajero, CONVERT(varchar, usufecha, 126) as usufecha, usuhora, estacion, cadenaSalida FROM corteszx WHERE numeroCorte = @numeroCorte AND corte = 'z' FOR JSON PATH) AS corte_json,
    (SELECT * FROM TargetFlujos FOR JSON PATH) AS flujos_json,
    (SELECT * FROM VentasWithCosts FOR JSON PATH) AS cobros_json
        `;

        const sqlRes = runSqlcmdQuery(batchQuery);
        if (!sqlRes || sqlRes.length === 0 || !sqlRes[0].corte_json) {
            return res.status(404).json({ error: "Corte no encontrado" });
        }

        const rawCorte = sqlRes[0].corte_json[0];
        const corte = {
            corte: rawCorte.corte,
            numeroCorte: parseInt(rawCorte.numeroCorte),
            totalVentas: parseFloat(rawCorte.totalVentas || 0),
            totalIngresos: parseFloat(rawCorte.totalIngresos || 0),
            totalEgresos: parseFloat(rawCorte.totalEgresos || 0),
            totalCaja: parseFloat(rawCorte.totalCaja || 0),
            cajero: rawCorte.cajero,
            usufecha: rawCorte.usufecha,
            usuhora: rawCorte.usuhora,
            estacion: rawCorte.estacion,
            cadenaSalida: rawCorte.cadenaSalida
        };

        const flujos = (sqlRes[0].flujos_json || []).map(f => ({
            FLUJO: parseInt(f.FLUJO),
            ING_EG: f.ING_EG,
            CONCEPTO: f.CONCEPTO,
            IMPORTE: parseFloat(f.IMPORTE || 0),
            FECHA: f.FECHA,
            HORA: f.HORA,
            ESTACION: f.ESTACION,
            USUARIO: f.USUARIO,
            concepto2: f.concepto2,
            id_cobdet: f.id_cobdet ? parseInt(f.id_cobdet) : null,
            DESCRIP: f.DESCRIP ? f.DESCRIP.trim() : (f.CONCEPTO ? f.CONCEPTO.trim() : '')
        }));

        const cobros = (sqlRes[0].cobros_json || []).map(c => {
            const importeCobrado = parseFloat(c.importe_cobrado || 0);
            const ventaTotal = parseFloat(c.venta_total || 0);
            const ventaCosto = parseFloat(c.venta_costo || 0);

            return {
                id_cobdet: c.id_cobdet,
                cobranza: parseInt(c.cobranza || 0),
                venta: parseInt(c.venta || 0),
                importe_cobrado: importeCobrado,
                forma_pago: c.forma_pago ? c.forma_pago.trim() : 'EFE',
                vendedor: c.vendedor ? c.vendedor.trim() : 'SIN VENDEDOR',
                venta_total: ventaTotal > 0 ? ventaTotal : importeCobrado,
                venta_costo: ventaCosto,
                utilidad_venta: (ventaTotal > 0 ? ventaTotal : importeCobrado) - ventaCosto,
                es_abono: c.cargo_ab ? c.cargo_ab.trim() === 'A' : true,
                cliente_id: c.cliente_id ? c.cliente_id.trim() : 'SYS',
                cliente_nombre: c.cliente_nombre ? c.cliente_nombre.trim() : 'Público General',
                estacion: c.estacion ? c.estacion.trim() : 'CAJA GRAL',
                ticket: c.ticket ? parseInt(c.ticket) : (parseInt(c.venta) || 0)
            };
        });

        // Procesar totales y utilidades por vendedor a partir de la cobranza cobrada en el corte
        const vendedoresInfo = {};
        cobros.forEach(c => {
            const vend = c.vendedor ? c.vendedor.trim() : 'SIN VENDEDOR';
            if (!vendedoresInfo[vend]) {
                vendedoresInfo[vend] = {
                    vendedor: vend,
                    cobrado: 0,
                    costoProporcional: 0,
                    utilidadTeorica: 0
                };
            }
            
            const proporcionCobrada = c.venta_total > 0 ? (c.importe_cobrado / c.venta_total) : 1;
            const costoProporcional = c.venta_costo * proporcionCobrada;
            const utilidad = c.importe_cobrado - costoProporcional;

            vendedoresInfo[vend].cobrado += c.importe_cobrado;
            vendedoresInfo[vend].costoProporcional += costoProporcional;
            vendedoresInfo[vend].utilidadTeorica += utilidad;
        });

        // 4. Agregar estado de conciliación local
        const db = await readLocalDbAsync();
        const key = `${numeroCorte}_z`;
        const conciliado = !!db.conciliaciones[key];
        const datosConciliados = db.conciliaciones[key] || null;

        res.json({
            corte,
            flujos,
            cobros,
            vendedores: Object.values(vendedoresInfo),
            conciliado,
            datosConciliados
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Conciliar un Corte Z (soporta cuentas y deudas de vendedores)
app.post('/api/cortes/:numero/conciliar',  async (req, res) => {
    const numeroCorte = parseInt(req.params.numero);
    const dist = req.body.distribution || req.body.distribucion;
    
    if (!dist) {
        return res.status(400).json({ error: "Los datos de conciliación son obligatorios." });
    }
    
    const db = await readLocalDbAsync();
    const key = `${numeroCorte}_z`;
    
    if (db.conciliaciones[key]) {
        return res.status(400).json({ error: "Este corte ya ha sido conciliado anteriormente." });
    }

    db.conciliaciones[key] = {
        fechaConciliacion: new Date().toISOString(),
        distribucion: dist
    };

    if (!db.deudas_vendedores) db.deudas_vendedores = [];

    dist.forEach(d => {
        if (d.cuentaId) {
            const cuenta = db.cuentas.find(c => c.id === d.cuentaId);
            if (cuenta) {
                cuenta.saldo += parseFloat(d.importe);
            }
        } else if (d.vendedor) {
            // Registrar deuda de vendedor
            const nuevaDeuda = {
                id: 'deuda_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                numeroCorte,
                vendedor: d.vendedor,
                importe: parseFloat(d.importe),
                fecha: new Date().toISOString().split('T')[0],
                estado: 'pendiente'
            };
            db.deudas_vendedores.push(nuevaDeuda);
        }
    });

    await writeLocalDbAsync(db);
    logActivity(req, 'Conciliación de Corte', `Concilió el Corte Z #${numeroCorte}`);
    res.json({ success: true, db });
});

// API: Desconciliar un Corte Z
app.post('/api/cortes/:numero/desconciliar',  async (req, res) => {
    const numeroCorte = parseInt(req.params.numero);
    const db = await readLocalDbAsync();
    const key = `${numeroCorte}_z`;
    
    if (!db.conciliaciones[key]) {
        return res.status(400).json({ error: "Este corte no está conciliado." });
    }

    const { distribucion } = db.conciliaciones[key];

    // Revertir los cambios en las cuentas originados por la conciliación inicial
    distribucion.forEach(d => {
        if (d.cuentaId) {
            const cuenta = db.cuentas.find(c => c.id === d.cuentaId);
            if (cuenta) {
                cuenta.saldo = parseFloat((cuenta.saldo - parseFloat(d.importe)).toFixed(2));
            }
        }
    });

    // Revertir los abonos/pagos realizados a las deudas de este corte
    const deudasDelCorte = (db.deudas_vendedores || []).filter(d => d.numeroCorte === numeroCorte);
    deudasDelCorte.forEach(deuda => {
        if (deuda.abonos) {
            deuda.abonos.forEach(ab => {
                const cuentaAbono = db.cuentas.find(c => c.id === ab.cuentaId);
                if (cuentaAbono) {
                    cuentaAbono.saldo = parseFloat((cuentaAbono.saldo - ab.importe).toFixed(2));
                }
                if (db.movimientos_manuales) {
                    db.movimientos_manuales = db.movimientos_manuales.filter(m => m.id !== `mov_deuda_${ab.id}`);
                }
            });
        }
        // Compatibilidad con deudas liquidadas antes de la función de abonos
        if (deuda.estado === 'pagado' && (!deuda.abonos || deuda.abonos.length === 0) && deuda.cuentaPagoId) {
            const cuentaPago = db.cuentas.find(c => c.id === deuda.cuentaPagoId);
            if (cuentaPago) {
                cuentaPago.saldo = parseFloat((cuentaPago.saldo - deuda.importe).toFixed(2));
            }
        }
    });

    // Eliminar las deudas de vendedores creadas por este corte
    if (db.deudas_vendedores) {
        db.deudas_vendedores = db.deudas_vendedores.filter(d => d.numeroCorte !== numeroCorte);
    }

    // Borrar registro de conciliación
    delete db.conciliaciones[key];

    await writeLocalDbAsync(db);
    logActivity(req, 'Desconciliación de Corte', `Desconcilió el Corte Z #${numeroCorte}`);
    res.json({ success: true, db });
});

// API: Obtener deudas de vendedores
app.get('/api/deudas',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.deudas_vendedores || []);
});

// API: Pagar/Abonar una deuda de vendedor
app.post('/api/deudas/:id/pagar',  async (req, res) => {
    const deudaId = req.params.id;
    const { cuentaId, importePago } = req.body;
    const db = await readLocalDbAsync();
    
    if (!db.deudas_vendedores) {
        return res.status(404).json({ error: "Deuda no encontrada" });
    }
    
    const deuda = db.deudas_vendedores.find(d => d.id === deudaId);
    if (!deuda) {
        return res.status(404).json({ error: "Deuda no encontrada" });
    }
    
    if (deuda.estado === 'pagado') {
        return res.status(400).json({ error: "Esta deuda ya ha sido pagada." });
    }
    
    const cuenta = db.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) {
        return res.status(400).json({ error: "Cuenta destino no válida." });
    }
    
    const saldoActual = (deuda.saldo !== undefined) ? deuda.saldo : deuda.importe;
    
    // Si no se envía importePago, asumimos pago total para retrocompatibilidad
    const montoAPagar = (importePago !== undefined) ? parseFloat(importePago) : saldoActual;
    
    if (isNaN(montoAPagar) || montoAPagar <= 0) {
        return res.status(400).json({ error: "Monto de pago no válido." });
    }
    
    if (montoAPagar > saldoActual + 0.01) {
        return res.status(400).json({ error: "El importe del pago no puede exceder el saldo pendiente." });
    }
    
    // Incrementar saldo de la cuenta
    cuenta.saldo = parseFloat((cuenta.saldo + montoAPagar).toFixed(2));
    
    const abonoId = 'abono_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    // Registrar el abono en el historial de la deuda
    if (!deuda.abonos) deuda.abonos = [];
    deuda.abonos.push({
        id: abonoId,
        fecha: new Date().toISOString().split('T')[0],
        importe: montoAPagar,
        cuentaId: cuentaId
    });
    
    // Registrar un movimiento manual (Ingreso externo) para que aparezca en el historial y reportes
    if (!db.movimientos_manuales) db.movimientos_manuales = [];
    db.movimientos_manuales.push({
        id: `mov_deuda_${abonoId}`,
        concepto: `Abono de ${deuda.vendedor} a deuda (Corte Z #${deuda.numeroCorte})`,
        importe: montoAPagar,
        tipo: 'I', // Ingreso
        fecha: new Date().toISOString().split('T')[0],
        cuentaId: cuentaId
    });
    
    // Actualizar saldo restante de la deuda
    deuda.saldo = parseFloat((saldoActual - montoAPagar).toFixed(2));
    
    // Si el saldo llega a 0, marcar como pagado
    if (deuda.saldo <= 0.01) {
        deuda.estado = 'pagado';
        deuda.saldo = 0;
        deuda.fechaPago = new Date().toISOString().split('T')[0];
        deuda.cuentaPagoId = cuentaId;
    }
    
    await writeLocalDbAsync(db);
    logActivity(req, 'Pago de Deuda', `Registró pago de $${montoAPagar.toFixed(2)} a deuda de ${deuda.vendedor} (Corte Z #${deuda.numeroCorte})`);
    
    res.json({ success: true, db });
});

// API: Reporte Financiero Mensual / Por Rango de Fechas
app.get('/api/reporte-mensual',  async (req, res) => {
    try {
        const db = await readLocalDbAsync();
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        
        // Rango mensual predeterminado (del 1 de este mes al último día de este mes)
        const defaultStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const defaultEnd = new Date(y, m + 1, 0).toISOString().split('T')[0];
        
        const start = sanitizeSql(req.query.start || defaultStart);
        const end = sanitizeSql(req.query.end || defaultEnd);
        const cortesFilter = req.query.cortesFilter || 'conciliados'; // 'conciliados' o 'todos'
        
        console.log(`GET /api/reporte-mensual -> start: ${start}, end: ${end}, filter: ${cortesFilter}`);
        
        // 1. Movimientos manuales en el rango
        let manualIngresos = 0;
        let manualEgresos = 0;
        const currentManualMoves = (db.movimientos_manuales || []).filter(m => m.fecha >= start && m.fecha <= end);
        currentManualMoves.forEach(m => {
            if (m.tipo === 'I') manualIngresos += m.importe;
            else if (m.tipo === 'E') manualEgresos += m.importe;
        });

        // 2. Cortes en el rango (usando CONVERT 23 para obtener formato YYYY-MM-DD en SQL Server)
        const query = `
            SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, CONVERT(varchar, usufecha, 23) as usufecha, usuhora, estacion
            FROM corteszx 
            WHERE corte = 'z' 
              AND CONVERT(varchar, usufecha, 23) >= '${start}'
              AND CONVERT(varchar, usufecha, 23) <= '${end}'
        `;
        let dbQueryError = null;
        let cutsInRange = [];
        try {
            cutsInRange = runSqlcmdQuery(query);
        } catch (err) {
            dbQueryError = err.message;
        }
        
        let cutsIngresos = 0;
        let cutsEgresos = 0;
        let cutsCostoTotal = 0;
        
        const cortesDetalle = [];
        const mediosPago = { 'EFE': 0, 'TRA': 0, 'TAR': 0, 'VAL': 0, 'CHE': 0 };
        const egresosDetalleMap = {};
        
        cutsInRange.forEach(c => {
            const key = `${c.numeroCorte}_z`;
            const conciliado = !!db.conciliaciones[key];
            
            let realCorteEgresos = 0;
            let realCorteIngresos = 0;
            const cobdetIds = [];
            
            // 1. Encontrar el flujo CORTZ correspondiente al corte
            const findEndQuery = `
                SELECT TOP 1 FLUJO 
                FROM flujo 
                WHERE CONCEPTO = 'CORTZ' 
                  AND ESTACION = '${c.estacion}'
                  AND IMPORTE = ${c.totalCaja}
                  AND CONVERT(varchar, FECHA, 23) = '${c.usufecha}'
                ORDER BY FLUJO DESC
            `;
            const endResult = runSqlcmdQuery(findEndQuery);
            
            if (endResult.length > 0) {
                const flujoEnd = parseInt(endResult[0].FLUJO);
                
                const findStartQuery = `
                    SELECT TOP 1 FLUJO 
                    FROM flujo 
                    WHERE CONCEPTO = 'CORTZ' 
                      AND ESTACION = '${c.estacion}'
                      AND FLUJO < ${flujoEnd}
                    ORDER BY FLUJO DESC
                `;
                const startResult = runSqlcmdQuery(findStartQuery);
                const flujoStart = startResult.length > 0 ? parseInt(startResult[0].FLUJO) : 0;
                
                // 2. Obtener los flujos de este corte con descripciones
                const getFlujosQuery = `
                    SELECT f.FLUJO, f.ING_EG, f.CONCEPTO, f.concepto2, f.IMPORTE, f.id_cobdet, ISNULL(con.DESCRIP, f.CONCEPTO) as DESCRIP
                    FROM flujo f
                    LEFT JOIN conegre con ON RTRIM(LTRIM(f.CONCEPTO)) = RTRIM(LTRIM(con.CONCEPTO))
                    WHERE f.FLUJO > ${flujoStart} AND f.FLUJO <= ${flujoEnd} AND f.ESTACION = '${c.estacion}'
                `;
                const flujos = runSqlcmdQuery(getFlujosQuery);
                
                // Procesar flujos de caja de este corte
                flujos.forEach(f => {
                    const importeVal = parseFloat(f.IMPORTE || 0);
                    
                    if (f.ING_EG === 'E' && f.CONCEPTO.trim() !== 'CORTZ') {
                        realCorteEgresos += importeVal;
                        
                        // Agrupar egresos por concepto
                        const desc = f.DESCRIP ? f.DESCRIP.trim() : f.CONCEPTO.trim();
                        egresosDetalleMap[desc] = (egresosDetalleMap[desc] || 0) + importeVal;
                    } 
                    else if (f.ING_EG === 'I') {
                        realCorteIngresos += importeVal;
                        
                        // Acumular medios de pago en cortes (si es conciliado o si es filtro 'todos')
                        if (conciliado || cortesFilter === 'todos') {
                            const medio = f.concepto2 ? f.concepto2.trim() : 'EFE';
                            mediosPago[medio] = (mediosPago[medio] || 0) + importeVal;
                        }
                        
                        // Acumular IDs de cobdet para calcular costo
                        if (f.CONCEPTO.trim() === 'CLIEN' && f.id_cobdet) {
                            cobdetIds.push(parseInt(f.id_cobdet));
                        }
                    }
                });
            }
            
            // Calcular costos de este corte
            let corteCosto = 0;
            if (cobdetIds.length > 0) {
                const cobrosQuery = `
                    WITH TargetCobdet AS (
                        SELECT id AS id_cobdet, cobranza, Cargo_ab AS cargo_ab, CLIENTE AS cliente_id, venta AS direct_venta, importe AS importe_cobrado
                        FROM cobdet WHERE id IN (${cobdetIds.join(',')})
                    ),
                    ResolvedCobdet AS (
                        SELECT t.*, ISNULL(NULLIF(t.direct_venta, 0), c_orig.venta) AS venta_id
                        FROM TargetCobdet t
                        OUTER APPLY (
                            SELECT TOP 1 c.venta FROM cobdet c WHERE c.COBRANZA = t.cobranza AND c.CLIENTE = t.cliente_id AND c.Cargo_ab = 'C'
                        ) c_orig
                    ),
                    VentasWithCosts AS (
                        SELECT 
                            r.importe_cobrado,
                            COALESCE(v.IMPORTE, v_orig.IMPORTE) AS venta_total,
                            ISNULL(pv.total_costo, 0) AS venta_costo
                        FROM ResolvedCobdet r
                        LEFT JOIN ventas v ON v.VENTA = r.venta_id AND r.venta_id > 0
                        OUTER APPLY (
                            SELECT TOP 1 v2.IMPORTE FROM ventas v2 WHERE v2.VENTA = r.venta_id
                        ) v_orig
                        OUTER APPLY (
                            SELECT SUM(p.CANTIDAD * p.COSTO) AS total_costo
                            FROM partvta p WHERE p.VENTA = r.venta_id
                        ) pv
                    )
                    SELECT * FROM VentasWithCosts
                `;
                try {
                    const rawCobros = runSqlcmdQuery(cobrosQuery);
                    rawCobros.forEach(rc => {
                        const imp = parseFloat(rc.importe_cobrado || 0);
                        const tot = parseFloat(rc.venta_total || 0);
                        const cos = parseFloat(rc.venta_costo || 0);
                        const proporcion = tot > 0 ? (imp / tot) : 1;
                        corteCosto += cos * proporcion;
                    });
                } catch (e) {
                    console.error(`Error calculando costo para corte ${c.numeroCorte}:`, e.message);
                }
            }
            
            let ingresoEfectivoReportado = realCorteIngresos;
            if (conciliado) {
                // Si está conciliado, tomamos la distribución real ingresada a bancos/efectivo
                let ingresosConciliados = 0;
                const dist = db.conciliaciones[key].distribucion || [];
                dist.forEach(d => {
                    if (d.cuentaId || d.vendedor) {
                        ingresosConciliados += parseFloat(d.importe || 0);
                    }
                });
                
                cutsIngresos += ingresosConciliados;
                cutsEgresos += realCorteEgresos;
                cutsCostoTotal += corteCosto;
                
                cortesDetalle.push({
                    corte: c.numeroCorte,
                    fecha: c.usufecha,
                    estacion: c.estacion,
                    ingresos: ingresosConciliados,
                    egresos: realCorteEgresos,
                    costo: corteCosto,
                    utilidadBruta: ingresosConciliados - corteCosto,
                    utilidadNeta: (ingresosConciliados - corteCosto) - realCorteEgresos,
                    conciliado: true
                });
            } else {
                if (cortesFilter === 'todos') {
                    cutsIngresos += parseFloat(c.totalIngresos || 0);
                    cutsEgresos += realCorteEgresos;
                    cutsCostoTotal += corteCosto;
                    
                    cortesDetalle.push({
                        corte: c.numeroCorte,
                        fecha: c.usufecha,
                        estacion: c.estacion,
                        ingresos: parseFloat(c.totalIngresos || 0),
                        egresos: realCorteEgresos,
                        costo: corteCosto,
                        utilidadBruta: parseFloat(c.totalIngresos || 0) - corteCosto,
                        utilidadNeta: (parseFloat(c.totalIngresos || 0) - corteCosto) - realCorteEgresos,
                        conciliado: false
                    });
                }
            }
        });

        // 3. Procesar egresos manuales externos para el desglose detallado
        currentManualMoves.forEach(m => {
            if (m.tipo === 'E') {
                const desc = m.concepto ? m.concepto.trim() : 'Gasto Manual Externo';
                egresosDetalleMap[desc] = (egresosDetalleMap[desc] || 0) + m.importe;
            }
        });

        const totalIngresos = manualIngresos + cutsIngresos;
        const totalEgresos = manualEgresos + cutsEgresos;
        const totalCosto = cutsCostoTotal;
        const utilidadBruta = totalIngresos - totalCosto;
        const utilidadNeta = utilidadBruta - totalEgresos;

        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const monthName = `${months[now.getMonth()]} ${now.getFullYear()}`;

        res.json({
            monthName,
            start,
            end,
            manualIngresos,
            manualEgresos,
            cutsIngresos,
            cutsEgresos,
            totalIngresos,
            totalEgresos,
            totalCosto,
            utilidadBruta,
            utilidadNeta,
            cortesDetalle,
            mediosPago,
            egresosDetalle: Object.entries(egresosDetalleMap).map(([concepto, importe]) => ({ concepto, importe })),
            debug: {
                cutsLength: cutsInRange.length,
                dbQueryError,
                cortesFilter
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Historial Unificado de Operaciones (MyBusiness + Externos)
app.get('/api/historial-operaciones',  async (req, res) => {
    try {
        const db = await readLocalDbAsync();
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        
        const defaultStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const defaultEnd = new Date(y, m + 1, 0).toISOString().split('T')[0];
        
        const start = sanitizeSql(req.query.start || defaultStart);
        const end = sanitizeSql(req.query.end || defaultEnd);
        const typeFilter = req.query.type || 'all'; // 'all', 'ingreso', 'egreso', 'traspaso'
        const sourceFilter = req.query.source || 'all'; // 'all', 'mybusiness', 'externo'

        const operations = [];

        // 1. Agregar Movimientos Manuales (Externos)
        if (sourceFilter === 'all' || sourceFilter === 'externo') {
            const manualMoves = db.movimientos_manuales || [];
            manualMoves.forEach(m => {
                if (m.fecha >= start && m.fecha <= end) {
                    let typeLabel = m.tipo === 'I' ? 'ingreso' : (m.tipo === 'E' ? 'egreso' : (m.tipo === 'S' ? 'socio' : 'traspaso'));
                    
                    // Filtrar por tipo si aplica
                    if (typeFilter !== 'all' && typeFilter !== typeLabel) return;
                    
                    let cuentaInfo = '';
                    if (m.tipo === 'T') {
                        const cOrig = db.cuentas.find(c => c.id === m.cuentaOrigenId);
                        const cDest = db.cuentas.find(c => c.id === m.cuentaDestinoId);
                        cuentaInfo = `${cOrig ? cOrig.nombre : m.cuentaOrigenId} ➔ ${cDest ? cDest.nombre : m.cuentaDestinoId}`;
                    } else {
                        const c = db.cuentas.find(c => c.id === m.cuentaId);
                        cuentaInfo = c ? c.nombre : (m.cuentaId || '');
                    }

                    operations.push({
                        id: m.id,
                        fecha: m.fecha,
                        origen: m.tipo === 'S' ? 'Socios & Capital' : 'Externo',
                        tipo: typeLabel,
                        tipoOriginal: m.tipo,
                        concepto: m.concepto || (m.tipo === 'T' ? 'Traspaso' : m.tipo === 'I' ? 'Ingreso' : 'Egreso'),
                        referencia: cuentaInfo,
                        importe: m.importe,
                        cuentaId: m.cuentaId || '',
                        cuentaOrigenId: m.cuentaOrigenId || '',
                        cuentaDestinoId: m.cuentaDestinoId || ''
                    });
                }
            });
        }

        // 2. Agregar Movimientos de MyBusiness POS (Conciliados)
        if (sourceFilter === 'all' || sourceFilter === 'mybusiness') {
            const queryCortes = `
                SELECT corte, numeroCorte, totalVentas, totalIngresos, totalEgresos, totalCaja, CONVERT(varchar, usufecha, 23) as usufecha, usuhora, estacion
                FROM corteszx 
                WHERE corte = 'z' 
                  AND CONVERT(varchar, usufecha, 23) >= '${start}'
                  AND CONVERT(varchar, usufecha, 23) <= '${end}'
            `;
            const cutsInRange = runSqlcmdQuery(queryCortes);
            
            const flowsQuery = `
                SELECT f.FLUJO, f.ING_EG, f.CONCEPTO, f.IMPORTE, f.ESTACION, CONVERT(varchar, f.FECHA, 23) as FECHA, ISNULL(con.DESCRIP, f.CONCEPTO) as DESCRIP
                FROM flujo f
                LEFT JOIN conegre con ON RTRIM(LTRIM(f.CONCEPTO)) = RTRIM(LTRIM(con.CONCEPTO))
                WHERE CONVERT(varchar, f.FECHA, 23) >= '${start}' AND CONVERT(varchar, f.FECHA, 23) <= '${end}'
            `;
            const allFlows = runSqlcmdQuery(flowsQuery);

            const flowsByStation = {};
            allFlows.forEach(f => {
                if (!flowsByStation[f.ESTACION]) flowsByStation[f.ESTACION] = [];
                flowsByStation[f.ESTACION].push(f);
            });

            cutsInRange.forEach(c => {
                const key = `${c.numeroCorte}_z`;
                const conciliacion = db.conciliaciones[key];
                
                // Calcular egresos del cajón (aplica para conciliados y pendientes)
                const stationFlows = flowsByStation[c.estacion] || [];
                const endFlowIndex = stationFlows.findIndex(f => 
                    f.CONCEPTO.trim() === 'CORTZ' && 
                    parseFloat(f.IMPORTE) === parseFloat(c.totalCaja) &&
                    f.FECHA === c.usufecha
                );
                
                let realCorteEgresos = 0;
                let corteEgresosList = [];
                if (endFlowIndex !== -1) {
                    const flujoEnd = parseInt(stationFlows[endFlowIndex].FLUJO);
                    let flujoStart = 0;
                    for (let i = endFlowIndex - 1; i >= 0; i--) {
                        if (stationFlows[i].CONCEPTO.trim() === 'CORTZ') {
                            flujoStart = parseInt(stationFlows[i].FLUJO);
                            break;
                        }
                    }
                    
                    stationFlows.forEach((f, idx) => {
                        const idFlujo = parseInt(f.FLUJO);
                        if (idFlujo > flujoStart && idFlujo <= flujoEnd && f.ING_EG === 'E' && f.CONCEPTO.trim() !== 'CORTZ') {
                            const conceptsLabels = {
                                COM: 'Pago de Comisión',
                                RECO: 'Retiro de Caja',
                                VAR: 'Gasto Varios',
                                CAJA: 'Ajuste de Caja',
                                CUP: 'Pago con Cupón/Vale',
                                DEV: 'Devolución de Venta',
                                NOM: 'Pago de Nómina',
                                VIA: 'Viáticos'
                            };
                            const conc = f.DESCRIP ? f.DESCRIP.trim() : (conceptsLabels[f.CONCEPTO.trim()] || f.CONCEPTO.trim());
                            realCorteEgresos += parseFloat(f.IMPORTE || 0);

                            corteEgresosList.push({
                                id: `mb_out_${c.numeroCorte}_${idx}`,
                                fecha: f.FECHA,
                                origen: `Corte Z #${c.numeroCorte}${conciliacion ? '' : ' (Pendiente)'}`,
                                tipo: 'egreso',
                                concepto: conc,
                                referencia: 'Caja POS',
                                importe: parseFloat(f.IMPORTE || 0)
                            });
                        }
                    });
                }

                if (conciliacion) {
                    // A. Ingresos Conciliados
                    if (typeFilter === 'all' || typeFilter === 'ingreso') {
                        const dist = conciliacion.distribucion || [];
                        dist.forEach((d, idx) => {
                            let ref = '';
                            if (d.cuentaId) {
                                const acc = db.cuentas.find(a => a.id === d.cuentaId);
                                ref = acc ? acc.nombre : d.cuentaId;
                            } else if (d.vendedor) {
                                ref = `Deuda: ${d.vendedor}`;
                            }
                            
                            const paymentTypeLabels = {
                                EFE: 'Efectivo',
                                TRA: 'Transferencia',
                                TAR: 'Tarjeta General',
                                DEB: 'Tarjeta de Débito',
                                CRE: 'Tarjeta de Crédito',
                                CHM: 'Cheque/Otro'
                            };
                            const met = paymentTypeLabels[d.tipoPago] || d.tipoPago || 'Efectivo';

                            operations.push({
                                id: `mb_in_${c.numeroCorte}_${idx}`,
                                fecha: c.usufecha,
                                origen: `Corte Z #${c.numeroCorte}`,
                                tipo: 'ingreso',
                                concepto: `Cobro Conciliado (${met})`,
                                referencia: ref,
                                importe: parseFloat(d.importe || 0),
                                cuentaId: d.cuentaId || ''
                            });
                        });
                    }

                    // B. Egresos del Corte Conciliado
                    if (typeFilter === 'all' || typeFilter === 'egreso') {
                        operations.push(...corteEgresosList);
                    }
                } else {
                    // Corte Pendiente
                    // A. Ingreso Teórico
                    if (typeFilter === 'all' || typeFilter === 'ingreso') {
                        operations.push({
                            id: `mb_in_pend_${c.numeroCorte}`,
                            fecha: c.usufecha,
                            origen: `Corte Z #${c.numeroCorte} (Pendiente)`,
                            tipo: 'ingreso',
                            concepto: 'Ingreso Teórico Ventas (Sin Conciliar)',
                            referencia: 'Caja POS',
                            importe: parseFloat(c.totalIngresos || 0)
                        });
                    }

                    // B. Egresos del Corte Pendiente
                    if (typeFilter === 'all' || typeFilter === 'egreso') {
                        operations.push(...corteEgresosList);
                    }
                }
            });
        }

        // Ordenar operaciones por fecha DESC
        operations.sort((a, b) => b.fecha.localeCompare(a.fecha));

        res.json({
            start,
            end,
            typeFilter,
            sourceFilter,
            operations
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Listar Vendedores Activos desde MyBusiness POS
app.get('/api/vendedores',  async (req, res) => {
    try {
        const query = `
            SELECT LTRIM(RTRIM(Vend)) as Vend, LTRIM(RTRIM(Nombre)) as Nombre 
            FROM vends 
            WHERE Activo = 1 OR Activo IS NULL
        `;
        const vendedores = runSqlcmdQuery(query);
        res.json(vendedores);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Listar Nóminas
app.get('/api/nominas',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.nominas || []);
});

// API: Registrar Pago de Nómina
app.post('/api/nominas',  async (req, res) => {
    const { empleado, periodoInicio, periodoFin, importe, cuentaId, fechaPago } = req.body;
    const db = await readLocalDbAsync();
    
    const impVal = parseFloat(importe) || 0;
    const cuenta = db.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) {
        return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    
    // Descontar saldo
    cuenta.saldo -= impVal;
    
    const id = 'nom_' + Date.now();
    const nuevaNomina = {
        id,
        empleado: empleado.trim(),
        periodoInicio,
        periodoFin,
        importe: impVal,
        cuentaId,
        fechaPago: fechaPago || new Date().toISOString().split('T')[0]
    };
    
    if (!db.nominas) db.nominas = [];
    db.nominas.push(nuevaNomina);
    
    // Insertar como egreso operativo
    const nuevoMovimiento = {
        id: 'mov_nom_' + id,
        concepto: `Nómina: ${empleado.trim()} (${periodoInicio} al ${periodoFin})`,
        importe: impVal,
        tipo: 'E',
        cuentaId,
        fecha: fechaPago || new Date().toISOString().split('T')[0]
    };
    if (!db.movimientos_manuales) db.movimientos_manuales = [];
    db.movimientos_manuales.push(nuevoMovimiento);
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Liquidar Comisiones de Vendedores de un Corte
app.post('/api/cortes/:numero/liquidar-comisiones',  async (req, res) => {
    const numeroCorte = parseInt(req.params.numero);
    const { comisiones } = req.body; // Array de { cobrador, beneficiario, porcentaje, base, comision, cuentaId }
    const db = await readLocalDbAsync();
    
    if (!db.comisiones_pagadas) db.comisiones_pagadas = [];
    
    let totalCorteComisiones = 0;
    let mainCuentaId = null;
    
    comisiones.forEach(c => {
        const impCom = parseFloat(c.comision) || 0;
        if (impCom <= 0) return;
        
        const cuenta = db.cuentas.find(acc => acc.id === c.cuentaId);
        if (cuenta) {
            cuenta.saldo -= impCom;
        }
        
        totalCorteComisiones += impCom;
        if (!mainCuentaId) mainCuentaId = c.cuentaId;
        
        db.comisiones_pagadas.push({
            id: 'com_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            corteAsociado: numeroCorte,
            vendedorCobrador: c.cobrador,
            vendedorBeneficiario: c.beneficiario,
            montoBaseCobrado: parseFloat(c.base),
            porcentajeAplicado: parseFloat(c.porcentaje),
            importeComision: impCom,
            cuentaId: c.cuentaId,
            fechaPago: new Date().toISOString().split('T')[0]
        });
    });
    
    if (totalCorteComisiones > 0) {
        // Registrar egreso operativo de comisiones
        const nuevoMovimiento = {
            id: 'mov_com_' + numeroCorte + '_' + Date.now(),
            concepto: `Comisiones Liquidadas de Corte Z #${numeroCorte}`,
            importe: totalCorteComisiones,
            tipo: 'E',
            cuentaId: mainCuentaId || 'efectivo',
            fecha: new Date().toISOString().split('T')[0]
        };
        if (!db.movimientos_manuales) db.movimientos_manuales = [];
        db.movimientos_manuales.push(nuevoMovimiento);
    }
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Obtener Socios
app.get('/api/socios',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.socios || []);
});

// API: Registrar/Modificar Socio
app.post('/api/socios',  async (req, res) => {
    const { id, nombre, porcentaje } = req.body;
    const db = await readLocalDbAsync();
    
    if (!db.socios) db.socios = [];
    
    if (id) {
        // Editar
        const index = db.socios.findIndex(s => s.id === id);
        if (index !== -1) {
            db.socios[index].nombre = nombre.trim();
            db.socios[index].porcentaje = parseFloat(porcentaje) || 0;
        }
    } else {
        // Nuevo
        db.socios.push({
            id: 'soc_' + Date.now(),
            nombre: nombre.trim(),
            porcentaje: parseFloat(porcentaje) || 0
        });
    }
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Eliminar Socio
app.delete('/api/socios/:id',  async (req, res) => {
    const socioId = req.params.id;
    const db = await readLocalDbAsync();
    
    if (!db.socios) db.socios = [];
    
    const index = db.socios.findIndex(s => s.id === socioId);
    if (index === -1) {
        return res.status(404).json({ error: "Socio no encontrado." });
    }
    
    db.socios.splice(index, 1);
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Obtener Movimientos de Socios (Capital/Repartos)
app.get('/api/socios/movimientos',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.movimientos_socios || []);
});

// API: Repartir Utilidades
app.post('/api/socios/repartir',  async (req, res) => {
    const { repartos, periodoAsociado, utilidadPeriodo } = req.body; // Array de { socioId, socioNombre, importe, cuentaId }
    const db = await readLocalDbAsync();
    
    if (!db.movimientos_socios) db.movimientos_socios = [];
    
    repartos.forEach(r => {
        const impVal = parseFloat(r.importe) || 0;
        if (impVal <= 0) return;
        
        const cuenta = db.cuentas.find(c => c.id === r.cuentaId);
        if (cuenta) {
            cuenta.saldo -= impVal;
        }
        
        const id = 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        db.movimientos_socios.push({
            id,
            tipoSocio: 'reparto_utilidad',
            socioId: r.socioId,
            socioNombre: r.socioNombre,
            importe: impVal,
            cuentaId: r.cuentaId,
            fecha: new Date().toISOString().split('T')[0],
            comentarios: `Reparto de Utilidades (${periodoAsociado})`,
            periodoAsociado,
            utilidadPeriodo: parseFloat(utilidadPeriodo) || 0
        });
        
        // Crear movimiento tipo 'S' (Salida de capital - no reduce utilidad operativa)
        if (!db.movimientos_manuales) db.movimientos_manuales = [];
        db.movimientos_manuales.push({
            id: 'mov_soc_' + id,
            concepto: `Reparto de Utilidades: ${r.socioNombre} (${periodoAsociado})`,
            importe: impVal,
            tipo: 'S', // Tipo Especial Socios/Capital
            cuentaId: r.cuentaId,
            fecha: new Date().toISOString().split('T')[0]
        });
    });
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Registrar Retiro Libre de Socio
app.post('/api/socios/retiro',  async (req, res) => {
    const { socioId, socioNombre, importe, cuentaId, comentarios } = req.body;
    const db = await readLocalDbAsync();
    
    const impVal = parseFloat(importe) || 0;
    const cuenta = db.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) {
        return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    
    cuenta.saldo -= impVal;
    
    const id = 'ret_' + Date.now();
    if (!db.movimientos_socios) db.movimientos_socios = [];
    db.movimientos_socios.push({
        id,
        tipoSocio: 'retiro_libre',
        socioId,
        socioNombre,
        importe: impVal,
        cuentaId,
        fecha: new Date().toISOString().split('T')[0],
        comentarios: comentarios ? comentarios.trim() : 'Retiro Directo de Socio'
    });
    
    // Crear movimiento tipo 'S' (Salida de capital)
    if (!db.movimientos_manuales) db.movimientos_manuales = [];
    db.movimientos_manuales.push({
        id: 'mov_soc_' + id,
        concepto: `Retiro de Socio: ${socioNombre} - ${comentarios ? comentarios.trim() : 'Retiro Directo'}`,
        importe: impVal,
        tipo: 'S', // Capital
        cuentaId,
        fecha: new Date().toISOString().split('T')[0]
    });
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Obtener Cuentas por Pagar
app.get('/api/cuentas-por-pagar',  async (req, res) => {
    const db = await readLocalDbAsync();
    res.json(db.cuentas_por_pagar || []);
});

// API: Registrar una nueva Cuenta por Pagar (Crédito, Préstamo, etc.)
app.post('/api/cuentas-por-pagar',  async (req, res) => {
    const { acreedor, concepto, importe, fecha } = req.body;
    if (!acreedor || !importe) {
        return res.status(400).json({ error: "El acreedor y el importe son obligatorios." });
    }
    
    const db = await readLocalDbAsync();
    const nuevaCXP = {
        id: 'cxp_' + Date.now(),
        acreedor: acreedor.trim(),
        concepto: (concepto || '').trim(),
        importe: parseFloat(importe) || 0,
        fecha: fecha || new Date().toISOString().split('T')[0],
        estado: 'pendiente'
    };
    
    if (!db.cuentas_por_pagar) db.cuentas_por_pagar = [];
    db.cuentas_por_pagar.push(nuevaCXP);
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

// API: Pagar una Cuenta por Pagar
app.post('/api/cuentas-por-pagar/:id/pagar',  async (req, res) => {
    const cxpId = req.params.id;
    const { cuentaId } = req.body;
    const db = await readLocalDbAsync();
    
    if (!db.cuentas_por_pagar) {
        return res.status(404).json({ error: "Cuenta por pagar no encontrada" });
    }
    
    const cxp = db.cuentas_por_pagar.find(c => c.id === cxpId);
    if (!cxp) {
        return res.status(404).json({ error: "Cuenta por pagar no encontrada" });
    }
    
    if (cxp.estado === 'pagado') {
        return res.status(400).json({ error: "Esta cuenta ya ha sido pagada." });
    }
    
    const cuenta = db.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) {
        return res.status(400).json({ error: "Cuenta de origen no válida." });
    }
    
    // Descontar saldo de la cuenta
    cuenta.saldo -= cxp.importe;
    cxp.estado = 'pagado';
    cxp.fechaPago = new Date().toISOString().split('T')[0];
    cxp.cuentaPagoId = cuentaId;
    
    // Registrar un egreso en los movimientos manuales para que aparezca en el historial
    const nuevoMovimiento = {
        id: 'mov_cxp_' + cxp.id,
        concepto: `Pago a Acreedor: ${cxp.acreedor} (${cxp.concepto || 'Sin concepto'})`,
        importe: cxp.importe,
        tipo: 'E',
        cuentaId,
        fecha: new Date().toISOString().split('T')[0]
    };
    
    if (!db.movimientos_manuales) db.movimientos_manuales = [];
    db.movimientos_manuales.push(nuevoMovimiento);
    
    await writeLocalDbAsync(db);
    res.json({ success: true, db });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
