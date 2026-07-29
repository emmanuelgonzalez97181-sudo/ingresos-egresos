// Función de sanitización para prevenir XSS
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// INTERCEPTOR FETCH PARA AUTENTICACIÓN
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    if (url.startsWith('/api/') && !url.includes('/api/login')) {
        options.headers = options.headers || {};
        const token = sessionStorage.getItem('avyna_token');
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return originalFetch(url, options).then(response => {
        if (response.status === 401 && !url.includes('/api/login')) {
            handleLogout();
        }
        return response;
    });
};

let currentUser = null;

async function checkAuth() {
    const token = sessionStorage.getItem('avyna_token');
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.querySelector('.app-container');
    
    if (!token) {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        return false;
    }
    
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            
            loginScreen.style.display = 'none';
            appContainer.style.display = 'flex';
            
            document.getElementById('user-display-name').innerText = currentUser.nombre;
            document.getElementById('user-display-role').innerText = currentUser.rol;
            
            applyRolePermissions(currentUser.rol);
            
            await init();
            return true;
        } else {
            handleLogout();
            return false;
        }
    } catch (e) {
        console.error("Error al validar sesión", e);
        handleLogout();
        return false;
    }
}

async function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error');
    
    const username = usernameInput.value;
    const password = passwordInput.value;
    
    errorMsg.style.display = 'none';
    
    try {
        const res = await originalFetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (res.ok) {
            const data = await res.json();
            sessionStorage.setItem('avyna_token', data.token);
            usernameInput.value = '';
            passwordInput.value = '';
            
            await checkAuth();
        } else {
            errorMsg.innerText = "Usuario o contraseña incorrectos.";
            errorMsg.style.display = 'block';
        }
    } catch (e) {
        console.error("Error en login", e);
        errorMsg.innerText = "Error al conectar con el servidor.";
        errorMsg.style.display = 'block';
    }
}

function handleLogout() {
    sessionStorage.removeItem('avyna_token');
    currentUser = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.querySelector('.app-container').style.display = 'none';
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('login-password');
    if (passwordInput) {
        passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    }
}

async function handleGoogleLogin() {
    const errorMsg = document.getElementById('login-error');
    if (errorMsg) errorMsg.style.display = 'none';

    try {
        if (!window.supabase) {
            if (errorMsg) {
                errorMsg.innerText = "Error al cargar la librería de Supabase Auth.";
                errorMsg.style.display = 'block';
            }
            return;
        }

        const supabaseUrl = 'https://gtpdqwmbwavioankpyie.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cGRxd21id2F2aW9hbmtweWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIxMTUxODQsImV4cCI6MjAzNzY5MTE4NH0.public_anon';
        const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            if (errorMsg) {
                errorMsg.innerText = "Google Auth: " + error.message;
                errorMsg.style.display = 'block';
            }
        }
    } catch (e) {
        console.error("Error al iniciar con Google:", e);
        if (errorMsg) {
            errorMsg.innerText = "Para usar Google Auth, activa el proveedor 'Google' en tu panel de Supabase.";
            errorMsg.style.display = 'block';
        }
    }
}

function applyRolePermissions(rol) {
    const bitacoraBtn = document.getElementById('nav-btn-bitacora');
    const appUsersSubnavBtn = document.getElementById('subnav-btn-app-users');
    const sociosCapitalSubnavBtn = document.getElementById('subnav-btn-socios-capital');
    
    // Tarjetas métricas del Dashboard financiero
    const cardCosto = document.getElementById('metric-card-costo');
    const cardBruta = document.getElementById('metric-card-bruta');
    const cardNeta = document.getElementById('monthly-balance-card');
    
    if (rol === 'socio') {
        const addAccBtn = document.querySelector('button[onclick="openAddAccountModal()"]');
        if (addAccBtn) addAccBtn.style.display = 'none';
        
        const manualFormCard = document.querySelector('#tab-dashboard form#manual-move-form');
        if (manualFormCard) {
            const manualCard = manualFormCard.closest('.card');
            if (manualCard) manualCard.style.display = 'none';
        }
        
        const sociosBtn = document.querySelector('.nav-btn[data-tab="personal-socios"]');
        if (sociosBtn) sociosBtn.style.display = 'flex'; // Socio sí puede ver comisiones/capital (solo lectura)
        if (bitacoraBtn) bitacoraBtn.style.display = 'none';
        if (appUsersSubnavBtn) appUsersSubnavBtn.style.display = 'none';
        if (sociosCapitalSubnavBtn) sociosCapitalSubnavBtn.style.display = 'inline-block';
        
        // El socio sí puede ver utilidades
        if (cardCosto) cardCosto.style.display = 'block';
        if (cardBruta) cardBruta.style.display = 'block';
        if (cardNeta) cardNeta.style.display = 'block';
    } else if (rol === 'auxiliar') {
        const addAccBtn = document.querySelector('button[onclick="openAddAccountModal()"]');
        if (addAccBtn) addAccBtn.style.display = 'none';
        
        const manualFormCard = document.querySelector('#tab-dashboard form#manual-move-form');
        if (manualFormCard) {
            const manualCard = manualFormCard.closest('.card');
            if (manualCard) manualCard.style.display = 'block'; // Sí registra gastos manuales
        }
        
        const reportBtn = document.querySelector('.nav-btn[data-tab="reporte"]');
        if (reportBtn) reportBtn.style.display = 'none'; // Auxiliar NO ve el reporte financiero general
        
        const sociosBtn = document.querySelector('.nav-btn[data-tab="personal-socios"]');
        if (sociosBtn) sociosBtn.style.display = 'flex'; // Sí ve nóminas y comisiones
        if (bitacoraBtn) bitacoraBtn.style.display = 'none';
        if (appUsersSubnavBtn) appUsersSubnavBtn.style.display = 'none';
        if (sociosCapitalSubnavBtn) sociosCapitalSubnavBtn.style.display = 'none'; // Auxiliar NO ve capital de socios
        
        // Auxiliar NO ve utilidades ni costos en el dashboard
        if (cardCosto) cardCosto.style.display = 'none';
        if (cardBruta) cardBruta.style.display = 'none';
        if (cardNeta) cardNeta.style.display = 'none';
    } else {
        const addAccBtn = document.querySelector('button[onclick="openAddAccountModal()"]');
        if (addAccBtn) addAccBtn.style.display = 'inline-block';
        
        const manualFormCard = document.querySelector('#tab-dashboard form#manual-move-form');
        if (manualFormCard) {
            const manualCard = manualFormCard.closest('.card');
            if (manualCard) manualCard.style.display = 'block';
        }
        
        const reportBtn = document.querySelector('.nav-btn[data-tab="reporte"]');
        if (reportBtn) reportBtn.style.display = 'flex';
        
        const sociosBtn = document.querySelector('.nav-btn[data-tab="personal-socios"]');
        if (sociosBtn) sociosBtn.style.display = 'flex';
        if (bitacoraBtn) bitacoraBtn.style.display = 'flex';
        if (appUsersSubnavBtn) appUsersSubnavBtn.style.display = 'inline-block';
        if (sociosCapitalSubnavBtn) sociosCapitalSubnavBtn.style.display = 'inline-block';
        
        // Admin sí ve utilidades
        if (cardCosto) cardCosto.style.display = 'block';
        if (cardBruta) cardBruta.style.display = 'block';
        if (cardNeta) cardNeta.style.display = 'block';
    }
}

let currentCorte = null;
let currentCortePage = 1;
let totalCortePages = 1;
let cortesLimit = 30;

let databaseState = {
    cuentas: [],
    cortes: [],
    movimientosManuales: [],
    deudas: []
};

// Navegación
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const tabId = 'tab-' + btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        if (btn.getAttribute('data-tab') === 'bitacora') {
            fetchBitacora();
        }
    });
});


// Cargar Datos Iniciales
async function init() {
    await fetchCuentas();
    await fetchMovimientosManuales();
    await fetchCortes();
    await fetchDeudas();
    await fetchReporteMensual();
    await fetchHistorial();
}

