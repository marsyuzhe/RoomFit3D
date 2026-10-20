import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import './prepare-ocr-assets.mjs';
// PDF fonts, CMaps and image decoders must ship locally with the app.
const target = resolve("static/vendor/pdfjs");
mkdirSync(target, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  cpSync(resolve("node_modules/pdfjs-dist", dir), resolve(target, dir), {
    recursive: true,
  });
cpSync(
  resolve("node_modules/pdfjs-dist/LICENSE"),
  resolve(target, "LICENSE.txt"),
);
