const http = require('http');

http.get('http://localhost:3000/api/reporte-mensual?start=2026-05-01&end=2026-05-31&cortesFilter=todos', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("API Response:\n", data);
    });
}).on('error', (err) => {
    console.error("Request failed:", err.message);
});
