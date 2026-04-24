const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const CleanCSS = require("clean-css");

function copyRecursiveSync(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((child) => {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    });
    return;
  }
  fs.copyFileSync(src, dest);
}

function getAllFiles(dir, files = []) {
  fs.readdirSync(dir).forEach((file) => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllFiles(name, files);
    } else {
      files.push(name);
    }
  });
  return files;
}

function getLocalBin(rootDir, name) {
  const binDir = path.join(rootDir, "node_modules", ".bin");
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(binDir, `${name}${ext}`);
}

function runLocalBin(rootDir, name, args) {
  const binPath = getLocalBin(rootDir, name);
  execFileSync(binPath, args, { stdio: "ignore" });
}

function minifyCssFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const result = new CleanCSS().minify(source);

  if (result.errors.length > 0) {
    throw new Error(`CSS minify failed for ${filePath}: ${result.errors.join("; ")}`);
  }

  fs.writeFileSync(filePath, result.styles);
}

function minifyFiles(distDir) {
  const rootDir = path.join(__dirname, "..");
  const jsFiles = getAllFiles(distDir).filter((f) => f.endsWith(".js"));
  jsFiles.forEach((file) => {
    runLocalBin(rootDir, "terser", [
      file,
      "-o",
      file,
      "--compress",
      "--mangle",
    ]);
  });

  const htmlFiles = getAllFiles(distDir).filter((f) => f.endsWith(".html"));
  htmlFiles.forEach((file) => {
    runLocalBin(rootDir, "html-minifier-terser", [
      file,
      "-o",
      file,
      "--collapse-whitespace",
      "--remove-comments",
      "--minify-js",
      "true",
      "--minify-css",
      "true",
    ]);
  });

  const cssFiles = getAllFiles(distDir).filter((f) => f.endsWith(".css"));
  cssFiles.forEach((file) => {
    minifyCssFile(file);
  });
}

function buildWebAssets(rootDir) {
  const webBuildScript = path.join(rootDir, "scripts", "web-build.js");
  execFileSync(process.execPath, [webBuildScript], {
    cwd: rootDir,
    stdio: "inherit",
  });

  const webIndexPath = path.join(rootDir, "src", "web-dist", "index.html");
  if (!fs.existsSync(webIndexPath)) {
    throw new Error(`Web dist entry missing: ${webIndexPath}`);
  }
}

function build() {
  const rootDir = path.join(__dirname, "..");
  const pkg = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
  if (typeof pkg.name !== "string" || !pkg.name.trim()) {
    throw new Error("package.json缺少有效name，无法生成发布文件名");
  }
  const addonName = pkg.name.trim().replace(/^@/, "").replace(/\//g, "-");
  const distDir = path.join(rootDir, "dist");
  const srcDir = path.join(rootDir, "src");
  const outputName = `${addonName}-v${pkg.version}.mnaddon`;
  const outputPath = path.join(rootDir, outputName);

  buildWebAssets(rootDir);

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  copyRecursiveSync(srcDir, distDir);
  minifyFiles(distDir);

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const absOutputPath = path.resolve(outputPath);
  execSync(`cd "${distDir}" && zip -r -q "${absOutputPath}" .`);
  console.log(`Build successful: ${outputName}`);
}

build();
