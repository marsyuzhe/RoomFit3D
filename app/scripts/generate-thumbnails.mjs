import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.ROOMFIT_URL || "http://127.0.0.1:5204/studio");
  await page.locator("[data-roomfit-home], [data-roomfit-canvas]").first().waitFor();
  const data = await page.evaluate(async () => {
    const m = await import("/src/lib/roomfit/thumbnailEntry.ts");
    return m.thumbnails();
  });
  const rooms=await page.evaluate(async()=>{const m=await import('/src/lib/roomfit/thumbnailEntry.ts');return m.roomThumbnails();});
  mkdirSync('static/roomfit-templates',{recursive:true});for(const [id,png]of Object.entries(rooms))writeFileSync(`static/roomfit-templates/${id}.png`,Buffer.from(png,'base64'));
  mkdirSync("static/roomfit-thumbnails", { recursive: true });
  for (const [id, png] of Object.entries(data))
    writeFileSync(
      `static/roomfit-thumbnails/${id}.png`,
      Buffer.from(png, "base64"),
    );
  console.log(
    "Generated",
    Object.keys(data).length,
    "thumbnails from the actual furniture meshes",
  );
} finally {
  await browser.close();
}
