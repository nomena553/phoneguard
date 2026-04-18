const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = process.env.PORT || 3000;

const db     = {};
const photos = {};

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

const server = http.createServer(function(req, res) {
    const parsed = url.parse(req.url, true);
    const route  = parsed.pathname;
    const query  = parsed.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end(); return;
    }

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

    // Dashboard HTML
    var htmlFile = path.join(__dirname, 'dashboard.html');
    if (fs.existsSync(htmlFile)) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(fs.readFileSync(htmlFile));
    } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h1>PhoneGuard actif</h1>');
    }
});

function readBody(req, callback) {
    var body = '';
    req.on('data', function(chunk) { body += chunk.toString(); });
    req.on('end',  function()      { callback(body); });
}

server.listen(PORT, function() {
    console.log('PhoneGuard serveur actif port ' + PORT);
});
