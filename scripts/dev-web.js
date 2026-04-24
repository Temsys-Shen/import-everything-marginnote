const path = require("path");
const { spawn } = require("child_process");

function spawnNode(scriptName, args = []) {
  const rootDir = path.join(__dirname, "..");
  return spawn(process.execPath, [path.join(rootDir, "scripts", scriptName), ...args], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

function main() {
  const liveProcess = spawnNode("live-deploy.js", ["watch"]);
  const webProcess = spawnNode("web-dev.js");

  const stopAll = (signal) => {
    liveProcess.kill(signal);
    webProcess.kill(signal);
  };

  process.on("SIGINT", () => stopAll("SIGINT"));
  process.on("SIGTERM", () => stopAll("SIGTERM"));

  liveProcess.on("exit", (code) => {
    if (code && code !== 0) {
      webProcess.kill("SIGTERM");
      process.exit(code);
    }
  });

  webProcess.on("exit", (code) => {
    if (code && code !== 0) {
      liveProcess.kill("SIGTERM");
      process.exit(code);
    }
  });
}

main();
