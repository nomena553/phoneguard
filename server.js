const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = process.env.PORT || 3000;

// ============================================================
// MOTS DE PASSE â€” CHANGEZ CES VALEURS !
// ============================================================
const ADMIN_PASSWORD  = "Nomenamino261admin";  // Mot de passe page /admin
const DEVICE_PASSWORD = "Nomenamino261admin";       // Mot de passe page /phone/ID

// ============================================================
// BASE DE DONNEES
// ============================================================
const db     = {};
const photos = {};
// Sessions connectees (token => {deviceId, time})
const sessions = {};

function getDevice(id) {
    if (!db[id]) {
        db[id] = {
            id:       id,
            locked:   false,
            command:  "",
            lat:      0,
            lng:      0,
            lastSeen: null,
            events:   []
        };
    }
    return db[id];
}

// Generer token de session
function makeToken() {
    return Math.random().toString(36).substring(2) +
           Math.random().toString(36).substring(2);
}

// Verifier si session valide
function checkSession(cookieHeader, deviceId) {
    if (!cookieHeader) return false;
    var cookies = cookieHeader.split(';');
    for (var i = 0; i < cookies.length; i++) {
        var parts = cookies[i].trim().split('=');
        if (parts[0] === 'pgtoken') {
            var token = parts[1];
            var sess  = sessions[token];
            if (sess) {
                // Admin peut voir tout
                if (sess.deviceId === 'admin') return true;
                // Session specifique au telephone
                if (sess.deviceId === deviceId) return true;
            }
        }
    }
    return false;
}

