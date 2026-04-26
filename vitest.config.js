const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "jsdom",
    include: ["web/src/**/*.test.js"],
  },
});

