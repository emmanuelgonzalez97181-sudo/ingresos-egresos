const http = require('http');

http.get('http://localhost:3000/api/cortes/159', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("=== API Response ===");
            console.log("Vendedores:", json.vendedores);
            console.log("Flujos:", json.flujos);
        } catch (e) {
            console.log("Error parseando respuesta JSON:", e.message);
            console.log("Datos crudos:", data);
        }
    });
}).on('error', (err) => {
    console.log("Error HTTP:", err.message);
});