const server = http.createServer(function(req, res) {
    const parsed  = url.parse(req.url, true);
    const route   = parsed.pathname;
    const query   = parsed.query;
    const cookies = req.headers.cookie || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end(); return;
    }

    // ============================================================
    // LOGIN PAGE â€” /login?for=admin ou /login?for=PHONE_001
    // ============================================================
    if (req.method === 'GET' && route === '/login') {
        var forId = query.for || 'admin';
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(loginPage(forId));
        return;
    }

    // ============================================================
    // LOGIN POST â€” verifier mot de passe
    // ============================================================
    if (req.method === 'POST' && route === '/login') {
        readBody(req, function(body) {
            try {
                var data     = JSON.parse(body);
                var password = data.password || '';
                var forId    = data.for || 'admin';
                var ok       = false;

                if (forId === 'admin' && password === ADMIN_PASSWORD) {
                    ok = true;
                } else if (forId !== 'admin' && password === DEVICE_PASSWORD) {
                    ok = true;
                }

                if (ok) {
                    var token = makeToken();
                    sessions[token] = {
                        deviceId: forId,
                        time:     Date.now()
                    };
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Set-Cookie': 'pgtoken=' + token +
                            '; Path=/; Max-Age=86400; HttpOnly'
                    });
                    res.end(JSON.stringify({ok: true, for: forId}));
                } else {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({ok: false}));
                }
            } catch(e) {
                res.writeHead(500); res.end('{}');
            }
        });
        return;
    }

    // ============================================================
    // PAGE ADMIN â€” protegee par mot de passe
    // ============================================================
    if (req.method === 'GET' && route === '/admin') {
        if (!checkSession(cookies, 'admin')) {
            res.writeHead(302, {'Location': '/login?for=admin'});
            res.end(); return;
        }
        var f = path.join(__dirname, 'dashboard.html');
        if (fs.existsSync(f)) {
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(fs.readFileSync(f));
        } else {
            res.writeHead(404); res.end('dashboard.html manquant');
        }
        return;
    }

    // ============================================================
    // PAGE TELEPHONE â€” protegee par mot de passe
    // ============================================================
    if (req.method === 'GET' && route.startsWith('/phone/')) {
        var deviceId = route.replace('/phone/', '').trim();
        if (!deviceId) {
            res.writeHead(404); res.end('ID manquant'); return;
        }
        // Verifier session
        if (!checkSession(cookies, deviceId)) {
            res.writeHead(302, {'Location': '/login?for=' + deviceId});
            res.end(); return;
        }
        var f2 = path.join(__dirname, 'device.html');
        if (fs.existsSync(f2)) {
            var html = fs.readFileSync(f2, 'utf8');
            html = html.replace(/__DEVICE_ID__/g, deviceId);
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(html);
        } else {
            res.writeHead(404); res.end('device.html manquant');
        }
        return;
    }

    // ============================================================
    // LOGOUT
    // ============================================================
    if (req.method === 'GET' && route === '/logout') {
        res.writeHead(302, {
            'Location': '/',
            'Set-Cookie': 'pgtoken=; Path=/; Max-Age=0'
        });
        res.end(); return;
    }

    // ============================================================
    // API â€” pas de protection (appelee par l'app Android)
    // ============================================================

    // GET /api/commands
    if (req.method === 'GET' && route === '/api/commands') {
        var dev = getDevice(query.device || 'unknown');
        var cmd = dev.command || "";
        dev.command  = "";
        dev.lastSeen = new Date().toISOString();
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({command: cmd}));
        return;
    }

    // POST /api/location
    if (req.method === 'POST' && route === '/api/location') {
        readBody(req, function(body) {
            try {
                var data = JSON.parse(body);
                var dev  = getDevice(data.device || 'unknown');
                var la   = parseFloat(data.lat);
                var lo   = parseFloat(data.lng);
                if (!isNaN(la) && !isNaN(lo) && la !== 0 && lo !== 0) {
                    dev.lat = la;
                    dev.lng = lo;
                }
                dev.lastSeen = new Date().toISOString();
            } catch(e) {}
            res.writeHead(200); res.end('OK');
        });
        return;
    }

    // POST /api/event
    if (req.method === 'POST' && route === '/api/event') {
        readBody(req, function(body) {
            try {
                var data = JSON.parse(body);
                var dev  = getDevice(data.device || 'unknown');
                var la   = parseFloat(data.lat);
                var lo   = parseFloat(data.lng);
                if (!isNaN(la) && !isNaN(lo) && la !== 0 && lo !== 0) {
                    dev.lat = la;
                    dev.lng = lo;
                }
                dev.events.unshift({
                    type:    data.event,
                    message: data.message || data.event,
                    lat:     dev.lat,
                    lng:     dev.lng,
                    time:    new Date().toISOString()
                });
                if (dev.events.length > 50) dev.events.pop();
                dev.lastSeen = new Date().toISOString();
            } catch(e) {}
            res.writeHead(200); res.end('OK');
        });
        return;
    }

    // POST /api/photo
    if (req.method === 'POST' && route === '/api/photo') {
        readBody(req, function(body) {
            try {
                var data  = JSON.parse(body);
                var devId = data.device || 'unknown';
                var dev   = getDevice(devId);
                if (!photos[devId]) photos[devId] = [];
                photos[devId].unshift({
                    data: data.photo,
                    time: new Date().toISOString()
                });
                if (photos[devId].length > 10) photos[devId].pop();
                dev.events.unshift({
                    type:    'photo_captured',
                    message: 'Photo du voleur recue',
                    time:    new Date().toISOString()
                });
                dev.lastSeen = new Date().toISOString();
            } catch(e) {}
            res.writeHead(200); res.end('OK');
        });
        return;
    }

    // GET /api/photos
    if (req.method === 'GET' && route === '/api/photos') {
        var devPhotos = photos[query.device] || [];
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(devPhotos));
        return;
    }

    // POST /api/command
    if (req.method === 'POST' && route === '/api/command') {
        readBody(req, function(body) {
            try {
                var data = JSON.parse(body);
                var dev  = getDevice(data.device || 'unknown');
                dev.command = data.command;
                if (data.command === 'lock')   dev.locked = true;
                if (data.command === 'unlock') dev.locked = false;
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ok: true}));
            } catch(e) {
                res.writeHead(500); res.end('{}');
            }
        });
        return;
    }

    // GET /api/status
    if (req.method === 'GET' && route === '/api/status') {
        var dev = getDevice(query.device || 'unknown');
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(dev));
        return;
    }

    // GET /api/devices
    if (req.method === 'GET' && route === '/api/devices') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(Object.values(db)));
        return;
    }

    // Page principale â†’ rediriger vers login admin
    res.writeHead(302, {'Location': '/admin'});
    res.end();
});

