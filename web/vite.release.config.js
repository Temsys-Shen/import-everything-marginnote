const path = require("node:path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  plugins: [react()],
  root: __dirname,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@antv/x6": path.resolve(__dirname, "../node_modules/@antv/x6/es/index.js"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../src/web-dist/assets"),
    emptyOutDir: false,
    sourcemap: false,
    target: "es2020",
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.jsx"),
      name: "MNWebPanelApp",
      formats: ["iife"],
      fileName: "app",
      cssFileName: "app",
    },
  },
});
