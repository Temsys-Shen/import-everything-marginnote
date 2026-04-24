const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function parseVersion(input) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(input);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function nextVersion(current, bump) {
  const parsed = parseVersion(current);
  if (!parsed) {
    throw new Error(`Invalid current version: ${current}`);
  }

  if (bump === "major") {
    return `${parsed.major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (bump === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  const explicit = parseVersion(bump);
  if (explicit) {
    return `${explicit.major}.${explicit.minor}.${explicit.patch}`;
  }

  throw new Error(`Unsupported bump: ${bump}`);
}

function main() {
  const bump = process.argv[2];
  if (!bump) {
    console.log("Usage: node scripts/bump-version.js <patch|minor|major|x.y.z>");
    process.exit(1);
  }

  const rootDir = path.join(__dirname, "..");
  const pkgPath = path.join(rootDir, "package.json");
  const addonPath = path.join(rootDir, "src", "mnaddon.json");

  const pkg = readJson(pkgPath);
  const addon = readJson(addonPath);

  let inGitRepo = false;
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      stdio: "ignore",
    });
    inGitRepo = true;
  } catch (error) {
    inGitRepo = false;
  }

  if (inGitRepo) {
    const status = execSync("git status --porcelain", {
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();

    if (status) {
      console.error(
        "Git working tree is not clean. Please commit or stash changes before bumping version."
      );
      process.exit(1);
    }
  }

  const current = pkg.version || addon.version;
  const next = nextVersion(current, bump);

  pkg.version = next;
  addon.version = next;

  writeJson(pkgPath, pkg);
  writeJson(addonPath, addon);

  const tagName = `v${next}`;

  if (!inGitRepo) {
    console.log(`Version bumped: ${current} -> ${next}`);
    console.log("Git repository not detected, skipped commit and tag.");
    return;
  }

  execSync(`git add "${pkgPath}" "${addonPath}"`, { stdio: "inherit" });
  execSync(`git commit -m "${tagName}"`, { stdio: "inherit" });
  execSync(`git tag "${tagName}"`, { stdio: "inherit" });

  console.log(`Version bumped: ${current} -> ${next}`);
  console.log(`Git commit and tag created: ${tagName}`);
}

main();
