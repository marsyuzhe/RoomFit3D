import { readScene, type RoomScene } from "./scene";
import { translate, type Language } from "./i18n";
export function encodeScene(s: RoomScene): string {
  return JSON.stringify(readScene(s), null, 2);
}
export function decodeScene(json: string): RoomScene {
  if (json.length > 80e6) throw new Error("工程超过 80 MB 限制");
  return readScene(JSON.parse(json));
}
export function download(
  name: string,
  data: BlobPart,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function furnitureCSV(s: RoomScene, language: Language = "zh") {
  const quote = (s: unknown) => '"' + String(s).replace(/"/g, '""') + '"';
  return (
    "\ufeff" +
    [
      [
        "名称",
        "宽 mm",
        "深 mm",
        "高 mm",
        "X mm",
        "Y mm",
        "Z mm",
        "旋转 °",
        "尺寸来源",
        "品牌",
        "型号",
        "商品链接",
      ].map((s) => translate(language, s)),
      ...s.furniture.map((f) => [
        f.name,
        f.width,
        f.depth,
        f.height,
        f.x,
        f.y,
        f.z,
        f.rotation,
        f.confidence,
        f.brand,
        f.model,
        f.sourceUrl,
      ]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}
export function planSVG(s: RoomScene, language: Language = "zh") {
  const ps = s.rooms.flatMap((r) => r.polygon);
  const w = Math.max(...ps.map((p) => p.x)) + 600,
    h = Math.max(...ps.map((p) => p.z)) + 600;
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w / 5}" height="${h / 5}" viewBox="-300 -300 ${w} ${h}"><rect x="-300" y="-300" width="${w}" height="${h}" fill="white"/>${s.walls.map((w) => `<line x1="${w.start.x}" y1="${w.start.z}" x2="${w.end.x}" y2="${w.end.z}" stroke="#39483e" stroke-width="${w.thickness}"/>`).join("")}${s.furniture.map((f) => `<g transform="translate(${f.x} ${f.z}) rotate(${-f.rotation})"><rect x="${-f.width / 2}" y="${-f.depth / 2}" width="${f.width}" height="${f.depth}" fill="${f.color}" stroke="#666" stroke-width="8"/><text text-anchor="middle" font-size="65">${escape(translate(language, f.name))} ${f.width}×${f.depth}</text></g>`).join("")}<text x="0" y="-170" font-size="70">${escape(s.name)} · mm · Links Tam</text></svg>`;
}
export class History {
  private past: string[] = [];
  private future: string[] = [];
  push(s: RoomScene) {
    this.past.push(encodeScene(s));
    this.future = [];
    while (
      this.past.length > 50 ||
      (this.past.reduce((n, s) => n + s.length, 0) > 16e6 &&
        this.past.length > 1)
    )
      this.past.shift();
  }
  undo(current: RoomScene) {
    const previous = this.past.pop();
    if (!previous) return current;
    this.future.push(encodeScene(current));
    return decodeScene(previous);
  }
  redo(current: RoomScene) {
    const next = this.future.pop();
    if (!next) return current;
    this.past.push(encodeScene(current));
    return decodeScene(next);
  }
}
