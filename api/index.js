const express = require('express');
const app = require('../server.js');

// En Vercel Serverless, aseguramos la ruta explícita para la raíz '/'
app.get('/', (req, res) => {
    res.sendFile(require('path').join(__dirname, '../public/index.html'));
});

module.exports = app;
