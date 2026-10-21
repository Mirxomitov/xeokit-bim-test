import { defineConfig } from "vite";
import { readFileSync, createReadStream, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wasm = require.resolve("@ts3d-hoops/sc-engine/engine.esm.wasm");
const models = new URL("../app/assets/models/", import.meta.url);

// The viewer loads engine.esm.wasm at runtime from `enginePath`; ship it next to the page.
// In `npm run dev` the page also serves the app's models at /models/ (open ?model=../models/x.scs).
const hoopsFiles = {
  name: "hoops-files",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "engine.esm.wasm", source: readFileSync(wasm) });
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent(req.url.split("?")[0]);
      if (path === "/engine.esm.wasm") {
        res.setHeader("Content-Type", "application/wasm");
        return createReadStream(wasm).pipe(res);
      }
      const file = path.startsWith("/models/") && new URL(`.${path.slice(7)}`, models);
      if (file && file.href.startsWith(models.href) && existsSync(file)) return createReadStream(file).pipe(res);
      next();
    });
  },
};

// Built straight into the Flutter app's assets; flat output so one pubspec entry covers it.
export default defineConfig({
  base: "./",
  plugins: [hoopsFiles],
  build: {
    outDir: "../app/assets/viewer",
    emptyOutDir: true,
    assetsDir: ".",
    chunkSizeWarningLimit: 4000,
  },
});
