const { defineConfig } = require("vitest/config");
const path = require("path");

module.exports = defineConfig({
  resolve: {
    alias: {
      "@antv/x6": path.resolve(__dirname, "node_modules/@antv/x6/es/index.js"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["web/src/**/*.test.js"],
  },
});
