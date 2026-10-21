// Serves the APS viewer page plus the two things it needs from a backend:
//   GET /token   viewables:read token (the client secret never leaves this machine)
//   GET /models  the URNs recorded by upload.js
// The Flutter app opens http://<this machine>:8090/ in its WebView.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { networkInterfaces } from "node:os";
import { token } from "./aps.js";

const PORT = Number(process.env.PORT || 8090);
const VIEWER = new URL("../viewer/", import.meta.url);
const MODELS = new URL("./models.json", import.meta.url);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  try {
    if (path === "/token") {
      const { access_token, expires_at } = await token("viewables:read");
      return send(res, 200, JSON.stringify({ access_token, expires_in: Math.floor((expires_at - Date.now()) / 1000) }));
    }
    if (path === "/models") {
      return send(res, 200, existsSync(MODELS) ? await readFile(MODELS) : "[]");
    }
    const file = new URL(path === "/" ? "index.html" : `.${path}`, VIEWER);
    if (!file.href.startsWith(VIEWER.href) || !existsSync(file)) return send(res, 404, "not found", "text/plain");
    send(res, 200, await readFile(file), TYPES[extname(file.pathname)] ?? "application/octet-stream");
  } catch (e) {
    console.error(e);
    send(res, 500, JSON.stringify({ error: String(e.message ?? e) }));
  }
}).listen(PORT, "0.0.0.0", () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal);
  console.log(`APS viewer on http://localhost:${PORT}/?model=Duplex`);
  if (lan) console.log(`phone: flutter run --dart-define=APS_SERVER=http://${lan.address}:${PORT}`);
});
