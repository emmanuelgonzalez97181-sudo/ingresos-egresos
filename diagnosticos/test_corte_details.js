const http = require('http');

http.get('http://localhost:3000/api/reporte-mensual?cortesFilter=todos&start=2026-06-21&end=2026-06-27', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            console.log("=== REPORTE MENSUAL API RESPONSE ===");
            console.log("Total Ingresos:", parsed.totalIngresos);
            console.log("Total Costo:", parsed.totalCosto);
            console.log("Utilidad Bruta:", parsed.utilidadBruta);
            console.log("Utilidad Neta:", parsed.utilidadNeta);
            console.log("\nCortes detalle:");
            console.log(parsed.cortesDetalle);
        } catch (e) {
            console.error("Error parsing response:", e.message);
        }
    });
}).on('error', (err) => {
    console.error("Error fetching:", err.message);
});