async function fetchReporteMensual() {
    try {
        const startInput = document.getElementById('report-date-start').value;
        const endInput = document.getElementById('report-date-end').value;
        const cortesFilter = document.getElementById('report-cortes-filter').value;
        
        let url = `/api/reporte-mensual?cortesFilter=${cortesFilter}`;
        if (startInput && endInput) {
            url += `&start=${startInput}&end=${endInput}`;
        }
        
        console.log("fetchReporteMensual -> Realizando petición a:", url);
        
        const res = await fetch(url);
        const data = await res.json();
        
        // Pre-llenar campos de fecha con los límites aplicados
        document.getElementById('report-date-start').value = data.start;
        document.getElementById('report-date-end').value = data.end;
        
        // Formatear rango para el título
        const formatFecha = (f) => {
            const parts = f.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        };
        document.getElementById('monthly-report-title').innerText = `Reporte del ${formatFecha(data.start)} al ${formatFecha(data.end)}`;
        
        // Asignar totales principales (5 tarjetas)
        document.getElementById('monthly-ingresos').innerText = `$${data.totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('monthly-costo').innerText = `$${data.totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('monthly-bruta').innerText = `$${data.utilidadBruta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('monthly-egresos').innerText = `$${data.totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        const balanceSpan = document.getElementById('monthly-balance');
        balanceSpan.innerText = `$${data.utilidadNeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        const balanceCard = document.getElementById('monthly-balance-card');
        if (data.utilidadNeta >= 0) {
            balanceSpan.style.color = 'var(--emerald)';
            if (balanceCard) {
                balanceCard.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))';
                balanceCard.style.borderColor = 'var(--emerald)';
            }
        } else {
            balanceSpan.style.color = '#ef4444';
            if (balanceCard) {
                balanceCard.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))';
                balanceCard.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            }
        }
        
        // 1. Renderizar Cortes Z Incluidos
        const cortesBody = document.getElementById('rep-cortes-body');
        let cortesHtml = '';
        if (data.cortesDetalle && data.cortesDetalle.length > 0) {
            data.cortesDetalle.forEach(c => {
                const fParts = c.fecha.split('-');
                const fechaCorteFormato = `${fParts[2]}/${fParts[1]}/${fParts[0]}`;
                cortesHtml += `
                    <tr>
                        <td><strong>#${c.corte}</strong></td>
                        <td>${fechaCorteFormato}</td>
                        <td><span style="font-size:10px; color:var(--text-muted)">${c.estacion}</span></td>
                        <td>$${c.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>$${c.costo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="color:var(--red)">-$${c.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="font-weight:600; color:${c.utilidadNeta >= 0 ? 'var(--emerald)' : 'var(--red)'}">$${c.utilidadNeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                `;
            });
        } else {
            cortesHtml = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted)">No hay cortes en el rango.</td></tr>`;
        }
        cortesBody.innerHTML = cortesHtml;

        // 2. Renderizar Medios de Pago
        const mediosBody = document.getElementById('rep-medios-body');
        let mediosHtml = '';
        const labelsMedios = { 
            'EFE': '💵 Efectivo', 
            'TRA': '🏦 Transferencia', 
            'DEB': '💳 Tarjeta de Débito',
            'TAR': '💳 Tarjeta de Crédito', 
            'CRE': '📝 Venta a Crédito',
            'VAL': '🎟 Vales', 
            'CHE': '📝 Cheque',
            'PUN': '✨ Puntos (Monedero)',
            'DEV': '🔄 Devolución',
            'DEP': '💰 Depósito Bancario'
        };
        
        let tieneMedios = false;
        Object.entries(data.mediosPago || {}).forEach(([medio, importe]) => {
            if (importe > 0) {
                tieneMedios = true;
                mediosHtml += `
                    <tr>
                        <td><strong>${labelsMedios[medio] || medio}</strong></td>
                        <td style="text-align: right; font-weight: 600;">$${importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                `;
            }
        });
        if (!tieneMedios) {
            mediosHtml = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted)">$0.00 recibidos en el periodo.</td></tr>`;
        }
        mediosBody.innerHTML = mediosHtml;

        // 3. Renderizar Egresos
        const egresosBody = document.getElementById('rep-egresos-body');
        let egresosHtml = '';
        if (data.egresosDetalle && data.egresosDetalle.length > 0) {
            data.egresosDetalle.forEach(e => {
                egresosHtml += `
                    <tr>
                        <td>🔴 ${e.concepto}</td>
                        <td style="text-align: right; font-weight: 600; color: var(--red)">-$${e.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                `;
            });
        } else {
            egresosHtml = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted)">No hay egresos en el periodo.</td></tr>`;
        }
        egresosBody.innerHTML = egresosHtml;
        
    } catch (e) {
        console.error("Error fetching monthly report", e);
    }
}

async function fetchCuentas() {
    try {
        const res = await fetch('/api/cuentas');
        databaseState.cuentas = await res.json();
        renderCuentas();
        populateAccountDropdowns();
        populatePayDebtAccountDropdown();
    } catch (e) {
        console.error("Error fetching accounts", e);
    }
}

async function fetchMovimientosManuales() {
    try {
        const res = await fetch('/api/movimientos-manuales');
        databaseState.movimientosManuales = await res.json();
        renderMovimientosManuales();
    } catch (e) {
        console.error("Error fetching manual moves", e);
    }
}

async function fetchCortes() {
    try {
        const res = await fetch(`/api/cortes?page=${currentCortePage}&limit=${cortesLimit}`);
        const data = await res.json();
        databaseState.cortes = data.cortes;
        totalCortePages = data.pages;
        getFilteredCortes();
        updatePaginationControls();
        updateDashboardMetrics(data);
    } catch (e) {
        console.error("Error fetching cortes", e);
    }
}

async function fetchDeudas() {
    try {
        const res = await fetch('/api/deudas');
        databaseState.deudas = await res.json();
        renderDeudas();
    } catch (e) {
        console.error("Error fetching deudas", e);
    }
}

// Renders
function renderCuentas() {
    const sidebarList = document.getElementById('sidebar-accounts-list');
    const detailList = document.getElementById('accounts-detail-list');
    const reportAccList = document.getElementById('report-accounts-list');
    
    sidebarList.innerHTML = '';
    detailList.innerHTML = '';
    if (reportAccList) reportAccList.innerHTML = '';
    
    let totalReal = 0;
    
    databaseState.cuentas.forEach(c => {
        const isActive = c.activa !== false;
        
        if (isActive) {
            totalReal += c.saldo;
            
            // Sidebar list
            const sidebarItem = document.createElement('div');
            sidebarItem.className = 'sidebar-acc-item';
            sidebarItem.innerHTML = `
                <span>${c.nombre}</span>
                <span>$${c.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            `;
            sidebarList.appendChild(sidebarItem);

            // Report accounts list
            if (reportAccList) {
                const reportItem = document.createElement('div');
                reportItem.style.display = 'flex';
                reportItem.style.justifyContent = 'space-between';
                reportItem.style.borderBottom = '1px dashed var(--border)';
                reportItem.style.paddingBottom = '4px';
                reportItem.style.marginBottom = '4px';
                reportItem.innerHTML = `
                    <span>${c.nombre}</span>
                    <strong style="color: var(--text-muted);">$${c.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                `;
                reportAccList.appendChild(reportItem);
            }
        }
        
        // Detail tab list
        const detailCard = document.createElement('div');
        detailCard.className = 'account-detail-card';
        detailCard.style.display = 'flex';
        detailCard.style.justifyContent = 'space-between';
        detailCard.style.alignItems = 'center';
        detailCard.style.padding = '15px';
        detailCard.style.marginBottom = '12px';
        if (!isActive) {
            detailCard.style.opacity = '0.6';
        }
        
        const badgeHtml = isActive ? '' : ' <span class="badge" style="background-color: var(--border); color: var(--text-muted); font-size: 10px; margin-left: 8px;">Inactiva</span>';
        
        detailCard.innerHTML = `
            <div>
                <h4 style="margin: 0; font-size: 16px; color: var(--text);">${c.nombre}${badgeHtml}</h4>
                <span style="font-size: 12px; color: var(--text-muted);">${c.numeroCuenta ? `No. Cuenta: ${c.numeroCuenta}` : 'Sin número registrado'}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="balance" style="font-size: 18px; font-weight: 600; color: var(--text);">$${c.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <button class="btn btn-secondary btn-sm" onclick="openEditAccountModal('${c.id}', '${c.nombre.replace(/'/g, "\\'")}', '${(c.numeroCuenta || '').replace(/'/g, "\\'")}', ${c.saldo}, ${isActive})" style="padding: 4px 8px; font-size: 12px;">Editar</button>
            </div>
        `;
        detailList.appendChild(detailCard);
    });
    
    // Rellenar saldo real sidebar
    const sidebarTotalRealEl = document.getElementById('sidebar-total-real');
    if (sidebarTotalRealEl) {
        sidebarTotalRealEl.innerText = `$${totalReal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Rellenar total en tarjeta del reporte
    if (reportAccList) {
        const reportTotalItem = document.createElement('div');
        reportTotalItem.style.display = 'flex';
        reportTotalItem.style.justifyContent = 'space-between';
        reportTotalItem.style.marginTop = '8px';
        reportTotalItem.style.paddingTop = '6px';
        reportTotalItem.style.borderTop = '1px solid var(--text)';
        reportTotalItem.style.fontWeight = 'bold';
        reportTotalItem.innerHTML = `
            <span>Total Real:</span>
            <span style="color: var(--primary);">$${totalReal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        `;
        reportAccList.appendChild(reportTotalItem);
    }
}

function populateAccountDropdowns() {
    const dropdown = document.getElementById('move-account');
    dropdown.innerHTML = '';
    const dropdownFrom = document.getElementById('move-account-from');
    dropdownFrom.innerHTML = '';
    const dropdownTo = document.getElementById('move-account-to');
    dropdownTo.innerHTML = '';
    
    const histAccFilter = document.getElementById('hist-account-filter');
    if (histAccFilter) {
        histAccFilter.innerHTML = '<option value="all" selected>Todas las Cuentas</option>';
        const optCaja = document.createElement('option');
        optCaja.value = 'caja_pos';
        optCaja.innerText = 'Caja POS (Egresos)';
        histAccFilter.appendChild(optCaja);
    }
    
    databaseState.cuentas.filter(c => c.activa !== false).forEach(c => {
        // Dropdown principal
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nombre;
        dropdown.appendChild(opt);
        
        // Dropdown origen (Sale)
        const optFrom = document.createElement('option');
        optFrom.value = c.id;
        optFrom.innerText = c.nombre;
        dropdownFrom.appendChild(optFrom);
        
        // Dropdown destino (Entra)
        const optTo = document.createElement('option');
        optTo.value = c.id;
        optTo.innerText = c.nombre;
        // Seleccionar Banorte por defecto en destino para facilitar traspasos rápidos de caja chica a banco
        if (c.id === 'banorte') optTo.selected = true;
        dropdownTo.appendChild(optTo);
        
        // Filtro de historial
        if (histAccFilter) {
            const optHist = document.createElement('option');
            optHist.value = c.id;
            optHist.innerText = c.nombre;
            histAccFilter.appendChild(optHist);
        }
    });
}

function populatePayDebtAccountDropdown() {
    const dropdown = document.getElementById('pay-debt-account');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    databaseState.cuentas.filter(c => c.activa !== false).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nombre;
        dropdown.appendChild(opt);
    });
}

function updatePaginationControls() {
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const indicator = document.getElementById('page-indicator');
    
    if (btnPrev && btnNext && indicator) {
        btnPrev.disabled = currentCortePage <= 1;
        btnNext.disabled = currentCortePage >= totalCortePages;
        indicator.innerText = `Pág. ${currentCortePage} de ${totalCortePages || 1}`;
    }
}

// Add pagination event listeners at startup
document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (currentCortePage > 1) {
        currentCortePage--;
        fetchCortes();
    }
});

document.getElementById('btn-next-page').addEventListener('click', () => {
    if (currentCortePage < totalCortePages) {
        currentCortePage++;
        fetchCortes();
    }
});

// Event listener para filtrar historial por cuenta de forma inmediata
document.getElementById('hist-account-filter').addEventListener('change', () => {
    if (window.currentOperations) {
        const accountFilter = document.getElementById('hist-account-filter').value;
        let filteredOperations = window.currentOperations;
        if (accountFilter !== 'all') {
            if (accountFilter === 'caja_pos') {
                filteredOperations = filteredOperations.filter(op => op.referencia === 'Caja POS');
            } else {
                filteredOperations = filteredOperations.filter(op => 
                    op.cuentaId === accountFilter || 
                    op.cuentaOrigenId === accountFilter || 
                    op.cuentaDestinoId === accountFilter
                );
            }
        }
        renderHistorial(filteredOperations);
    }
});

function renderMovimientosManuales() {
    const tbody = document.getElementById('manual-moves-table-body');
    tbody.innerHTML = '';
    
    // Mostrar últimos 6 movimientos manuales
    const items = [...databaseState.movimientosManuales].reverse().slice(0, 6);
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay movimientos registrados.</td></tr>`;
        return;
    }
    
    items.forEach(m => {
        const isSystemGenerated = m.id && (m.id.startsWith('mov_com_') || m.id.startsWith('mov_nom_') || m.id.startsWith('mov_soc_'));
        const canEdit = currentUser && currentUser.rol === 'admin';
        const editBtn = isSystemGenerated || !canEdit ? '' : `<button onclick="openEditMoveModalById('${m.id}')" title="Editar" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0; font-size:13px;">✏️</button>`;
        const deleteBtn = !canEdit ? '' : `<button class="btn-delete-icon" onclick="deleteManualMove('${m.id}')" title="Eliminar" style="background:none; border:none; color:var(--red); cursor:pointer; padding:0; font-size:13px; font-weight:bold;">✕</button>`;

        const tr = document.createElement('tr');
        if (m.tipo === 'T') {
            const cuentaOrigen = databaseState.cuentas.find(c => c.id === m.cuentaOrigenId);
            const cuentaDestino = databaseState.cuentas.find(c => c.id === m.cuentaDestinoId);
            const origenNombre = cuentaOrigen ? cuentaOrigen.nombre : m.cuentaOrigenId;
            const destinoNombre = cuentaDestino ? cuentaDestino.nombre : m.cuentaDestinoId;
            
            tr.innerHTML = `
                <td><strong>${escapeHTML(m.concepto)}</strong><br><span style="font-size: 11px; color: var(--text-muted);">${escapeHTML(m.fecha)}</span></td>
                <td><span style="font-size: 11px;">${escapeHTML(origenNombre)} ➔ <br><strong>${escapeHTML(destinoNombre)}</strong></span></td>
                <td><span class="badge" style="background-color: #4f46e5; color: white; font-size: 10px; padding: 2px 6px;">Traspaso</span></td>
                <td style="font-weight: 600; color: #4f46e5; display: flex; justify-content: space-between; align-items: center;">
                    <span>$${m.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <div style="display: flex; gap: 8px;">
                        ${editBtn}
                        ${deleteBtn}
                    </div>
                </td>
            `;
        } else {
            const cuenta = databaseState.cuentas.find(c => c.id === m.cuentaId);
            tr.innerHTML = `
                <td><strong>${escapeHTML(m.concepto)}</strong><br><span style="font-size: 11px; color: var(--text-muted);">${escapeHTML(m.fecha)}</span></td>
                <td>${escapeHTML(cuenta ? cuenta.nombre : m.cuentaId)}</td>
                <td><span class="badge badge-${m.tipo === 'I' ? 'ingreso' : 'egreso'}">${m.tipo === 'I' ? 'Ingreso' : 'Egreso'}</span></td>
                <td style="font-weight: 600; color: ${m.tipo === 'I' ? 'var(--emerald)' : 'var(--red)'}; display: flex; justify-content: space-between; align-items: center;">
                    <span>${m.tipo === 'I' ? '+' : '-'}$${m.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <div style="display: flex; gap: 8px;">
                        ${editBtn}
                        ${deleteBtn}
                    </div>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
}

function renderCortesList(cortes) {
    const list = document.getElementById('cortes-list-container');
    list.innerHTML = '';
    
    if (cortes.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron cortes.</div>`;
        return;
    }
    
    cortes.forEach(c => {
        const item = document.createElement('div');
        item.className = 'corte-item';
        if (currentCorte && currentCorte.corte.numeroCorte === c.numeroCorte) {
            item.className += ' active';
        }
        
        const fechaFormatted = new Date(c.usufecha).toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        
        item.innerHTML = `
            <div class="corte-item-info">
                <h4>Corte Z #${c.numeroCorte} ${c.auditado ? '<span title="Este corte tiene modificaciones o historial en la bitácora" style="cursor:help;">📝</span>' : ''}</h4>
                <span>${fechaFormatted} (${c.estacion.trim()})</span>
            </div>
            <span class="corte-item-badge ${c.conciliado ? 'conciliado' : 'pendiente'}">
                ${c.conciliado ? 'Conciliado' : 'Pendiente'}
            </span>
        `;
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.corte-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            showCorteDetail(c.numeroCorte);
        });
        
        list.appendChild(item);
    });
}

function updateDashboardMetrics(data) {
    if (!data) return;
    document.getElementById('dash-cortes-conciliados').innerText = data.totalConciliados ?? 0;
    document.getElementById('dash-cortes-pendientes').innerText = data.totalPendientes ?? 0;
}

// Filtrar cortes por búsqueda y estado
function getFilteredCortes() {
    const term = document.getElementById('corte-search-input').value.toLowerCase().trim();
    const status = document.getElementById('corte-status-filter').value;
    
    let filtered = databaseState.cortes;
    
    // Filtrar por estado
    if (status === 'pending') {
        filtered = filtered.filter(c => !c.conciliado);
    } else if (status === 'reconciled') {
        filtered = filtered.filter(c => c.conciliado);
    } else if (status === 'modified') {
        filtered = filtered.filter(c => c.auditado);
    }
    
    // Filtrar por búsqueda de número
    if (term !== '') {
        filtered = filtered.filter(c => c.numeroCorte.toString().includes(term));
    }
    
    renderCortesList(filtered);
}

document.getElementById('corte-search-input').addEventListener('input', getFilteredCortes);
document.getElementById('corte-status-filter').addEventListener('change', getFilteredCortes);

// Mostrar Detalle de Corte Seleccionado
async function showCorteDetail(numeroCorte) {
    const container = document.getElementById('corte-detail-container');
    container.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
            <div class="spinner">Cargando desglose del corte...</div>
        </div>
    `;
    
    try {
        const res = await fetch(`/api/cortes/${numeroCorte}`);
        currentCorte = await res.json();
        
        const fechaFormatted = new Date(currentCorte.corte.usufecha).toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        
        let egresosHtml = '';
        let totalComisiones = 0;
        let totalGastos = 0;
        
        currentCorte.flujos.forEach(f => {
            if (f.ING_EG === 'E') {
                const conceptoClean = f.CONCEPTO.trim();
                // Omitir el Corte Z de los egresos operativos
                if (conceptoClean === 'CORTZ') return;
                
                const esComision = conceptoClean === 'COM';
                if (esComision) totalComisiones += f.IMPORTE;
                else totalGastos += f.IMPORTE;
                
                egresosHtml += `
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;">
                        <span>${esComision ? '💸 Comisión pagada' : '🔴 ' + f.DESCRIP} (${conceptoClean})</span>
                        <span style="font-weight:600; color:var(--red)">-$${f.IMPORTE.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                `;
            }
        });
        
        if (egresosHtml === '') {
            egresosHtml = `<p style="color:var(--text-muted); font-size:14px;">No se registraron egresos.</p>`;
        }
        
        // Sumamos utilidades y comisiones
        let totalUtilidadVentas = 0;
        let totalCobrado = 0;
        let vendedoresHtml = '';
        const isAuxiliar = currentUser && currentUser.rol === 'auxiliar';
        
        currentCorte.vendedores.forEach(v => {
            totalUtilidadVentas += v.utilidadTeorica;
            totalCobrado += v.cobrado;
            vendedoresHtml += `
                <tr>
                    <td><strong>${v.vendedor}</strong></td>
                    <td>$${v.cobrado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    ${isAuxiliar ? '' : `<td>$${v.utilidadTeorica.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`}
                </tr>
            `;
        });
        
        if (vendedoresHtml === '') {
            vendedoresHtml = `<tr><td colspan="${isAuxiliar ? 2 : 3}" style="text-align:center; color:var(--text-muted)">No hay ventas registradas con vendedor.</td></tr>`;
        }
        
        let contadoHtml = '';
        let cobranzaHtml = '';
        
        if (currentCorte.cobros && currentCorte.cobros.length > 0) {
            currentCorte.cobros.forEach(c => {
                const fila = `
                    <tr>
                        <td>
                            <strong>Ticket #${c.ticket} (${c.estacion})</strong><br>
                            <span style="font-size:11px; color:var(--text-muted)">
                                ${c.es_abono ? 'Abono: #' + c.cobranza + ' | ' : ''}Venta ID: ${c.venta}
                            </span>
                        </td>
                        <td><span style="font-size:11px; color:var(--text-muted)">${c.cliente_id}</span><br>${c.cliente_nombre}</td>
                        <td>$${c.importe_cobrado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        ${isAuxiliar ? '' : `<td style="font-weight:600; color:var(--emerald)">$${c.utilidad_venta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`}
                    </tr>
                `;
                
                if (c.es_abono) {
                    cobranzaHtml += fila;
                } else {
                    contadoHtml += fila;
                }
            });
        }
        
        if (contadoHtml === '') {
            contadoHtml = `<tr><td colspan="${isAuxiliar ? 3 : 4}" style="text-align:center; color:var(--text-muted)">No hay pagos de contado en este corte.</td></tr>`;
        }
        if (cobranzaHtml === '') {
            cobranzaHtml = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">No se registraron abonos de cobranza.</td></tr>`;
        }
        
        const utilidadNeta = totalUtilidadVentas - totalComisiones - totalGastos;
        const margenPorcentual = totalUtilidadVentas > 0 ? (utilidadNeta / totalUtilidadVentas) * 100 : 0;
        const margenSobreCobro = totalCobrado > 0 ? (utilidadNeta / totalCobrado) * 100 : 0;
        
        // Consultar si ya tiene comisiones pagadas
        const movesRes = await fetch('/api/movimientos-manuales');
        const movesList = await movesRes.json();
        const comisionesPagadas = movesList.some(m => m.concepto && m.concepto.includes(`Comisiones Liquidadas de Corte Z #${currentCorte.corte.numeroCorte}`));

        container.innerHTML = `
            <div class="card" style="margin-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <div>
                        <h2>Corte Z #${currentCorte.corte.numeroCorte} ${currentCorte.auditado ? '<span title="Este corte tiene modificaciones o historial en la bitácora" style="cursor:help;">📝</span>' : ''}</h2>
                        <span style="color:var(--text-muted)">Fecha: ${fechaFormatted} | Estación: ${currentCorte.corte.estacion.trim()}</span>
                        ${currentCorte.auditado && currentUser && currentUser.rol === 'admin' ? `
                            <br><a href="#" onclick="event.preventDefault(); viewCorteAuditLogs(${currentCorte.corte.numeroCorte})" style="font-size:12px; color:var(--primary); font-weight:600; text-decoration:none; display:inline-block; margin-top:4px;">🔍 Ver historial de auditoría</a>
                        ` : ''}
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        ${currentUser && currentUser.rol === 'socio' ? '' : `
                            ${!currentCorte.conciliado ? 
                                `<button class="btn btn-secondary" disabled style="background-color: var(--border); color: var(--text-muted); cursor: not-allowed; opacity: 0.6;" title="Debe conciliar el corte primero para pagar comisiones">Liquidar Comisiones (Requiere Conciliar)</button>` :
                                (comisionesPagadas ? 
                                    `<span class="badge" style="background-color:#4f46e5; color:white; padding:6px 12px; font-size:13px;">✓ Comisiones Pagadas</span>` :
                                    `<button class="btn btn-secondary" onclick="openCommissionLiquidationFromId(${currentCorte.corte.numeroCorte})" style="background-color:#4f46e5; color:white;">Liquidar Comisiones</button>`
                                )
                            }
                        `}
                        
                        ${currentCorte.conciliado ? 
                            `<div style="display:flex; gap:8px; align-items:center;">
                                <span class="badge badge-ingreso" style="font-size:14px; padding:6px 12px;">✓ Corte Conciliado</span>
                                ${currentUser && currentUser.rol === 'socio' ? '' : `<button class="btn btn-secondary" onclick="unreconcileCorte(${currentCorte.corte.numeroCorte})" style="background-color: var(--red); color: white;">Desconciliar</button>`}
                            </div>` : 
                            (currentUser && currentUser.rol === 'socio' ? 
                                `<span class="badge badge-egreso" style="font-size:14px; padding:6px 12px;">Pendiente de Conciliar</span>` : 
                                `<button class="btn btn-emerald" onclick="openReconcileModal()">Conciliar Corte en Banco/Efectivo</button>`
                            )
                        }
                    </div>
                </div>
                
                <div class="detail-grid">
                    <!-- Ticket Físico Original -->
                    <div>
                        <h3 style="margin-bottom:12px; font-size:16px; color:var(--text-muted)">Ticket Original del Corte</h3>
                        <div class="ticket-wrapper">${currentCorte.corte.cadenaSalida || 'No hay ticket registrado para este corte.'}</div>
                    </div>
                    
                    <!-- Desglose Inteligente -->
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <!-- Utilidad por Vendedor -->
                        <div class="card" style="background-color:var(--bg-input); padding:16px; margin:0;">
                            <h3 style="margin-bottom:12px; font-size:16px;">Ventas${isAuxiliar ? '' : ' y Utilidades'}</h3>
                            <table class="modern-table" style="font-size:13px;">
                                  <thead>
                                    <tr>
                                        <th>Vendedor</th>
                                        <th>Cobrado</th>
                                        ${isAuxiliar ? '' : '<th>Utilidad</th>'}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${vendedoresHtml}
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Detalle de Documentos Cobrados -->
                        <div class="card" style="background-color:var(--bg-input); padding:16px; margin:0;">
                            <h3 style="margin-bottom:12px; font-size:16px;">Pagos Recibidos de Contado</h3>
                            <table class="modern-table" style="font-size:12px; margin-bottom:16px;">
                                <thead>
                                    <tr>
                                        <th>Documento</th>
                                        <th>Cliente</th>
                                        <th>Cobrado</th>
                                        ${isAuxiliar ? '' : '<th>Utilidad</th>'}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${contadoHtml}
                                </tbody>
                            </table>

                            <h3 style="margin-bottom:12px; font-size:16px;">Abonos Recibidos (Cobranza)</h3>
                            <table class="modern-table" style="font-size:12px;">
                                <thead>
                                    <tr>
                                        <th>Abono</th>
                                        <th>Cliente</th>
                                        <th>Cobrado</th>
                                        ${isAuxiliar ? '' : '<th>Utilidad</th>'}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cobranzaHtml}
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Egresos del Corte -->
                        <div class="card" style="background-color:var(--bg-input); padding:16px; margin:0;">
                            <h3 style="margin-bottom:12px; font-size:16px;">Egresos de Turno</h3>
                            ${egresosHtml}
                        </div>

                        <!-- Utilidad Neta Final -->
                        ${isAuxiliar ? '' : `
                        <div class="card" style="background: linear-gradient(135deg, rgba(16,185,129,0.1), rgba(79,70,229,0.1)); border-color:var(--emerald); padding:20px; margin:0;">
                            <h3 style="margin-bottom:16px; font-size:16px; border-bottom:1px solid var(--border); padding-bottom:8px;">Resumen Financiero del Corte</h3>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-size:14px; color:var(--text-muted);">Utilidad Bruta de Venta:</span>
                                <span style="font-weight:600;">$${totalUtilidadVentas.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-size:14px; color:var(--text-muted);">Egresos (Gastos + Comisiones):</span>
                                <span style="font-weight:600; color:var(--red)">-$${(totalComisiones + totalGastos).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-size:14px; color:var(--text-muted);">Rendimiento sobre Cobrado (Utilidad %):</span>
                                <span style="font-weight:600; color:var(--indigo)">${margenSobreCobro.toFixed(2)}%</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--border); padding-top:12px; margin-top:8px;">
                                <strong style="font-size:16px;">Utilidad Neta (Ganancia Real):</strong>
                                <strong style="font-size:22px; color:var(--emerald)">$${utilidadNeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            </div>
                        </div>
                        `}
                    </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div style="color:var(--red); padding:20px;">Error cargando detalles: ${e.message}</div>`;
    }
}

// Global state for paying a debt
let activeDebtId = null;

// Modal de Conciliación
async function openReconcileModal() {
    if (!currentCorte) return;
    
    const modal = document.getElementById('reconcile-modal');
    const container = document.getElementById('reconcile-distribution-container');
    const totalSpan = document.getElementById('reconcile-total-corte');
    
    container.innerHTML = '';
    
    // Agrupar cobros por forma_pago
    const cobrosPorMetodo = {};
    currentCorte.cobros.forEach(c => {
        const metodo = c.forma_pago || 'EFE';
        if (!cobrosPorMetodo[metodo]) {
            cobrosPorMetodo[metodo] = 0;
        }
        cobrosPorMetodo[metodo] += c.importe_cobrado;
    });

    let totalCorte = 0;
    Object.keys(cobrosPorMetodo).forEach(metodo => {
        totalCorte += cobrosPorMetodo[metodo];
    });
    
    totalSpan.innerText = `$${totalCorte.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Crear filas para cada método de pago con entrada numérica ajustable
    const nombresMetodos = {
        'EFE': 'Efectivo (EFE)',
        'TRA': 'Transferencia (TRA)',
        'DEB': 'Tarjeta de Débito (DEB)',
        'TAR': 'Tarjeta General (TAR)',
        'CRE': 'Tarjeta de Crédito (CRE)',
        'CHM': 'Link de Pago (CHM)'
    };

    Object.keys(cobrosPorMetodo).forEach(metodo => {
        const label = nombresMetodos[metodo] || `Método ${metodo}`;
        const amount = cobrosPorMetodo[metodo];
        createReconcileRow(label, amount, metodo);
    });
    
    if (totalCorte === 0) {
        container.innerHTML = `<p style="color:var(--text-muted)">Este corte no registró cobranzas.</p>`;
    }

    // Cargar vendedores activos y agruparlos (el de este corte primero, otros activos abajo)
    let activeSellers = [];
    try {
        const vendsRes = await fetch('/api/vendedores');
        activeSellers = await vendsRes.json();
    } catch (e) {
        console.error("Error fetching sellers for reconciliation", e);
    }
    
    const corteSellersNames = currentCorte.vendedores.map(v => v.vendedor);
    
    let sellersOptions = '<option value="">-- Seleccionar Vendedor --</option>';
    sellersOptions += '<optgroup label="Vendedores de este corte">';
    currentCorte.vendedores.forEach(v => {
        sellersOptions += `<option value="${v.vendedor}">${v.vendedor}</option>`;
    });
    sellersOptions += '</optgroup>';

    const otherActiveSellers = activeSellers.filter(s => !corteSellersNames.includes(s.Nombre) && s.Nombre !== 'SIN VENDEDOR');
    if (otherActiveSellers.length > 0) {
        sellersOptions += '<optgroup label="Otros vendedores activos">';
        otherActiveSellers.forEach(s => {
            sellersOptions += `<option value="${s.Nombre}">${s.Nombre}</option>`;
        });
        sellersOptions += '</optgroup>';
    }
    
    // Guardar opciones globalmente
    window.sellersDropdownOptions = sellersOptions;
    
    // Limpiar contenedor de deudas
    const debtsContainer = document.getElementById('reconcile-debts-container');
    debtsContainer.innerHTML = '';
    
    calculateReconciliationTotals();
    
    // Si hay diferencia inicial (faltante), crear automáticamente una fila de deuda
    let totalTeorico = 0;
    let totalAjustado = 0;
    document.querySelectorAll('.reconcile-amount-input').forEach(input => {
        totalTeorico += parseFloat(input.getAttribute('data-teorico')) || 0;
        totalAjustado += parseFloat(input.value) || 0;
    });
    const initialDiff = totalTeorico - totalAjustado;
    
    if (initialDiff > 0.01) {
        const firstSeller = currentCorte.vendedores[0] ? currentCorte.vendedores[0].vendedor : '';
        addSellerDebtRow(initialDiff, firstSeller);
    }
    
    modal.classList.add('active');
}

function getDefaultAccountIdForPType(pType) {
    const activeCuentas = databaseState.cuentas.filter(c => c.activa !== false);
    if (activeCuentas.length === 0) return '';
    
    const hasAccount = (id) => activeCuentas.some(c => c.id === id);
    
    if (pType === 'EFE') {
        return hasAccount('efectivo') ? 'efectivo' : activeCuentas[0].id;
    }
    
    if (pType === 'TRA') {
        return hasAccount('banorte') ? 'banorte' : activeCuentas[0].id;
    }
    
    // Tarjetas/Links de Pago
    if (pType === 'DEB' || pType === 'CRE' || pType === 'TAR' || pType === 'CHM') {
        if (hasAccount('bancomer')) return 'bancomer';
        if (hasAccount('banorte')) return 'banorte';
        return activeCuentas[0].id;
    }
    
    return activeCuentas[0].id;
}

function createReconcileRow(labelName, amount, pType, isCustom = false) {
    const container = document.getElementById('reconcile-distribution-container');
    const row = document.createElement('div');
    row.className = 'reconcile-distribution-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1.8fr 1.5fr 1.2fr';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    row.style.marginBottom = '10px';
    
    const defaultAccountId = getDefaultAccountIdForPType(pType);
    
    let accountsOptions = '';
    databaseState.cuentas.filter(c => c.activa !== false).forEach(c => {
        const selected = c.id === defaultAccountId ? 'selected' : '';
        accountsOptions += `<option value="${c.id}" ${selected}>${c.nombre}</option>`;
    });
    
    let labelHtml = `<span><strong>${labelName}</strong> <span style="font-size:11px; color:var(--text-muted); display:block;">Teórico: $${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>`;
    
    if (isCustom) {
        const nombresMetodos = {
            'EFE': 'Efectivo (EFE)',
            'TRA': 'Transferencia (TRA)',
            'DEB': 'Tarjeta de Débito (DEB)',
            'TAR': 'Tarjeta General (TAR)',
            'CRE': 'Tarjeta de Crédito (CRE)',
            'CHM': 'Link de Pago (CHM)'
        };
        let pTypeOptions = '';
        Object.keys(nombresMetodos).forEach(k => {
            pTypeOptions += `<option value="${k}" ${k === pType ? 'selected' : ''}>${nombresMetodos[k]}</option>`;
        });
        
        labelHtml = `
            <div style="display:flex; flex-direction:column;">
                <select class="reconcile-custom-ptype-select" style="padding: 6px; font-size:12px; width:100%; border-radius:4px; border:1px solid var(--border);" onchange="updateCustomRowPType(this)">
                    ${pTypeOptions}
                </select>
                <span style="font-size:10px; color:var(--red); cursor:pointer; margin-top:2px;" onclick="this.closest('.reconcile-distribution-row').remove(); calculateReconciliationTotals();">✕ Quitar</span>
            </div>
        `;
    }
    
    row.innerHTML = `
        ${labelHtml}
        <select class="reconcile-account-select" data-type="${pType}" style="width:100%;">
            ${accountsOptions}
        </select>
        <input type="number" class="reconcile-amount-input" data-type="${pType}" data-teorico="${amount}" value="${amount.toFixed(2)}" step="0.01" min="0" oninput="calculateReconciliationTotals()" style="padding: 6px; font-size:13px; text-align:right; width:100%; box-sizing:border-box;">
    `;
    container.appendChild(row);
}

function updateCustomRowPType(selectElem) {
    const row = selectElem.closest('.reconcile-distribution-row');
    const pType = selectElem.value;
    
    const accountSelect = row.querySelector('.reconcile-account-select');
    const amountInput = row.querySelector('.reconcile-amount-input');
    
    accountSelect.setAttribute('data-type', pType);
    amountInput.setAttribute('data-type', pType);
    
    // Auto-seleccionar cuenta conveniente según el tipo de pago
    accountSelect.value = getDefaultAccountIdForPType(pType);
    calculateReconciliationTotals();
}

function addCustomReconcileRow() {
    createReconcileRow('Tarjeta General (TAR)', 0, 'TAR', true);
    calculateReconciliationTotals();
}

function addSellerDebtRow(initialAmount = 0, initialSeller = '') {
    const container = document.getElementById('reconcile-debts-container');
    const row = document.createElement('div');
    row.className = 'reconcile-debt-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '2fr 1.6fr 0.4fr';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    row.style.marginBottom = '8px';
    
    row.innerHTML = `
        <select class="reconcile-debt-seller-select" style="width: 100%; padding: 6px; font-size: 13px; border-radius: 4px; border: 1px solid var(--border);">
            ${window.sellersDropdownOptions || ''}
        </select>
        <input type="number" class="reconcile-debt-amount-input" placeholder="Monto ($)" step="0.01" min="0.01" value="${initialAmount > 0 ? initialAmount.toFixed(2) : ''}" oninput="updateDebtRemainingLabel()" style="width: 100%; padding: 6px; font-size: 13px; text-align: right; border-radius: 4px; border: 1px solid var(--border);">
        <button type="button" onclick="this.closest('.reconcile-debt-row').remove(); updateDebtRemainingLabel();" style="background: none; border: none; color: var(--red); font-size: 16px; cursor: pointer; font-weight: bold; padding: 0;">✕</button>
    `;
    
    if (initialSeller) {
        row.querySelector('.reconcile-debt-seller-select').value = initialSeller;
    }
    
    container.appendChild(row);
    updateDebtRemainingLabel();
}

function updateDebtRemainingLabel() {
    let totalTeorico = 0;
    let totalAjustado = 0;
    
    document.querySelectorAll('.reconcile-amount-input').forEach(input => {
        totalTeorico += parseFloat(input.getAttribute('data-teorico')) || 0;
        totalAjustado += parseFloat(input.value) || 0;
    });
    
    const diff = totalTeorico - totalAjustado;
    
    let assignedDebt = 0;
    document.querySelectorAll('.reconcile-debt-amount-input').forEach(input => {
        assignedDebt += parseFloat(input.value) || 0;
    });
    
    const remaining = diff - assignedDebt;
    const label = document.getElementById('reconcile-unassigned-debt-label');
    
    if (diff > 0.01) {
        label.style.display = 'inline';
        if (Math.abs(remaining) <= 0.01) {
            label.innerText = 'Faltante completamente asignado';
            label.style.color = 'var(--emerald)';
        } else if (remaining > 0) {
            label.innerText = `Faltante por asignar: $${remaining.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            label.style.color = 'var(--red)';
        } else {
            label.innerText = `Exceso asignado: $${Math.abs(remaining).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            label.style.color = 'var(--red)';
        }
    } else {
        label.style.display = 'none';
    }
}

function calculateReconciliationTotals() {
    let totalTeorico = 0;
    let totalAjustado = 0;
    
    document.querySelectorAll('.reconcile-amount-input').forEach(input => {
        totalTeorico += parseFloat(input.getAttribute('data-teorico')) || 0;
        totalAjustado += parseFloat(input.value) || 0;
    });
    
    updateDebtRemainingLabel();
    
    document.getElementById('reconcile-total-ajustado').innerText = `$${totalAjustado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function closeReconcileModal() {
    document.getElementById('reconcile-modal').classList.remove('active');
}

async function submitReconciliation() {
    if (!currentCorte) return;
    
    const distribution = [];
    let hasInvalidAmount = false;
    
    document.querySelectorAll('.reconcile-amount-input').forEach(input => {
        const val = parseFloat(input.value) || 0;
        const type = input.getAttribute('data-type');
        const row = input.closest('.reconcile-distribution-row');
        const select = row.querySelector('.reconcile-account-select');
        
        if (val < 0) {
            hasInvalidAmount = true;
        }
        
        if (val > 0) {
            distribution.push({
                tipoPago: type,
                importe: val,
                cuentaId: select.value
            });
        }
    });

    if (hasInvalidAmount) {
        alert("Los montos ingresados no pueden ser negativos.");
        return;
    }
    
    let totalAssignedDebts = 0;
    let hasInvalidDebt = false;
    
    document.querySelectorAll('.reconcile-debt-row').forEach(row => {
        const seller = row.querySelector('.reconcile-debt-seller-select').value;
        const amount = parseFloat(row.querySelector('.reconcile-debt-amount-input').value) || 0;
        
        if (amount > 0) {
            if (!seller) {
                hasInvalidDebt = true;
            }
            distribution.push({
                vendedor: seller,
                importe: amount
            });
            totalAssignedDebts += amount;
        }
    });
    
    if (hasInvalidDebt) {
        alert("Por favor, selecciona un vendedor responsable para todos los faltantes registrados.");
        return;
    }
    
    // Validar coincidencia de deudas
    let totalTeorico = 0;
    let totalAjustado = 0;
    document.querySelectorAll('.reconcile-amount-input').forEach(input => {
        totalTeorico += parseFloat(input.getAttribute('data-teorico')) || 0;
        totalAjustado += parseFloat(input.value) || 0;
    });
    const expectedDiff = totalTeorico - totalAjustado;
    
    if (expectedDiff > 0.01 && Math.abs(expectedDiff - totalAssignedDebts) > 0.01) {
        alert(`El total de deudas asignadas ($${totalAssignedDebts.toFixed(2)}) no coincide con el faltante total del corte ($${expectedDiff.toFixed(2)}).`);
        return;
    }
    
    try {
        const res = await fetch(`/api/cortes/${currentCorte.corte.numeroCorte}/conciliar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ distribution })
        });
        
        const data = await res.json();
        if (data.success) {
            closeReconcileModal();
            await init(); // Recargar datos
            await showCorteDetail(currentCorte.corte.numeroCorte);
        } else {
            alert(data.error || "Fallo al conciliar corte");
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    }
}

// Desconciliar un Corte Z
async function unreconcileCorte(numeroCorte) {
    showConfirmModal(
        "Desconciliar Corte Z", 
        `¿Estás seguro de que deseas desconciliar el Corte Z #${numeroCorte}? Se revertirán los saldos en las cuentas bancarias/efectivo y se borrarán las deudas asociadas.`, 
        async () => {
            try {
                const res = await fetch(`/api/cortes/${numeroCorte}/desconciliar`, {
                    method: 'POST'
                });
                const data = await res.json();
                if (data.success) {
                    await init();
                    await showCorteDetail(numeroCorte);
                } else {
                    alert(data.error || "Fallo al desconciliar el corte.");
                }
            } catch (e) {
                alert("Error de red: " + e.message);
            }
        }
    );
}

// Renderizar deudas de vendedores en el Dashboard
function renderDeudas() {
    const tbody = document.getElementById('vendor-debts-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const items = databaseState.deudas;
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No hay deudas de vendedores registradas.</td></tr>`;
        return;
    }
    
    items.forEach(d => {
        const tr = document.createElement('tr');
        const esPendiente = d.estado === 'pendiente';
        const saldo = d.saldo !== undefined ? d.saldo : d.importe;
        const abonosSum = d.importe - saldo;
        
        let importeText = '';
        if (esPendiente) {
            if (abonosSum > 0.01) {
                importeText = `<span style="text-decoration: line-through; font-size:11px; color: var(--text-muted);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><br><strong style="color: var(--red);">$${saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> <span style="font-size:10px; color: var(--text-muted); font-weight:normal;">(Restante)</span>`;
            } else {
                importeText = `<strong style="color: var(--red);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            }
        } else {
            if (abonosSum > 0.01) {
                importeText = `<span style="text-decoration: line-through; font-size:11px; color: var(--text-muted); font-weight: normal;">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><br><strong style="color: var(--emerald);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> <span style="font-size:10px; color: var(--emerald); font-weight:normal;">(Pagado)</span>`;
            } else {
                importeText = `<strong style="color: var(--emerald);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            }
        }
        
        tr.innerHTML = `
            <td>${d.fecha}</td>
            <td>Corte Z #${d.numeroCorte}</td>
            <td><strong>${d.vendedor}</strong></td>
            <td>${importeText}</td>
            <td><span class="badge badge-${esPendiente ? 'egreso' : 'ingreso'}">${esPendiente ? 'Pendiente' : 'Pagado'}</span></td>
            <td>
                ${esPendiente ? 
                    (currentUser && currentUser.rol === 'socio' ? 
                        `<span style="font-size:12px; color:var(--red); font-weight:600;">Pendiente</span>` :
                        `<button class="btn btn-emerald btn-sm" onclick="openPayDebtModal('${d.id}', ${saldo})" style="padding: 4px 8px; font-size:12px;">Registrar Pago</button>`
                    ) : 
                    `<span style="font-size:12px; color:var(--text-muted);">Pagado el ${d.fechaPago}</span>`
                }
            </td>
        `;
        tbody.appendChild(tr);

        if (d.abonos && d.abonos.length > 0) {
            const trAbonos = document.createElement('tr');
            trAbonos.style.background = 'rgba(16, 185, 129, 0.04)';
            trAbonos.style.fontSize = '11px';
            
            let listHtml = '';
            d.abonos.forEach((ab, idx) => {
                const cuentaObj = databaseState.cuentas.find(c => c.id === ab.cuentaId);
                const cuentaName = cuentaObj ? cuentaObj.nombre : ab.cuentaId;
                listHtml += `<div style="margin-bottom: 2px; padding-left: 10px;">• <strong>Abono #${idx + 1} (${ab.fecha}):</strong> $${ab.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} recibido en <em>${cuentaName}</em></div>`;
            });
            
            trAbonos.innerHTML = `
                <td></td>
                <td colspan="5" style="padding: 6px 12px; border-left: 3px solid var(--emerald); color: var(--text);">
                    <div style="font-weight: bold; margin-bottom: 4px; color: var(--emerald);">Abonos registrados:</div>
                    ${listHtml}
                </td>
            `;
            tbody.appendChild(trAbonos);
        }
    });
}

// Abrir Modal de Pago de Deuda
function openPayDebtModal(debtId, amount) {
    activeDebtId = debtId;
    document.getElementById('pay-debt-max-info').innerText = `Saldo pendiente: $${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const amountInput = document.getElementById('pay-debt-amount-input');
    amountInput.value = amount.toFixed(2);
    amountInput.max = amount;
    
    document.getElementById('pay-debt-modal').classList.add('active');
}

// Cerrar Modal de Pago de Deuda
function closePayDebtModal() {
    document.getElementById('pay-debt-modal').classList.remove('active');
    activeDebtId = null;
}

// Enviar Pago de Deuda
async function submitPayDebt() {
    if (!activeDebtId) return;
    const cuentaId = document.getElementById('pay-debt-account').value;
    const importePago = parseFloat(document.getElementById('pay-debt-amount-input').value) || 0;
    
    if (importePago <= 0) {
        alert("Por favor, ingresa un importe mayor a cero.");
        return;
    }
    
    try {
        const res = await fetch(`/api/deudas/${activeDebtId}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cuentaId, importePago })
        });
        
        const data = await res.json();
        if (data.success) {
            closePayDebtModal();
            await init();
        } else {
            alert(data.error || "Fallo al registrar el pago de la deuda.");
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    }
}

// Controlar visibilidad de campos de cuentas (Traspaso vs Ingreso/Egreso)
document.getElementById('move-type').addEventListener('change', (e) => {
    const tipo = e.target.value;
    const groupSingle = document.getElementById('group-move-account');
    const groupTransfer = document.getElementById('group-transfer-accounts');
    
    if (tipo === 'T') {
        groupSingle.style.display = 'none';
        groupTransfer.style.display = 'flex';
        document.getElementById('move-account').required = false;
        document.getElementById('move-account-from').required = true;
        document.getElementById('move-account-to').required = true;
    } else {
        groupSingle.style.display = 'block';
        groupTransfer.style.display = 'none';
        document.getElementById('move-account').required = true;
        document.getElementById('move-account-from').required = false;
        document.getElementById('move-account-to').required = false;
    }
});

// Inicializar campo de fecha a la fecha de hoy por defecto
document.getElementById('move-date').value = new Date().toISOString().split('T')[0];

// Registrar Movimiento Manual (Gasto/Ingreso/Traspaso externo)
document.getElementById('manual-move-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const concepto = document.getElementById('move-concept').value;
    const tipo = document.getElementById('move-type').value;
    const importe = document.getElementById('move-amount').value;
    const fecha = document.getElementById('move-date').value;
    
    const payload = { concepto, tipo, importe, fecha };
    
    if (tipo === 'T') {
        payload.cuentaOrigenId = document.getElementById('move-account-from').value;
        payload.cuentaDestinoId = document.getElementById('move-account-to').value;
        if (payload.cuentaOrigenId === payload.cuentaDestinoId) {
            alert("La cuenta origen y destino de un traspaso deben ser diferentes.");
            return;
        }
    } else {
        payload.cuentaId = document.getElementById('move-account').value;
    }
    
    const tipoTexto = tipo === 'I' ? 'Ingreso' : (tipo === 'E' ? 'Egreso' : 'Traspaso');
    const msg = `¿Estás seguro de que deseas registrar este ${tipoTexto} por $${parseFloat(importe).toFixed(2)} con el concepto "${concepto}"?`;
    
    showConfirmModal("Confirmar Registro", msg, async () => {
        try {
            const res = await fetch('/api/movimientos-manuales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (data.success) {
                document.getElementById('manual-move-form').reset();
                // Restablecer campos y fecha
                document.getElementById('move-date').value = new Date().toISOString().split('T')[0];
                document.getElementById('group-move-account').style.display = 'block';
                document.getElementById('group-transfer-accounts').style.display = 'none';
                document.getElementById('move-account').required = true;
                document.getElementById('move-account-from').required = false;
                document.getElementById('move-account-to').required = false;
                await init();
                alert(`¡${tipoTexto} registrado con éxito!`);
            } else {
                alert("Error al registrar movimiento");
            }
        } catch (err) {
            alert("Error de red: " + err.message);
        }
    });
});

// Modal Editar Cuenta
function openEditAccountModal(id, nombre, numeroCuenta, saldo, activa) {
    document.getElementById('edit-account-id').value = id;
    document.getElementById('edit-account-name').value = nombre;
    document.getElementById('edit-account-number').value = numeroCuenta;
    document.getElementById('edit-account-balance').value = saldo;
    document.getElementById('edit-account-active').checked = activa !== false;
    document.getElementById('edit-account-modal').classList.add('active');
}

function closeEditAccountModal() {
    document.getElementById('edit-account-modal').classList.remove('active');
}

async function submitEditAccount() {
    const id = document.getElementById('edit-account-id').value;
    const nombre = document.getElementById('edit-account-name').value;
    const numeroCuenta = document.getElementById('edit-account-number').value;
    const saldo = parseFloat(document.getElementById('edit-account-balance').value) || 0;
    const activa = document.getElementById('edit-account-active').checked;
    
    try {
        const res = await fetch(`/api/cuentas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, numeroCuenta, saldo, activa })
        });
        
        const data = await res.json();
        if (data.success) {
            closeEditAccountModal();
            await init();
        } else {
            alert(data.error || "Fallo al guardar cambios de la cuenta.");
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    }
}

// Historial de Operaciones
async function fetchHistorial() {
    try {
        const startInput = document.getElementById('hist-date-start').value;
        const endInput = document.getElementById('hist-date-end').value;
        const typeFilter = document.getElementById('hist-type-filter').value;
        const sourceFilter = document.getElementById('hist-source-filter').value;
        
        let url = `/api/historial-operaciones?type=${typeFilter}&source=${sourceFilter}`;
        if (startInput && endInput) {
            url += `&start=${startInput}&end=${endInput}`;
        }
        
        const res = await fetch(url);
        const data = await res.json();
        
        window.currentOperations = data.operations || [];
        
        // Pre-llenar fechas de filtro por defecto
        document.getElementById('hist-date-start').value = data.start;
        document.getElementById('hist-date-end').value = data.end;
        
        // Aplicar filtro de cuenta
        const accountFilter = document.getElementById('hist-account-filter').value;
        let filteredOperations = data.operations || [];
        if (accountFilter !== 'all') {
            if (accountFilter === 'caja_pos') {
                filteredOperations = filteredOperations.filter(op => op.referencia === 'Caja POS');
            } else {
                filteredOperations = filteredOperations.filter(op => 
                    op.cuentaId === accountFilter || 
                    op.cuentaOrigenId === accountFilter || 
                    op.cuentaDestinoId === accountFilter
                );
            }
        }
        
        renderHistorial(filteredOperations);
    } catch (e) {
        console.error("Error fetching operations history", e);
    }
}

function renderHistorial(operations) {
    const tbody = document.getElementById('historial-table-body');
    tbody.innerHTML = '';
    
    if (operations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron operaciones en el rango especificado.</td></tr>`;
        return;
    }
    
    operations.forEach(op => {
        const tr = document.createElement('tr');
        
        let badgeClass = 'badge-egreso';
        let badgeLabel = 'Egreso';
        let color = 'var(--red)';
        let sign = '-';
        
        if (op.tipo === 'ingreso') {
            badgeClass = 'badge-ingreso';
            badgeLabel = 'Ingreso';
            color = 'var(--emerald)';
            sign = '+';
        } else if (op.tipo === 'traspaso') {
            badgeClass = '';
            badgeLabel = 'Traspaso';
            color = '#4f46e5';
            sign = '';
        }
        
        const formattedDate = op.fecha.split('-').reverse().join('/');
        
        const isDeletable = op.origen === 'Externo' || op.origen === 'Socios & Capital';
        const deleteButton = isDeletable ? 
            `<button onclick="deleteManualMove('${op.id}')" title="Eliminar Movimiento" style="background:none; border:none; color:var(--red); cursor:pointer; padding:0; margin-left:10px; font-weight:bold; font-size:14px;">✕</button>` : 
            '';
            
        const isSystemGenerated = op.id && (op.id.startsWith('mov_com_') || op.id.startsWith('mov_nom_') || op.id.startsWith('mov_soc_'));
        const editButton = (op.origen === 'Externo' && !isSystemGenerated) ? 
            `<button onclick="openEditMoveModalById('${op.id}')" title="Editar Movimiento" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0; margin-left:8px; font-size:13px;">✏️</button>` : 
            '';
            
        tr.innerHTML = `
            <td style="padding: 10px;">${formattedDate}</td>
            <td style="padding: 10px; font-weight: 500;">${escapeHTML(op.origen)}</td>
            <td style="padding: 10px;">
                <span class="badge ${badgeClass}" style="${op.tipo === 'traspaso' ? 'background-color: #4f46e5; color: white;' : ''}">${badgeLabel}</span>
            </td>
            <td style="padding: 10px;"><strong>${escapeHTML(op.concepto)}</strong></td>
            <td style="padding: 10px; color: var(--text-muted); font-size: 13px;">${escapeHTML(op.referencia)}</td>
            <td style="padding: 10px; text-align: right; font-weight: 600; color: ${color}; display: flex; justify-content: flex-end; align-items: center; box-sizing: border-box; height: 38px;">
                <span>${sign}$${op.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                ${editButton}
                ${deleteButton}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Agregar Cuenta
function openAddAccountModal() {
    document.getElementById('add-account-name').value = '';
    document.getElementById('add-account-number').value = '';
    document.getElementById('add-account-balance').value = '0.00';
    document.getElementById('add-account-modal').classList.add('active');
}

function closeAddAccountModal() {
    document.getElementById('add-account-modal').classList.remove('active');
}

async function submitAddAccount() {
    const nombre = document.getElementById('add-account-name').value;
    const numeroCuenta = document.getElementById('add-account-number').value;
    const saldo = parseFloat(document.getElementById('add-account-balance').value) || 0;
    
    try {
        const res = await fetch('/api/cuentas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, numeroCuenta, saldo })
        });
        
        const data = await res.json();
        if (data.success) {
            closeAddAccountModal();
            await init();
        } else {
            alert(data.error || "Fallo al crear la nueva cuenta.");
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    }
}

// Eliminar un movimiento manual externo
async function deleteManualMove(id) {
    showConfirmModal(
        "Eliminar Movimiento",
        "¿Estás seguro de que deseas eliminar este movimiento? Se revertirá automáticamente su efecto en el saldo de las cuentas bancarias.",
        async () => {
            try {
                const res = await fetch(`/api/movimientos-manuales/${id}`, {
                    method: 'DELETE'
                });
                
                const data = await res.json();
                if (data.success) {
                    await init();
                } else {
                    alert(data.error || "Fallo al eliminar el movimiento.");
                }
            } catch (e) {
                alert("Error de red: " + e.message);
            }
        }
    );
}

// Buscar y abrir modal de edición por ID
function openEditMoveModalById(id) {
    let m = (databaseState.movimientosManuales || []).find(item => item.id === id);
    if (!m && window.currentOperations) {
        const op = window.currentOperations.find(item => item.id === id);
        if (op) {
            m = {
                id: op.id,
                concepto: op.concepto,
                tipo: op.tipoOriginal || (op.tipo === 'ingreso' ? 'I' : (op.tipo === 'egreso' ? 'E' : 'T')),
                importe: op.importe,
                fecha: op.fecha,
                cuentaId: op.cuentaId || '',
                cuentaOrigenId: op.cuentaOrigenId || '',
                cuentaDestinoId: op.cuentaDestinoId || ''
            };
        }
    }
    if (!m) {
        alert("No se pudo cargar la información de este movimiento.");
        return;
    }
    openEditMoveModal(m.id, m.concepto, m.tipo, m.importe, m.fecha, m.cuentaId || '', m.cuentaOrigenId || '', m.cuentaDestinoId || '');
}

// Modal Editar Movimiento Manual
function openEditMoveModal(id, concepto, tipo, importe, fecha, cuentaId, cuentaOrigenId, cuentaDestinoId) {
    document.getElementById('edit-move-id').value = id;
    document.getElementById('edit-move-concept').value = concepto;
    document.getElementById('edit-move-type').value = tipo;
    document.getElementById('edit-move-amount').value = importe;
    document.getElementById('edit-move-date').value = fecha;
    
    // Poblar selects
    const select = document.getElementById('edit-move-account');
    select.innerHTML = '';
    const selectFrom = document.getElementById('edit-move-account-from');
    selectFrom.innerHTML = '';
    const selectTo = document.getElementById('edit-move-account-to');
    selectTo.innerHTML = '';
    
    databaseState.cuentas.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nombre;
        select.appendChild(opt.cloneNode(true));
        selectFrom.appendChild(opt.cloneNode(true));
        selectTo.appendChild(opt.cloneNode(true));
    });
    
    const groupSingle = document.getElementById('group-edit-move-account');
    const groupTransfer = document.getElementById('group-edit-transfer-accounts');
    
    if (tipo === 'T') {
        groupSingle.style.display = 'none';
        groupTransfer.style.display = 'flex';
        document.getElementById('edit-move-account-from').value = cuentaOrigenId;
        document.getElementById('edit-move-account-to').value = cuentaDestinoId;
        document.getElementById('edit-move-account').required = false;
        document.getElementById('edit-move-account-from').required = true;
        document.getElementById('edit-move-account-to').required = true;
    } else {
        groupSingle.style.display = 'block';
        groupTransfer.style.display = 'none';
        document.getElementById('edit-move-account').value = cuentaId;
        document.getElementById('edit-move-account').required = true;
        document.getElementById('edit-move-account-from').required = false;
        document.getElementById('edit-move-account-to').required = false;
    }
    
    document.getElementById('edit-move-modal').classList.add('active');
}

function closeEditMoveModal() {
    document.getElementById('edit-move-modal').classList.remove('active');
}

async function submitEditMove() {
    const id = document.getElementById('edit-move-id').value;
    const concepto = document.getElementById('edit-move-concept').value;
    const tipo = document.getElementById('edit-move-type').value;
    const importe = parseFloat(document.getElementById('edit-move-amount').value) || 0;
    const fecha = document.getElementById('edit-move-date').value;
    
    const payload = { concepto, tipo, importe, fecha };
    
    if (tipo === 'T') {
        payload.cuentaOrigenId = document.getElementById('edit-move-account-from').value;
        payload.cuentaDestinoId = document.getElementById('edit-move-account-to').value;
        if (payload.cuentaOrigenId === payload.cuentaDestinoId) {
            alert("La cuenta origen y destino de un traspaso deben ser diferentes.");
            return;
        }
    } else {
        payload.cuentaId = document.getElementById('edit-move-account').value;
    }
    
    try {
        const res = await fetch(`/api/movimientos-manuales/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (data.success) {
            closeEditMoveModal();
            await init();
        } else {
            alert(data.error || "Fallo al modificar el movimiento.");
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    }
}

// Escuchar cambios de tipo en modal editar movimiento
document.getElementById('edit-move-type').addEventListener('change', (e) => {
    const tipo = e.target.value;
    const groupSingle = document.getElementById('group-edit-move-account');
    const groupTransfer = document.getElementById('group-edit-transfer-accounts');
    
    if (tipo === 'T') {
        groupSingle.style.display = 'none';
        groupTransfer.style.display = 'flex';
        document.getElementById('edit-move-account').required = false;
        document.getElementById('edit-move-account-from').required = true;
        document.getElementById('edit-move-account-to').required = true;
    } else {
        groupSingle.style.display = 'block';
        groupTransfer.style.display = 'none';
        document.getElementById('edit-move-account').required = true;
        document.getElementById('edit-move-account-from').required = false;
        document.getElementById('edit-move-account-to').required = false;
    }
});

// Sub-tab Navigation for Personal & Socios
function switchSubTab(subtabId) {
    document.querySelectorAll('.subtab-pane').forEach(pane => {
        pane.style.display = 'none';
    });
    document.getElementById(`subtab-${subtabId}`).style.display = 'block';
    
    // update buttons styling
    const buttons = document.querySelectorAll('#tab-personal-socios .subnav-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${subtabId}'`)) {
            btn.className = 'btn btn-emerald subnav-btn active';
        } else {
            btn.className = 'btn btn-secondary subnav-btn';
        }
    });

    if (subtabId === 'nomina') {
        fetchNominas();
    } else if (subtabId === 'comisiones') {
        fetchComisionesCortes();
    } else if (subtabId === 'socios') {
        fetchSocios();
        fetchSocioMovimientos();
    } else if (subtabId === 'cobrar') {
        fetchCxr();
    } else if (subtabId === 'pagar') {
        fetchCxp();
    } else if (subtabId === 'app-users') {
        fetchAppUsers();
    }
}

// 1. NOMINA MODULE
async function fetchNominas() {
    try {
        const res = await fetch('/api/nominas');
        const nominas = await res.json();
        renderNominas(nominas);
    } catch(e) {
        console.error("Error cargando nominas", e);
    }
}

function renderNominas(nominas) {
    const tbody = document.getElementById('payroll-table-body');
    tbody.innerHTML = '';
    
    if (nominas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No hay nóminas registradas.</td></tr>`;
        return;
    }
    
    [...nominas].reverse().forEach(n => {
        const tr = document.createElement('tr');
        const acc = databaseState.cuentas.find(c => c.id === n.cuentaId);
        const accName = acc ? acc.nombre : n.cuentaId;
        const formattedDate = n.fechaPago.split('-').reverse().join('/');
        const formattedStart = n.periodoInicio.split('-').reverse().join('/');
        const formattedEnd = n.periodoFin.split('-').reverse().join('/');
        
        tr.innerHTML = `
            <td>${formattedDate}</td>
            <td><strong>${n.empleado}</strong></td>
            <td>${formattedStart} al ${formattedEnd}</td>
            <td><span style="font-size:12px; color:var(--text-muted);">${accName}</span></td>
            <td style="text-align:right; font-weight:600; color:var(--red)">-$${n.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function submitPayroll(event) {
    event.preventDefault();
    const empleado = document.getElementById('pay-employee').value;
    const periodoInicio = document.getElementById('pay-date-start').value;
    const periodoFin = document.getElementById('pay-date-end').value;
    const importe = document.getElementById('pay-amount').value;
    const cuentaId = document.getElementById('pay-account').value;
    const fechaPago = document.getElementById('pay-date').value;
    
    try {
        const res = await fetch('/api/nominas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empleado, periodoInicio, periodoFin, importe, cuentaId, fechaPago })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('payroll-form').reset();
            document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
            await init();
            await fetchNominas();
        } else {
            alert(data.error || "Error al registrar nómina");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

// 2. COMISIONES MODULE
async function fetchComisionesCortes() {
    try {
        const res = await fetch('/api/cortes?limit=50');
        const data = await res.json();
        
        const resCom = await fetch('/api/historial-operaciones?source=mybusiness');
        const dbCom = await fetch('/api/movimientos-manuales');
        const manualMoves = await dbCom.json();
        
        // Determinar qué cortes ya tienen comisiones liquidadas
        const paidCuts = new Set();
        manualMoves.forEach(m => {
            if (m.concepto && m.concepto.includes("Comisiones Liquidadas de Corte Z #")) {
                const match = m.concepto.match(/#(\d+)/);
                if (match) paidCuts.add(parseInt(match[1]));
            }
        });
        
        // Renderizar cortes pendientes (solo los que ya están conciliados pero con comisiones pendientes)
        const cutsBody = document.getElementById('commissions-cuts-body');
        cutsBody.innerHTML = '';
        
        const pendingCortes = data.cortes.filter(c => c.conciliado && !paidCuts.has(c.numeroCorte));
        
        if (pendingCortes.length === 0) {
            cutsBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">No hay comisiones pendientes por liquidar.</td></tr>`;
        } else {
            pendingCortes.forEach(c => {
                const fechaFormatted = new Date(c.usufecha).toLocaleDateString('es-MX', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                });
                
                tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>Corte Z #${c.numeroCorte}</strong></td>
                    <td>${fechaFormatted}</td>
                    <td>${c.estacion.trim()}</td>
                    <td>$${c.totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                        <button class="btn btn-emerald btn-sm" onclick="openCommissionLiquidationFromId(${c.numeroCorte})" style="padding:4px 8px; font-size:12px;">Liquidar</button>
                    </td>
                `;
                cutsBody.appendChild(tr);
            });
        }
        
        // Renderizar historial de comisiones pagadas
        const histBody = document.getElementById('commissions-history-body');
        histBody.innerHTML = '';
        
        const paidMoves = manualMoves.filter(m => m.concepto && m.concepto.includes("Comisiones Liquidadas de Corte Z #"));
        if (paidMoves.length === 0) {
            histBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted)">No hay liquidaciones en el historial.</td></tr>`;
        } else {
            paidMoves.reverse().forEach(m => {
                const match = m.concepto.match(/#(\d+)/);
                const cutNum = match ? match[1] : 'N/A';
                const formattedDate = m.fecha.split('-').reverse().join('/');
                const acc = databaseState.cuentas.find(c => c.id === m.cuentaId);
                const accName = acc ? acc.nombre : m.cuentaId;
                
                tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formattedDate}</td>
                    <td>Corte Z #${cutNum}</td>
                    <td>Comisiones</td>
                    <td>Varios</td>
                    <td>10%/15%</td>
                    <td>${accName}</td>
                    <td style="text-align:right; font-weight:600; color:var(--red)">-$${m.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                `;
                histBody.appendChild(tr);
            });
        }
    } catch(e) {
        console.error("Error fetching commissions details", e);
    }
}

async function openCommissionLiquidationFromId(numeroCorte) {
    try {
        const res = await fetch(`/api/cortes/${numeroCorte}`);
        const corte = await res.json();
        
        const modal = document.getElementById('reconcile-commissions-modal');
        const tbody = document.getElementById('reconcile-commissions-tbody');
        tbody.innerHTML = '';
        
        // Guardar corte actual globalmente
        window.activeCommissionCorte = corte;
        
        if (!corte.vendedores || corte.vendedores.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted)">Este corte no contiene cobros de vendedores.</td></tr>`;
            modal.classList.add('active');
            return;
        }
        
        // Fetch active sellers from catalog
        const vendsRes = await fetch('/api/vendedores');
        const activeSellers = await vendsRes.json();
        
        window.activeSellersList = activeSellers;

        // Obtener nombres de vendedores de este corte para agruparlos
        const corteSellersSet = new Set(corte.vendedores.map(v => v.vendedor));

        let sellersOptions = '<option value="">-- Mismo Vendedor --</option>';
        
        // 1. Grupo de vendedores en el corte
        sellersOptions += '<optgroup label="Vendedores de este corte">';
        corte.vendedores.forEach(v => {
            sellersOptions += `<option value="${v.vendedor}">${v.vendedor}</option>`;
        });
        sellersOptions += '</optgroup>';
 
        // 2. Grupo de otros vendedores activos en la empresa
        const otherSellers = activeSellers.filter(s => !corteSellersSet.has(s.Vend));
        if (otherSellers.length > 0) {
            sellersOptions += '<optgroup label="Otros vendedores activos">';
            otherSellers.forEach(s => {
                sellersOptions += `<option value="${s.Vend}">${s.Nombre} (${s.Vend})</option>`;
            });
            sellersOptions += '</optgroup>';
        }
        
        window.commissionSellersOptions = sellersOptions;
        
        let accountOptions = '';
        // Filtrar solo cuentas activas
        databaseState.cuentas.filter(c => c.activa !== false).forEach(c => {
            const selected = c.id === 'efectivo' ? 'selected' : '';
            accountOptions += `<option value="${c.id}" ${selected}>${c.nombre}</option>`;
        });
        
        window.commissionAccountOptions = accountOptions;
        
        corte.vendedores.forEach((v, index) => {
            const baseAmount = v.cobrado;
            const comisionSugerida = baseAmount * 0.10;
            
            const tr = document.createElement('tr');
            tr.className = 'commission-row';
            tr.setAttribute('data-type', 'automatic');
            tr.setAttribute('data-index', index);
            
            tr.innerHTML = `
                <td><strong>${v.vendedor}</strong></td>
                <td>$${baseAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>
                    <select class="comm-pct-select" data-index="${index}" onchange="recalculateRowCommission(${index})" style="padding:4px; font-size:12px;">
                        <option value="10" selected>10%</option>
                        <option value="15">15%</option>
                        <option value="5">5%</option>
                        <option value="0">0%</option>
                    </select>
                </td>
                <td>
                    <select class="comm-beneficiary-select" data-index="${index}" style="padding:4px; font-size:12px; width:120px;">
                        ${sellersOptions}
                    </select>
                </td>
                <td style="text-align:right;">
                    $<input type="number" class="comm-amount-input" data-index="${index}" value="${comisionSugerida.toFixed(2)}" step="0.01" style="width: 75px; text-align: right; padding: 4px; font-size: 12px; box-sizing: border-box;">
                </td>
                <td>
                    <select class="comm-account-select" data-index="${index}" style="padding:4px; font-size:12px; width:120px;">
                        ${accountOptions}
                    </select>
                </td>
                <td style="text-align: center;">
                    <!-- Los automáticos no se borran individualmente, solo con el corte -->
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        modal.classList.add('active');
    } catch(e) {
        alert("Error cargando comisiones del corte: " + e.message);
    }
}

function recalculateRowCommission(index) {
    const corte = window.activeCommissionCorte;
    const v = corte.vendedores[index];
    const pct = parseFloat(document.querySelector(`.comm-pct-select[data-index="${index}"]`).value) || 0;
    const calc = v.cobrado * (pct / 100);
    document.querySelector(`.comm-amount-input[data-index="${index}"]`).value = calc.toFixed(2);
}

function addExtraCommissionRow() {
    const tbody = document.getElementById('reconcile-commissions-tbody');
    
    let extraSellersOptions = '<option value="" disabled selected>-- Selecciona vendedor --</option>';
    if (window.activeSellersList) {
        window.activeSellersList.forEach(s => {
            extraSellersOptions += `<option value="${s.Vend}">${s.Nombre} (${s.Vend})</option>`;
        });
    }
    
    const tr = document.createElement('tr');
    tr.className = 'commission-row';
    tr.setAttribute('data-type', 'manual');
    
    tr.innerHTML = `
        <td><span style="color:var(--text-muted); font-style:italic;">Extra (Ayudante)</span></td>
        <td>$0.00</td>
        <td>
            <select class="comm-pct-select" disabled style="padding:4px; font-size:12px; opacity:0.5;">
                <option value="0" selected>Personalizado</option>
            </select>
        </td>
        <td>
            <select class="comm-beneficiary-select" style="padding:4px; font-size:12px; width:120px;">
                ${extraSellersOptions}
            </select>
        </td>
        <td style="text-align:right;">
            $<input type="number" class="comm-amount-input" value="0.00" step="0.01" style="width: 75px; text-align: right; padding: 4px; font-size: 12px; box-sizing: border-box;">
        </td>
        <td>
            <select class="comm-account-select" style="padding:4px; font-size:12px; width:120px;">
                ${window.commissionAccountOptions || ''}
            </select>
        </td>
        <td style="text-align: center;">
            <button type="button" onclick="this.closest('tr').remove()" style="background: none; border: none; color: var(--red); font-size: 16px; cursor: pointer; font-weight: bold; padding: 0;">✕</button>
        </td>
    `;
    tbody.appendChild(tr);
}

function closeReconcileCommissionsModal() {
    document.getElementById('reconcile-commissions-modal').classList.remove('active');
    window.activeCommissionCorte = null;
    window.activeSellersList = null;
    window.commissionSellersOptions = null;
    window.commissionAccountOptions = null;
}

async function submitReconcileCommissions() {
    if (!window.activeCommissionCorte) return;
    const corte = window.activeCommissionCorte;
    const comisiones = [];
    let hasError = false;
    
    document.querySelectorAll('#reconcile-commissions-tbody .commission-row').forEach((row) => {
        const type = row.getAttribute('data-type');
        
        let cobrador = '';
        let base = 0;
        let pct = 0;
        
        if (type === 'automatic') {
            const index = parseInt(row.getAttribute('data-index'));
            const v = corte.vendedores[index];
            cobrador = v.vendedor;
            base = v.cobrado;
            pct = parseFloat(row.querySelector('.comm-pct-select').value) || 0;
        } else {
            cobrador = 'Extra';
            base = 0;
            pct = 0;
        }
        
        const benefSelect = row.querySelector('.comm-beneficiary-select').value;
        if (!benefSelect && type === 'manual') {
            alert("Por favor, selecciona un vendedor destinatario para el comisionado extra.");
            hasError = true;
            return;
        }
        
        const beneficiario = benefSelect || cobrador;
        const comision = parseFloat(row.querySelector('.comm-amount-input').value) || 0;
        const cuentaId = row.querySelector('.comm-account-select').value;
        
        if (comision < 0) {
            alert("El importe de la comisión no puede ser negativo.");
            hasError = true;
            return;
        }
        
        if (comision > 0) {
            comisiones.push({
                cobrador: cobrador || beneficiario,
                beneficiario,
                porcentaje: pct,
                base,
                comision,
                cuentaId
            });
        }
    });
    
    if (hasError) return;
    
    if (comisiones.length === 0) {
        alert("No hay comisiones mayores a $0 para registrar.");
        return;
    }
    
    try {
        const res = await fetch(`/api/cortes/${corte.corte.numeroCorte}/liquidar-comisiones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comisiones })
        });
        const data = await res.json();
        if (data.success) {
            closeReconcileCommissionsModal();
            await init();
            await fetchComisionesCortes();
        } else {
            alert(data.error || "Fallo al registrar comisiones");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

// 3. SOCIOS & CAPITAL MODULE
async function fetchSocios() {
    try {
        const res = await fetch('/api/socios');
        const socios = await res.json();
        window.currentSocios = socios;
        renderSocios(socios);
        populateSociosDropdowns(socios);
    } catch(e) {
        console.error("Error cargando socios", e);
    }
}

function renderSocios(socios) {
    const tbody = document.getElementById('partners-table-body');
    tbody.innerHTML = '';
    
    if (socios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted)">No hay socios registrados.</td></tr>`;
        return;
    }
    
    socios.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${s.nombre}</strong></td>
            <td>${s.porcentaje}%</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="editPartner('${s.id}', '${s.nombre}', ${s.porcentaje})" style="padding:2px 6px; font-size:11px;">Editar</button>
                <button class="btn btn-danger btn-sm" onclick="deletePartner('${s.id}', '${s.nombre}')" style="padding:2px 6px; font-size:11px; margin-left:4px;">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateSociosDropdowns(socios) {
    const dropdown = document.getElementById('with-partner');
    dropdown.innerHTML = '';
    
    socios.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.dataset.nombre = s.nombre;
        opt.innerText = `${s.nombre} (${s.porcentaje}%)`;
        dropdown.appendChild(opt);
    });
}

function editPartner(id, nombre, porcentaje) {
    document.getElementById('partner-id').value = id;
    document.getElementById('partner-name').value = nombre;
    document.getElementById('partner-percentage').value = porcentaje;
}

function deletePartner(id, nombre) {
    showConfirmModal(
        "Eliminar Socio",
        `¿Estás seguro de que deseas eliminar al socio "${nombre}"?`,
        async () => {
            try {
                const res = await fetch(`/api/socios/${id}`, {
                    method: 'DELETE'
                });
                
                // Si el servidor responde con error HTML (ej: no se ha reiniciado el server)
                const contentType = res.headers.get("content-type");
                if (!res.ok || (contentType && !contentType.includes("application/json"))) {
                    throw new Error("El servidor respondió con un error. Por favor, asegúrate de haber cerrado y vuelto a iniciar el servidor (Iniciar_Avyna.bat).");
                }

                const data = await res.json();
                if (data.success) {
                    await fetchSocios();
                } else {
                    alert(data.error || "Error al eliminar socio");
                }
            } catch(e) {
                alert("Error al intentar eliminar: " + e.message);
            }
        }
    );
}

async function submitPartner(event) {
    event.preventDefault();
    const id = document.getElementById('partner-id').value;
    const nombre = document.getElementById('partner-name').value;
    const porcentaje = document.getElementById('partner-percentage').value;
    
    try {
        const res = await fetch('/api/socios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, nombre, porcentaje })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('partner-form').reset();
            document.getElementById('partner-id').value = '';
            await fetchSocios();
        } else {
            alert(data.error || "Error al guardar socio");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

async function fetchSocioMovimientos() {
    try {
        const res = await fetch('/api/socios/movimientos');
        const moves = await res.json();
        renderSocioMovimientos(moves);
    } catch(e) {
        console.error("Error cargando movimientos de socios", e);
    }
}

function renderSocioMovimientos(moves) {
    const tbody = document.getElementById('partner-moves-table-body');
    tbody.innerHTML = '';
    
    if (moves.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay movimientos registrados.</td></tr>`;
        return;
    }
    
    [...moves].reverse().forEach(m => {
        const tr = document.createElement('tr');
        const formattedDate = m.fecha.split('-').reverse().join('/');
        const acc = databaseState.cuentas.find(c => c.id === m.cuentaId);
        const accName = acc ? acc.nombre : m.cuentaId;
        const tipoLabel = m.tipoSocio === 'reparto_utilidad' ? 'Reparto de Utilidad' : 'Retiro Libre';
        const badgeColor = m.tipoSocio === 'reparto_utilidad' ? '#4f46e5' : '#e11d48';
        
        tr.innerHTML = `
            <td>${formattedDate}</td>
            <td><strong>${m.socioNombre}</strong></td>
            <td><span class="badge" style="background-color:${badgeColor}; color:white; font-size:10px; padding:2px 6px;">${tipoLabel}</span></td>
            <td><span style="font-size:12px; color:var(--text-muted);">${accName}</span></td>
            <td>${m.comentarios}</td>
            <td style="text-align:right; font-weight:600; color:var(--red)">-$${m.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align:center;">
                <button onclick="deleteManualMove('mov_soc_${m.id}')" class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:11px;">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Reparto de Utilidades Previsualizar & Ejecutar
async function previewUtilityDistribution() {
    const start = document.getElementById('dist-date-start').value;
    const end = document.getElementById('dist-date-end').value;
    
    if (!start || !end) {
        alert("Por favor selecciona un rango de fechas.");
        return;
    }
    
    try {
        const res = await fetch(`/api/reporte-mensual?cortesFilter=todos&start=${start}&end=${end}`);
        const data = await res.json();
        
        const preview = document.getElementById('dist-utility-preview');
        preview.innerHTML = `
            <strong>Utilidad del Periodo:</strong> <span style="color:var(--emerald); font-weight:600;">$${data.utilidadNeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><br>
            <span style="font-size:11px; color:var(--text-muted);">Costo: $${data.totalCosto.toLocaleString('es-MX')} | Egresos: $${data.totalEgresos.toLocaleString('es-MX')}</span>
        `;
        preview.style.display = 'block';
        
        // Guardar utilidad actual
        window.activeUtilityForDistribution = data.utilidadNeta;
        
        // Habilitar sección de distribución
        document.getElementById('dist-execution-section').style.display = 'block';
        document.getElementById('dist-total-amount').value = data.utilidadNeta.toFixed(2);
        calculateSocioDistributionShares();
    } catch(e) {
        alert("Error consultando utilidad: " + e.message);
    }
}

function calculateSocioDistributionShares() {
    const totalDist = parseFloat(document.getElementById('dist-total-amount').value) || 0;
    const container = document.getElementById('dist-socios-shares-container');
    container.innerHTML = '';
    
    if (!window.currentSocios || window.currentSocios.length === 0) {
        container.innerHTML = '<p style="color:var(--red)">No hay socios registrados para dividir la utilidad.</p>';
        return;
    }
    
    let accountOptions = '';
    databaseState.cuentas.forEach(c => {
        accountOptions += `<option value="${c.id}">${c.nombre}</option>`;
    });
    
    window.currentSocios.forEach((s, index) => {
        const share = totalDist * (s.porcentaje / 100);
        
        const div = document.createElement('div');
        div.className = 'socio-share-row';
        div.style.display = 'grid';
        div.style.gridTemplateColumns = '1.2fr 1fr 1.2fr';
        div.style.gap = '10px';
        div.style.alignItems = 'center';
        div.style.marginBottom = '10px';
        
        div.innerHTML = `
            <span><strong>${s.nombre} (${s.porcentaje}%)</strong></span>
            <input type="number" class="socio-share-input" data-id="${s.id}" data-nombre="${s.nombre}" value="${share.toFixed(2)}" step="0.01" style="padding:6px; font-size:13px; text-align:right;">
            <select class="socio-share-account" data-id="${s.id}" style="padding:6px; font-size:13px;">
                ${accountOptions}
            </select>
        `;
        container.appendChild(div);
    });
}

async function executeUtilityDistribution() {
    const start = document.getElementById('dist-date-start').value;
    const end = document.getElementById('dist-date-end').value;
    const period = `${start.split('-').reverse().join('/')} al ${end.split('-').reverse().join('/')}`;
    
    const repartos = [];
    document.querySelectorAll('.socio-share-row').forEach(row => {
        const input = row.querySelector('.socio-share-input');
        const select = row.querySelector('.socio-share-account');
        const socioId = input.getAttribute('data-id');
        const socioNombre = input.getAttribute('data-nombre');
        const importe = parseFloat(input.value) || 0;
        const cuentaId = select.value;
        
        repartos.push({ socioId, socioNombre, importe, cuentaId });
    });
    
    try {
        const res = await fetch('/api/socios/repartir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repartos,
                periodoAsociado: period,
                utilidadPeriodo: window.activeUtilityForDistribution || 0
            })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('dist-execution-section').style.display = 'none';
            document.getElementById('dist-utility-preview').style.display = 'none';
            document.getElementById('dist-total-amount').value = '';
            await init();
            await fetchSocioMovimientos();
        } else {
            alert(data.error || "Fallo al ejecutar el reparto.");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

async function submitPartnerWithdrawal(event) {
    event.preventDefault();
    const select = document.getElementById('with-partner');
    const socioId = select.value;
    const socioNombre = select.options[select.selectedIndex].getAttribute('data-nombre');
    const importe = document.getElementById('with-amount').value;
    const cuentaId = document.getElementById('with-account').value;
    const comentarios = document.getElementById('with-comments').value;
    
    try {
        const res = await fetch('/api/socios/retiro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ socioId, socioNombre, importe, cuentaId, comentarios })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('partner-withdrawal-form').reset();
            await init();
            await fetchSocioMovimientos();
        } else {
            alert(data.error || "Error al registrar retiro");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

// Rellenar selectores de cuentas al iniciar
function populateFormAccountDropdowns() {
    const accounts = databaseState.cuentas.filter(c => c.activa !== false);
    const dropdowns = ['pay-account', 'with-account'];
    
    dropdowns.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';
        accounts.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = c.nombre;
            select.appendChild(opt);
        });
    });
}

// Re-hook init to load extra endpoints
const originalInit = init;
init = async function() {
    await originalInit();
    populateFormAccountDropdowns();
    // Default dates for distribute utility
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    document.getElementById('dist-date-start').value = firstDay;
    document.getElementById('dist-date-end').value = today;
    document.getElementById('pay-date').value = today;
    
    // Si la pestaña actual activa es personal-socios, refrescarla
    const activeTab = document.querySelector('.nav-btn.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'personal-socios') {
        const activeSubtabBtn = document.querySelector('#tab-personal-socios .subnav-btn.active');
        const subtab = activeSubtabBtn.innerText.toLowerCase().includes('nómina') ? 'nomina' : 
                       (activeSubtabBtn.innerText.toLowerCase().includes('comisiones') ? 'comisiones' : 
                       (activeSubtabBtn.innerText.toLowerCase().includes('socios') ? 'socios' : 
                       (activeSubtabBtn.innerText.toLowerCase().includes('cobrar') ? 'cobrar' : 'pagar')));
        switchSubTab(subtab);
    }
    
    if (document.getElementById('cxp-date')) {
        document.getElementById('cxp-date').value = today;
    }
};

// Escuchar click en el sidebar para inicializar subtab
document.querySelector('[data-tab="personal-socios"]').addEventListener('click', () => {
    switchSubTab('nomina');
});

// Custom Confirm Modal Helpers
let onConfirmCallback = null;

function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    onConfirmCallback = onConfirm;
    document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    onConfirmCallback = null;
}

document.getElementById('confirm-submit-btn').addEventListener('click', () => {
    if (onConfirmCallback) {
        onConfirmCallback();
    }
    closeConfirmModal();
});

// 4. CUENTAS POR COBRAR (CXR) MODULE
async function fetchCxr() {
    try {
        const res = await fetch('/api/deudas');
        const deudas = await res.json();
        databaseState.deudas = deudas;
        renderCxr(deudas);
    } catch(e) {
        console.error("Error cargando cuentas por cobrar", e);
    }
}

function renderCxr(deudas) {
    const summaryBody = document.getElementById('cxr-summary-tbody');
    const detailBody = document.getElementById('cxr-detail-tbody');
    if (!summaryBody || !detailBody) return;
    
    summaryBody.innerHTML = '';
    detailBody.innerHTML = '';
    
    // Agrupar saldos acumulados por vendedor (sólo pendientes)
    const saldosVendedores = {};
    deudas.forEach(d => {
        if (d.estado === 'pendiente') {
            const saldo = d.saldo !== undefined ? d.saldo : d.importe;
            saldosVendedores[d.vendedor] = (saldosVendedores[d.vendedor] || 0) + saldo;
        }
    });
    
    const vends = Object.keys(saldosVendedores);
    if (vends.length === 0) {
        summaryBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">No hay deudas de vendedores activas.</td></tr>`;
    } else {
        vends.forEach(v => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${v}</strong></td>
                <td style="text-align:right; font-weight:600; color:var(--red)">$${saldosVendedores[v].toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            `;
            summaryBody.appendChild(tr);
        });
    }
    
    // Renderizar detalles individuales
    if (deudas.length === 0) {
        detailBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No hay registros de deudas.</td></tr>`;
        return;
    }
    
    [...deudas].reverse().forEach(d => {
        const tr = document.createElement('tr');
        const esPendiente = d.estado === 'pendiente';
        const saldo = d.saldo !== undefined ? d.saldo : d.importe;
        const abonosSum = d.importe - saldo;
        
        let importeText = '';
        if (esPendiente) {
            if (abonosSum > 0.01) {
                importeText = `<span style="text-decoration: line-through; font-size:10px; color: var(--text-muted);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> <strong style="color: var(--red);">$${saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            } else {
                importeText = `<strong style="color: var(--red);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            }
        } else {
            if (abonosSum > 0.01) {
                importeText = `<span style="text-decoration: line-through; font-size:10px; color: var(--text-muted); font-weight: normal;">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> <strong style="color: var(--emerald);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            } else {
                importeText = `<strong style="color: var(--emerald);">$${d.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            }
        }
        
        tr.innerHTML = `
            <td>${d.fecha}</td>
            <td>Corte Z #${d.numeroCorte}</td>
            <td><strong>${d.vendedor}</strong></td>
            <td>${importeText}</td>
            <td><span class="badge badge-${esPendiente ? 'egreso' : 'ingreso'}">${esPendiente ? 'Pendiente' : 'Pagado'}</span></td>
            <td>
                ${esPendiente ? 
                    `<button class="btn btn-emerald btn-sm" onclick="openPayDebtModal('${d.id}', ${saldo})" style="padding: 2px 6px; font-size:11px;">Cobrar</button>` : 
                    `<span style="font-size:11px; color:var(--text-muted);">Cobrado</span>`
                }
            </td>
        `;
        detailBody.appendChild(tr);

        if (d.abonos && d.abonos.length > 0) {
            const trAbonos = document.createElement('tr');
            trAbonos.style.background = 'rgba(16, 185, 129, 0.04)';
            trAbonos.style.fontSize = '11px';
            
            let listHtml = '';
            d.abonos.forEach((ab, idx) => {
                const cuentaObj = databaseState.cuentas.find(c => c.id === ab.cuentaId);
                const cuentaName = cuentaObj ? cuentaObj.nombre : ab.cuentaId;
                listHtml += `<div style="margin-bottom: 2px; padding-left: 10px;">• <strong>Abono #${idx + 1} (${ab.fecha}):</strong> $${ab.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} recibido en <em>${cuentaName}</em></div>`;
            });
            
            trAbonos.innerHTML = `
                <td></td>
                <td colspan="5" style="padding: 6px 12px; border-left: 3px solid var(--emerald); color: var(--text);">
                    <div style="font-weight: bold; margin-bottom: 4px; color: var(--emerald);">Abonos registrados:</div>
                    ${listHtml}
                </td>
            `;
            detailBody.appendChild(trAbonos);
        }
    });
}

// 5. CUENTAS POR PAGAR (CXP) MODULE
let activeCXPId = null;

async function fetchCxp() {
    try {
        const res = await fetch('/api/cuentas-por-pagar');
        const cxp = await res.json();
        renderCxp(cxp);
    } catch(e) {
        console.error("Error cargando cuentas por pagar", e);
    }
}

function renderCxp(cxpList) {
    const tbody = document.getElementById('cxp-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (cxpList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No hay deudas por pagar registradas.</td></tr>`;
        return;
    }
    
    [...cxpList].reverse().forEach(c => {
        const tr = document.createElement('tr');
        const esPendiente = c.estado === 'pendiente';
        
        tr.innerHTML = `
            <td>${c.fecha.split('-').reverse().join('/')}</td>
            <td><strong>${c.acreedor}</strong></td>
            <td>${c.concepto}</td>
            <td style="font-weight:600; color:${esPendiente ? 'var(--red)' : 'var(--text-muted)'}">$${c.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td><span class="badge badge-${esPendiente ? 'egreso' : 'ingreso'}">${esPendiente ? 'Pendiente' : 'Pagado'}</span></td>
            <td>
                ${esPendiente ? 
                    `<button class="btn btn-emerald btn-sm" onclick="openPayCXPModal('${c.id}', ${c.importe})" style="padding: 2px 6px; font-size:11px;">Pagar</button>` : 
                    `<span style="font-size:11px; color:var(--text-muted);">Pagado</span>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function submitAddCuentaPorPagar() {
    const acreedor = document.getElementById('cxp-creditor').value;
    const concepto = document.getElementById('cxp-concept').value;
    const importe = document.getElementById('cxp-amount').value;
    const fecha = document.getElementById('cxp-date').value;
    
    if (!acreedor || !importe) return;
    
    try {
        const res = await fetch('/api/cuentas-por-pagar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acreedor, concepto, importe, fecha })
        });
        
        const data = await res.json();
        if (data.success) {
            document.getElementById('cxp-form').reset();
            document.getElementById('cxp-date').value = new Date().toISOString().split('T')[0];
            await fetchCxp();
            alert("Cuenta por pagar registrada con éxito.");
        } else {
            alert(data.error || "Fallo al registrar la cuenta por pagar");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

function openPayCXPModal(cxpId, amount) {
    activeCXPId = cxpId;
    document.getElementById('pay-cxp-amount').innerText = `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    
    // Llenar select de cuentas
    const select = document.getElementById('pay-cxp-account');
    select.innerHTML = '';
    databaseState.cuentas.filter(c => c.activa !== false).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nombre;
        select.appendChild(opt);
    });
    
    document.getElementById('pay-cxp-modal').classList.add('active');
}

function closePayCXPModal() {
    document.getElementById('pay-cxp-modal').classList.remove('active');
    activeCXPId = null;
}

async function submitPayCXP() {
    if (!activeCXPId) return;
    const cuentaId = document.getElementById('pay-cxp-account').value;
    
    try {
        const res = await fetch(`/api/cuentas-por-pagar/${activeCXPId}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cuentaId })
        });
        
        const data = await res.json();
        if (data.success) {
            closePayCXPModal();
            await init();
            await fetchCxp();
        } else {
            alert(data.error || "Fallo al pagar la deudor.");
        }
    } catch(e) {
        alert("Error de red: " + e.message);
    }
}

async function fetchBitacora() {
    try {
        const res = await fetch('/api/bitacora');
        if (!res.ok) return;
        const logs = await res.json();
        
        const tbody = document.getElementById('bitacora-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay acciones registradas en la bitácora.</td></tr>`;
            return;
        }
        
        logs.forEach(log => {
            const tr = document.createElement('tr');
            const date = new Date(log.fecha);
            const formattedDate = date.toLocaleDateString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            }) + ' ' + date.toLocaleTimeString('es-MX', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            
            tr.innerHTML = `
                <td style="padding: 10px;">${formattedDate}</td>
                <td style="padding: 10px;"><strong>${escapeHTML(log.nombreUsuario)}</strong> <br><span style="font-size: 10px; color: var(--text-muted);">@${escapeHTML(log.usuario)}</span></td>
                <td style="padding: 10px;"><span class="badge" style="background-color: var(--primary); color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px;">${escapeHTML(log.accion)}</span></td>
                <td style="padding: 10px; font-size: 13px;">${escapeHTML(log.detalles)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Error al obtener la bitácora:", e);
    }
}

function viewCorteAuditLogs(numeroCorte) {
    const bitacoraBtn = document.getElementById('nav-btn-bitacora');
    if (bitacoraBtn) {
        bitacoraBtn.click();
        
        setTimeout(() => {
            const searchInput = document.getElementById('bitacora-search-input');
            if (searchInput) {
                searchInput.value = `#${numeroCorte}`;
                searchInput.dispatchEvent(new Event('input'));
            }
        }, 150);
    }
}

// Búsqueda en tiempo real de la Bitácora
document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'bitacora-search-input') {
        const term = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#bitacora-table-body tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }
});

// ==================== APP USERS MODULE ====================
let editingAppUserUsername = null;

async function fetchAppUsers() {
    try {
        const res = await fetch('/api/usuarios');
        if (!res.ok) return;
        const users = await res.json();
        renderAppUsers(users);
    } catch(e) {
        console.error("Error al cargar usuarios de la app", e);
    }
}

function renderAppUsers(users) {
    const tbody = document.getElementById('app-users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay usuarios registrados.</td></tr>`;
        return;
    }
    
    users.forEach(u => {
        const tr = document.createElement('tr');
        const isSelf = currentUser && currentUser.username.toLowerCase() === u.username.toLowerCase();
        
        const editBtn = `<button class="btn btn-secondary" onclick="editAppUser('${u.username}', '${u.nombre}', '${u.rol}')" style="padding: 2px 8px; font-size: 11px;">✏️ Editar</button>`;
        const deleteBtn = isSelf ? 
            `<span style="color: var(--text-muted); font-size: 11px;">(Actual)</span>` : 
            `<button class="btn btn-secondary" onclick="deleteAppUser('${u.username}')" style="background-color: var(--red); color: white; padding: 2px 8px; font-size: 11px;">🗑️ Eliminar</button>`;
        
        const roleLabel = u.rol === 'admin' ? 'Administrador' : u.rol === 'socio' ? 'Socio' : 'Auxiliar / Operador';
        
        tr.innerHTML = `
            <td style="padding: 8px;"><strong>@${u.username}</strong></td>
            <td style="padding: 8px;">${u.nombre}</td>
            <td style="padding: 8px;"><span class="badge" style="background-color: var(--border); color: var(--text); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${roleLabel}</span></td>
            <td style="padding: 8px; text-align: right; display: flex; gap: 5px; justify-content: flex-end;">
                ${editBtn}
                ${deleteBtn}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function submitAddAppUser() {
    const usernameInput = document.getElementById('app-user-username');
    const nameInput = document.getElementById('app-user-name');
    const roleSelect = document.getElementById('app-user-role');
    const passwordInput = document.getElementById('app-user-password');
    
    const username = usernameInput.value;
    const nombre = nameInput.value;
    const rol = roleSelect.value;
    const password = passwordInput.value;
    
    if (!editingAppUserUsername && (!password || password.length < 4)) {
        alert("La contraseña debe tener al menos 4 caracteres.");
        return;
    }
    if (editingAppUserUsername && password && password.length < 4) {
        alert("La contraseña debe tener al menos 4 caracteres.");
        return;
    }
    
    try {
        const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, nombre, rol, password })
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            alert(editingAppUserUsername ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
            cancelEditAppUser();
            await fetchAppUsers();
        } else {
            alert("Error: " + (data.error || "No se pudo registrar el usuario."));
        }
    } catch(e) {
        alert("Error de red al registrar usuario: " + e.message);
    }
}

function editAppUser(username, nombre, rol) {
    editingAppUserUsername = username;
    
    document.getElementById('app-user-form-title').innerText = "Editar Usuario";
    document.getElementById('app-user-submit-btn').innerText = "Guardar Cambios";
    
    const usernameInput = document.getElementById('app-user-username');
    usernameInput.value = username;
    usernameInput.disabled = true;
    
    document.getElementById('app-user-name').value = nombre;
    document.getElementById('app-user-role').value = rol;
    
    const passwordInput = document.getElementById('app-user-password');
    passwordInput.required = false;
    passwordInput.value = '';
    
    document.getElementById('app-user-password-help').style.display = 'inline';
    document.getElementById('app-user-cancel-edit-btn').style.display = 'inline-block';
}

function cancelEditAppUser() {
    editingAppUserUsername = null;
    
    document.getElementById('app-user-form-title').innerText = "Registrar Nuevo Usuario";
    document.getElementById('app-user-submit-btn').innerText = "Registrar Usuario";
    
    const usernameInput = document.getElementById('app-user-username');
    usernameInput.value = '';
    usernameInput.disabled = false;
    
    document.getElementById('app-user-name').value = '';
    document.getElementById('app-user-role').value = 'auxiliar';
    
    const passwordInput = document.getElementById('app-user-password');
    passwordInput.required = true;
    passwordInput.value = '';
    
    document.getElementById('app-user-password-help').style.display = 'none';
    document.getElementById('app-user-cancel-edit-btn').style.display = 'none';
}

async function deleteAppUser(username) {
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario @${username}? Esto revocará su acceso de inmediato.`)) {
        return;
    }
    
    try {
        const res = await fetch(`/api/usuarios/${username}`, {
            method: 'DELETE'
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            alert("Usuario eliminado correctamente.");
            await fetchAppUsers();
        } else {
            alert("Error: " + (data.error || "No se pudo eliminar el usuario."));
        }
    } catch(e) {
        alert("Error de red al eliminar usuario: " + e.message);
    }
}

// Inicialización al arrancar
checkAuth();
