const path = require("node:path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  plugins: [react()],
  root: __dirname,
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../src/web-dist"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2018",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
