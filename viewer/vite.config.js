import { defineConfig } from "vite";

// Built straight into the Flutter app's assets; flat output so one pubspec entry covers it.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../app/assets/viewer",
    emptyOutDir: true,
    assetsDir: ".",
    chunkSizeWarningLimit: 4000,
  },
});
