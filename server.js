// ============================================================
// PHONEGUARD PRO - SERVEUR BACKEND
// Installez Node.js puis lancez : node server.js
// ============================================================

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

const PORT = 3000;

// ============================================================
// BASE DE DONNEES EN MEMOIRE (simple, pas besoin de MySQL)
// ============================================================
const db = {
    devices: {
        "PHONE_001": {
            id:       "PHONE_001",
            name:     "Telephone Principal",
            locked:   false,
            command:  "",
            lat:      -18.9106,
            lng:      47.5322,
            lastSeen: null,
            events:   [],
            photos:   []
        }
    }
};

// ============================================================
// ROUTEUR HTTP
// ============================================================
const server = http.createServer(function(req, res) {

    const parsed  = url.parse(req.url, true);
    const route   = parsed.pathname;
    const query   = parsed.query;

    // CORS - autoriser toutes les origines
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end(); return;
    }

    // --------------------------------------------------------
    // GET /api/commands?device=PHONE_001
    // L'app telephone appelle ca toutes les 5 secondes
    // --------------------------------------------------------
    if (req.method === 'GET' && route === '/api/commands') {
        const devId = query.device;
        const dev   = db.devices[devId];
        if (!dev) { res.writeHead(404); res.end('{}'); return; }

        const cmd = dev.command || "";
        // Effacer la commande apres envoi
        dev.command  = "";
        dev.lastSeen = new Date().toISOString();

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ command: cmd }));
        return;
    }

    // --------------------------------------------------------
    // POST /api/location  { device, lat, lng }
    // --------------------------------------------------------
    if (req.method === 'POST' && route === '/api/location') {
        readBody(req, function(body) {
            try {
                const data = JSON.parse(body);
                const dev  = db.devices[data.device];
                if (dev) {
                    dev.lat      = data.lat;
                    dev.lng      = data.lng;
                    dev.lastSeen = new Date().toISOString();
                }
            } catch(e) {}
            res.writeHead(200); res.end('OK');
        });
        return;
    }

    // --------------------------------------------------------
    // POST /api/event  { device, event, message, lat, lng }
    // --------------------------------------------------------
    if (req.method === 'POST' && route === '/api/event') {
        readBody(req, function(body) {
            try {
                const data = JSON.parse(body);
                const dev  = db.devices[data.device];
                if (dev) {
                    dev.events.unshift({
                        type:    data.event,
                        message: data.message || data.event,
                        lat:     data.lat || dev.lat,
                        lng:     data.lng || dev.lng,
                        time:    new Date().toISOString()
                    });
                    // Garder seulement les 50 derniers evenements
                    if (dev.events.length > 50) dev.events.pop();
                    dev.lastSeen = new Date().toISOString();
                }
            } catch(e) {}
            res.writeHead(200); res.end('OK');
        });
        return;
    }

    // --------------------------------------------------------
    // POST /api/command  { device, command }
    // Envoyer une commande depuis le tableau de bord web
    // --------------------------------------------------------
    if (req.method === 'POST' && route === '/api/command') {
        readBody(req, function(body) {
            try {
                const data = JSON.parse(body);
                const dev  = db.devices[data.device];
                if (dev) {
                    dev.command = data.command;
                    if (data.command === 'lock')   dev.locked = true;
                    if (data.command === 'unlock') dev.locked = false;
                }
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ ok: true }));
            } catch(e) {
                res.writeHead(500); res.end('{}');
            }
        });
        return;
    }

    // --------------------------------------------------------
    // GET /api/status?device=PHONE_001
    // Etat complet d'un appareil pour le tableau de bord
    // --------------------------------------------------------
    if (req.method === 'GET' && route === '/api/status') {
        const dev = db.devices[query.device];
        if (!dev) { res.writeHead(404); res.end('{}'); return; }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(dev));
        return;
    }

    // --------------------------------------------------------
    // GET /api/devices
    // Liste tous les appareils
    // --------------------------------------------------------
    if (req.method === 'GET' && route === '/api/devices') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(Object.values(db.devices)));
        return;
    }

    // --------------------------------------------------------
    // Toute autre route = servir le tableau de bord HTML
    // --------------------------------------------------------
    const htmlFile = path.join(__dirname, 'dashboard.html');
    if (fs.existsSync(htmlFile)) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(fs.readFileSync(htmlFile));
    } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h1>PhoneGuard - Serveur actif</h1><p>dashboard.html introuvable</p>');
    }
});

// ============================================================
// UTILITAIRE : lire le body d'une requete POST
// ============================================================
function readBody(req, callback) {
    let body = '';
    req.on('data', function(chunk) { body += chunk.toString(); });
    req.on('end',  function()      { callback(body); });
}

// ============================================================
// DEMARRAGE
// ============================================================
server.listen(PORT, function() {
    console.log('===========================================');
    console.log(' PhoneGuard Serveur actif sur port ' + PORT);
    console.log(' Tableau de bord : http://localhost:' + PORT);
    console.log('===========================================');
});
