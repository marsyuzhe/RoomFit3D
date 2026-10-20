import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
const project = process.cwd(),
  repo = dirname(project),
  stage = resolve(repo, "release-app");
if (dirname(stage) !== repo || basename(stage) !== "release-app")
  throw Error("Unsafe release path");
if (existsSync(stage)) {
  if (
    !existsSync(join(stage, ".roomfit-stage")) ||
    readFileSync(join(stage, ".roomfit-stage"), "utf8") !==
      "RoomFit generated runtime"
  )
    throw Error("Refusing to replace an unmarked directory");
  rmSync(stage, { recursive: true });
}
mkdirSync(stage);
writeFileSync(join(stage, ".roomfit-stage"), "RoomFit generated runtime");
for (const dir of ["build", "desktop", "rendering"])
  cpSync(join(project, dir), join(stage, dir), { recursive: true });
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      license: "MIT",
      type: "module",
      main: "desktop/main.cjs",
    },
    null,
    2,
  ),
);
console.log("Prepared compiled desktop runtime:", stage);
