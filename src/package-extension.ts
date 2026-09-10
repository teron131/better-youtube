/** Packages the built extension with a matching version and checksum for local installs and GitHub Releases. */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const { version } = readJson("package.json");
const manifest = readJson("dist/manifest.json");

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Expected a numeric three-part version.");
if (readJson("public/manifest.json").version !== version || manifest.version !== version)
  throw new Error("Package, source manifest, and built manifest versions must match.");
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error(`The release tag must be v${version}.`);

// Fail before publishing if a manifest entry points to a missing build output.
const requiredFiles = [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((script: { js?: string[]; css?: string[] }) => [
    ...(script.js ?? []),
    ...(script.css ?? []),
  ]),
] as string[];
for (const file of requiredFiles) {
  if (!statSync(join(dist, file)).isFile()) throw new Error(`Missing extension file: ${file}`);
}

const output = join(root, ".cache", "releases");
const name = `better-youtube-${version}.zip`;
const archive = join(output, name);
mkdirSync(output, { recursive: true });
// ZIP updates retain old entries, so replace only this version's previously generated archive.
rmSync(archive, { force: true });
execFileSync("zip", ["-q", "-r", archive, ".", "-x", "*.map", "*.DS_Store"], { cwd: dist });
execFileSync("unzip", ["-tq", archive], { stdio: "pipe" });
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(`${archive}.sha256`, `${digest}  ${name}\n`);
console.log(`Packaged ${archive}`);
