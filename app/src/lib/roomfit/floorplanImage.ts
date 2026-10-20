import type { FloorPlan } from "./scene";
export type Raster = Pick<
  FloorPlan,
  "name" | "page" | "pageCount" | "width" | "height" | "dataUrl"
>;
const MAX_EDGE = 2400;
function raster(
  canvas: HTMLCanvasElement,
  name: string,
  page: number,
  pageCount: number,
): Raster {
  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > 16e6) throw new Error("图片内容过大，请裁切图纸后导入");
  return {
    name,
    page,
    pageCount,
    width: canvas.width,
    height: canvas.height,
    dataUrl,
  };
}
export async function loadFloorPlan(file: File, page = 1): Promise<Raster> {
  if (file.size > 30e6) throw new Error("图纸文件上限为 30 MB");
  const canvas = document.createElement("canvas");
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdf = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdf.GlobalWorkerOptions.workerSrc = worker.default;
    const base = new URL("/vendor/pdfjs/", window.location.href).href;
    const task = pdf.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
      enableXfa: false,
      useWorkerFetch: false,
      cMapUrl: base + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: base + "standard_fonts/",
      wasmUrl: base + "wasm/",
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 200)
        throw new Error("PDF 超过 200 页，请先导出所需页");
      if (!Number.isInteger(page) || page < 1 || page > doc.numPages)
        throw new Error("PDF 页码超出范围");
      const sheet = await doc.getPage(page),
        base = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({
        scale: Math.min(3, MAX_EDGE / Math.max(base.width, base.height)),
      });
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await sheet.render({
        canvas,
        viewport,
        annotationMode: pdf.AnnotationMode.DISABLE,
      }).promise;
      return raster(canvas, file.name, page, doc.numPages);
    } finally {
      await task.destroy();
    }
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("请选择 PNG、JPG、WebP 或 PDF 图纸");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return raster(canvas, file.name, 1, 1);
  } finally {
    bitmap.close();
  }
}
export async function rasterCanvas(source: Raster) {
  const img = new Image();
  img.src = source.dataUrl;
  await img.decode();
  if (img.width !== source.width || img.height !== source.height)
    throw new Error("底图像素尺寸与记录不一致");
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return canvas;
}
export async function cropRaster(source:Raster,x:number,y:number,width:number,height:number){
 if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<30||height<30||x+width>source.width||y+height>source.height)throw new Error('裁切区域超出图片 / Invalid crop bounds');
 const input=await rasterCanvas(source),out=document.createElement('canvas');out.width=Math.round(width);out.height=Math.round(height);out.getContext('2d')!.drawImage(input,x,y,width,height,0,0,out.width,out.height);return raster(out,source.name,source.page,source.pageCount);
}
export async function rotateRaster(source: Raster) {
  const old = await rasterCanvas(source),
    canvas = document.createElement("canvas");
  canvas.width = old.height;
  canvas.height = old.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(old, 0, 0);
  return raster(canvas, source.name, source.page, source.pageCount);
}
