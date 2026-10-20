import {
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
const seen = new Set(),
  packages = [];
let notices =
  "RoomFit 3D dependency notices (development and runtime inventory)\n\n";
function visit(base) {
  if (!existsSync(base)) return;
  for (const name of readdirSync(base)) {
    if (name.startsWith(".")) continue;
    const path = join(base, name);
    if (name.startsWith("@")) {
      visit(path);
      continue;
    }
    const file = join(path, "package.json");
    if (!existsSync(file)) continue;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const key = pkg.name + "@" + pkg.version;
    if (!seen.has(key)) {
      seen.add(key);
      packages.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license || "UNDECLARED",
        repository: pkg.repository || null,
      });
      const files = readdirSync(path).filter((f) =>
        /^(license|licence|copying|notice)(\.|$)/i.test(f),
      );
      notices +=
        "\n=== " + key + " / " + (pkg.license || "UNDECLARED") + " ===\n";
      for (const f of files) {
        try {
          notices +=
            "\n" + f + "\n" + readFileSync(join(path, f), "utf8") + "\n";
        } catch {}
      }
    }
    visit(join(path, "node_modules"));
  }
}
visit(resolve("node_modules"));
packages.sort((a, b) => a.name.localeCompare(b.name));
mkdirSync("../assets/licenses", { recursive: true });
writeFileSync(
  "../assets/licenses/npm-inventory.json",
  JSON.stringify(packages, null, 2),
);
writeFileSync("../assets/licenses/NPM-NOTICES.txt", notices);
console.log("Recorded", packages.length, "unique package versions");
