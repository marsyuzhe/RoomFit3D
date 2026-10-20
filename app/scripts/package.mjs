import "./prepare-release.mjs";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const env = { ...process.env },
  nsis = resolve("../tools/nsis/nsis-bundle");
if (existsSync(resolve(nsis, "makensis.cmd"))) {
  env.ELECTRON_BUILDER_NSIS_DIR = nsis;
  env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR = nsis;
}
if (!existsSync(resolve("node_modules/electron/dist/electron.exe"))) {
  const install = spawnSync(process.execPath, [resolve("node_modules/electron/install.js")], { stdio: "inherit", env });
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/electron-builder/cli.js"),
    "--publish", "never",
    "--win",
    "nsis",
    "--x64",
    "--config.directories.app=../release-app",
  ],
  { stdio: "inherit", env },
);
process.exit(result.status ?? 1);


