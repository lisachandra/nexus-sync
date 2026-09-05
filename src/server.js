const notification = require('./notification');
const settings = require(`./settings`);
const output = require('./output');
const http = require('http');

const contentType = { "Content-Type": "application/json" };
const recentLogs = new Map();

let outputSessions = new Map();
let server;

function parseOutputLogs(body) {
    const { StartTime, PlaceId, GUID, Logs } = JSON.parse(body);

    const sessionKey = `${GUID}:${PlaceId}`;
    if (!outputSessions.has(sessionKey)) {
        outputSessions.set(sessionKey, 0);
    }
    return {
        sessionKey,
        startTime: StartTime,
        placeId: PlaceId,
        GUID: GUID,
        logs: Logs,
    };
}

function isDuplicate(log) {
    if (!settings.fetch('server', 'rejectDuplicates')) {
        return false;
    } else if (log.messageType === "MessageTrace" && log.message.includes("Stack ")) {
        return false;
    }

    const sessionLogs = recentLogs.get(log.sessionKey) || [];
    const now = log.timestamp;

    const recentLogsOnly = sessionLogs.filter(entry => now - entry.timestamp <= 100);
    const duplicateFound = recentLogsOnly.some(entry => entry.message === log.message);

    if (!duplicateFound) {
        recentLogsOnly.push({ message: log.message, timestamp: now });
    } else {
        console.debug(`[Duplicate] '${log.message}' seen at ${now}`);
    }

    recentLogs.set(log.sessionKey, recentLogsOnly);

    return duplicateFound;
}

function sortOutputLogs(data) {
    const sortedLogs = Object.entries(data.logs).sort((a, b) => Number(a[0]) - Number(b[0]));

    sortedLogs.forEach(([key, log]) => {
        const logNumber = Number(key);

        if (logNumber > outputSessions.get(data.sessionKey) && log !== null && !isDuplicate({ ...log, sessionKey: data.sessionKey })) {
            outputSessions.set(data.sessionKey, logNumber);

            if (log.timestamp >= data.startTime) {
                if (log.message.startsWith("TestService")) {
                    log.message = log.message.replace("TestService: ", "");
                    log.messageType = "MessageDebug";
                }

                output.logToOutput(data.placeId, log.message, log.messageType);
            }
        }
    });
}

function handleRequest(body, res) {
    try {
        sortOutputLogs(parseOutputLogs(body));

        res.writeHead(200, contentType);
        res.end(JSON.stringify({ message: "Data received successfully" }));
    } catch (err) {
        console.log(err);
        console.log(body);
        res.writeHead(400, contentType);
        res.end(JSON.stringify({ error: "Error parsing JSON data" }));
    }
}

function handleConnectError(error, port) {
    if (error.message.includes("EADDRINUSE")) {
        notification.send(`Port ${port} is already in use`);
        console.log(`Nexus Sync: Port ${port} is already in use`);
    } else {
        notification.send(`Error starting server: ${error.message}`);
        console.log(`Nexus Sync: Error starting server: ${error.message}`);
    }
}

function start(port) {
    if (!isServerRunning()) {
        recentLogs.clear();
        outputSessions.clear();
        output.start();

        server = http.createServer((req, res) => {
            if (req.method === "POST" && req.url === "/data") {
                let body = "";

                req.on("data", (chunk) => {
                    body += chunk.toString();
                });

                req.on("end", () => {
                    handleRequest(body, res);
                });
            } else {
                res.writeHead(404, contentType);
                res.end(JSON.stringify({ error: "Endpoint not found" }));
            }
        });

        server.on('error', (error) => {
            handleConnectError(error, port);
        });

        server.listen(port, () => {
            notification.send(`Nexus Sync plugin server running on port ${port}`);
            console.log(`Nexus Sync: Server running at http://localhost:${port}/`);
        });
    } else {
        notification.send(`Nexus Sync plugin server is already running`);
    }
}

function stop() {
    if (isServerRunning()) {
        server.close(() => {
            notification.send(`Nexus Sync plugin server stopped`);
            console.log('Nexus Sync: Server stopped');
        });

        output.stop();

    } else {
        notification.send(`Nexus Sync plugin server already stopped`);

        if (server) {
            server.close();
        }
    }
}

function isServerRunning() {
    if (server) {
        return server.listening;
    }
    return false;
}

module.exports = { start, stop };