// ============================================================
// PAGE LOGIN
// ============================================================
function loginPage(forId) {
    var title = forId === 'admin' ? 'Admin' : forId;
    return '<!DOCTYPE html><html lang="fr"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>PhoneGuard â€” Connexion</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:Arial,sans-serif;background:#0a0c10;' +
    'display:flex;align-items:center;justify-content:center;' +
    'min-height:100vh;padding:20px}' +
    '.box{background:#111318;border:1px solid #2a2f3a;border-radius:16px;' +
    'padding:32px 28px;width:100%;max-width:360px;text-align:center}' +
    '.logo{font-size:22px;font-weight:bold;color:#fff;margin-bottom:6px}' +
    '.logo span{color:#ff3b3b}' +
    '.sub{font-size:13px;color:#8b91a0;margin-bottom:28px}' +
    '.device-badge{background:#1a1d24;border:1px solid #3d8bff;' +
    'border-radius:8px;padding:8px 16px;font-family:monospace;' +
    'font-size:13px;color:#3d8bff;display:inline-block;margin-bottom:24px}' +
    'input{width:100%;background:#1a1d24;border:1px solid #2a2f3a;' +
    'border-radius:10px;padding:14px;color:#fff;font-size:15px;' +
    'margin-bottom:16px;text-align:center;letter-spacing:2px}' +
    'input:focus{outline:none;border-color:#3d8bff}' +
    'button{width:100%;background:#ff3b3b;color:#fff;border:none;' +
    'border-radius:10px;padding:14px;font-size:15px;font-weight:bold;' +
    'cursor:pointer;transition:opacity .2s}' +
    'button:hover{opacity:.85}' +
    '.err{color:#ff3b3b;font-size:13px;margin-top:12px;display:none}' +
    '.loading{color:#8b91a0;font-size:13px;margin-top:12px;display:none}' +
    '</style></head><body>' +
    '<div class="box">' +
    '<div class="logo">Phone<span>Guard</span></div>' +
    '<div class="sub">by Nomena</div>' +
    '<div class="device-badge">' + title + '</div>' +
    '<input type="password" id="pwd" placeholder="Mot de passe" ' +
    'onkeydown="if(event.key===\'Enter\')doLogin()" autofocus />' +
    '<button onclick="doLogin()">CONNEXION</button>' +
    '<div class="err" id="err">Mot de passe incorrect</div>' +
    '<div class="loading" id="load">Connexion...</div>' +
    '</div>' +
    '<script>' +
    'function doLogin(){' +
    'var pwd=document.getElementById("pwd").value;' +
    'if(!pwd){document.getElementById("err").style.display="block";return;}' +
    'document.getElementById("err").style.display="none";' +
    'document.getElementById("load").style.display="block";' +
    'fetch("/login",{method:"POST",' +
    'headers:{"Content-Type":"application/json"},' +
    'body:JSON.stringify({password:pwd,for:"' + forId + '"})})' +
    '.then(function(r){return r.json();})' +
    '.then(function(d){' +
    'if(d.ok){' +
    'if(d.for==="admin"){window.location="/admin";}' +
    'else{window.location="/phone/"+d.for;}' +
    '}else{' +
    'document.getElementById("load").style.display="none";' +
    'document.getElementById("err").style.display="block";' +
    'document.getElementById("pwd").value="";' +
    '}})' +
    '.catch(function(){' +
    'document.getElementById("load").style.display="none";' +
    'document.getElementById("err").style.display="block";' +
    '});}' +
    '</script></body></html>';
}

function readBody(req, callback) {
    var body = '';
    req.on('data', function(chunk) { body += chunk.toString(); });
    req.on('end',  function()      { callback(body); });
}

server.listen(PORT, function() {
    console.log('PhoneGuard serveur actif port ' + PORT);
});
