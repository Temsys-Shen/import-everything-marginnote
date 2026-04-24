const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function getLocalBin(rootDir, name) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(rootDir, "node_modules", ".bin", `${name}${ext}`);
}

function resolveSingleBundle(distAssetsDirPath) {
  const jsFiles = fs.readdirSync(distAssetsDirPath)
    .filter((name) => name.endsWith(".js"))
    .sort();

  if (jsFiles.length !== 1) {
    throw new Error(`Expected exactly one JS bundle in ${distAssetsDirPath}, got: ${jsFiles.join(", ") || "(none)"}`);
  }

  return path.join(distAssetsDirPath, jsFiles[0]);
}

function main() {
  const rootDir = path.join(__dirname, "..");
  const viteConfigPath = path.join(rootDir, "web", "vite.release.config.js");
  const distDirPath = path.join(rootDir, "src", "web-dist");
  const distAssetsDirPath = path.join(distDirPath, "assets");
  const distIndexPath = path.join(rootDir, "src", "web-dist", "index.html");
  const viteBin = getLocalBin(rootDir, "vite");
  const distCssPath = path.join(distAssetsDirPath, "app.css");

  fs.rmSync(distDirPath, { recursive: true, force: true });
  fs.mkdirSync(distAssetsDirPath, { recursive: true });

  execFileSync(viteBin, ["build", "--config", viteConfigPath], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (!fs.existsSync(distCssPath)) {
    throw new Error(`Expected web build output missing: ${distCssPath}`);
  }

  const builtJsPath = resolveSingleBundle(distAssetsDirPath);
  const distJsPath = path.join(distAssetsDirPath, "app.js");
  if (builtJsPath !== distJsPath) {
    fs.renameSync(builtJsPath, distJsPath);
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MarginNote Web Template</title>
    <link rel="stylesheet" href="./assets/app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./assets/app.js"></script>
  </body>
</html>
`;
  fs.writeFileSync(distIndexPath, html);

  console.log(`Web build successful: ${distIndexPath}`);
}

main();
