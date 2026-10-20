import {enterEditor} from "./editor-entry.mjs";
import { chromium, _electron as electron, expect } from "@playwright/test";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  copyFileSync,
} from "node:fs";
const url = process.env.ROOMFIT_URL || "http://127.0.0.1:5202/studio";
const native = !!process.env.ROOMFIT_EXE;
const profile = resolve("../evidence/floorplan-packaged-profile");
if (native) mkdirSync(profile, { recursive: true });
const env = {
  ...process.env,
  ROOMFIT_TEST_PROFILE: profile,
  ROOMFIT_BLENDER: process.env.ROOMFIT_BLENDER || "blender",
  ROOMFIT_TEST_OUTPUT: resolve(
    "../evidence/floorplan-packaged-renders/中文 路径测试",
  ),
};
delete env.ELECTRON_RUN_AS_NODE;
const runtime = native
  ? await electron.launch({
      executablePath: process.env.ROOMFIT_EXE,
      args: [],
      env,
    })
  : null;
const browser = native
  ? null
  : await chromium.launch({ channel: "chrome", headless: true });
const page = native
    ? await runtime.firstWindow()
    : await browser.newPage({ viewport: { width: 1520, height: 980 } }),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const modal = () => page.locator("[data-floorplan-import]");
const button = (name) => page.getByRole("button", { name, exact: true });
const svg = () => page.getByRole("application", { name: "图纸校准与候选墙线" });
async function point(x, y) {
  const position = await svg().evaluate(
    (el, { x, y }) => {
      const parent = el.parentElement,
        box = parent.getBoundingClientRect();
      let p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
      if (p.y < box.top + 15 || p.y > box.bottom - 15)
        parent.scrollTop += p.y - (box.top + box.height / 2);
      p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
      return { x: p.x, y: p.y };
    },
    { x, y },
  );
  await page.mouse.click(position.x, position.y);
}
async function calibrate(a, b, length) {
  await button("选择校准两点").click();
  await point(...a);
  await point(...b);
  await page.getByLabel("校准实际长度").fill(String(length));
  await button("记录比例").click();
}
async function check(a, b, length) {
  await button("选择复核两点").click();
  await point(...a);
  await point(...b);
  await page.getByLabel("复核实际长度").fill(String(length));
  await button("记录复核").click();
}
async function saved(name) {
  if (native) {
    const path = resolve(`../evidence/packaged-${name}.roomfit`);
    if (existsSync(path)) unlinkSync(path);
    await runtime.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, path);
    await button("另存为").click();
    await expect.poll(() => existsSync(path)).toBe(true);
    return JSON.parse(readFileSync(path, "utf8"));
  }
  const waiting = page.waitForEvent("download");
  await button("保存").click();
  const download = await waiting;
  const path = `../evidence/${name}.roomfit`;
  await download.saveAs(path);
  return JSON.parse(readFileSync(path, "utf8"));
}
try {
  if (native) await page.waitForURL("**/studio?session=*");
  else await page.goto(url);
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await button("导入图纸").click();
  await button("显示全部步骤").click();
  await page
    .getByLabel("选择户型图文件")
    .setInputFiles("../samples/C-Floor-plan-1-public-domain.jpg");
  await svg().waitFor();
  // This independent public-domain drawing has no scale annotation. The 8000 mm
  // value is explicitly a test assumption, never accepted as a measured house.
  await calibrate([200, 100], [670, 100], 8000);
  await check([200, 100], [200, 330], (230 * 8000) / 470);
  await button("重新提取候选墙线").click();
  await expect(modal().getByRole("status")).toContainText("候选");
  const count = await modal()
    .getByRole("button", { name: /选择候选墙线/ })
    .count();
  if (count < 5)
    throw Error(`independent raster detection produced only ${count} lines`);
  await modal()
    .getByRole("button", { name: "选择候选墙线 1", exact: true })
    .click();
  await page.getByLabel("候选墙厚").fill("200");
  await page.getByLabel("候选墙厚").press("Tab");
  await page.screenshot({
    path: "../evidence/floorplan-candidates-real.png",
    fullPage: true,
  });
  await button("附加底图，继续描墙").click();
  await page.getByLabel("户型编辑画布", { exact: true }).waitFor();
  const attached = await saved("floorplan-real-attached");
  expect(attached.floorPlan.candidates).toHaveLength(count);
  expect(attached.furniture).toHaveLength(6);
  expect(attached.walls).toHaveLength(4);
  expect(
    attached.floorPlan.candidates[0].thickness * attached.floorPlan.mmPerPixel,
  ).toBeCloseTo(200);
  await button("房间").click();
  await page.getByLabel("房间宽度 mm", { exact: true }).fill("3800");
  await button("应用房间尺寸").click();
  const resized = await saved("floorplan-retained-after-resize");
  expect(resized.floorPlan).toEqual(attached.floorPlan);
  await button("↶ 撤回").click();
  await button("家具").click();
  await button("导入图纸").click();
  await button("显示全部步骤").click();
  await expect(page.getByLabel("候选墙厚")).toHaveCount(0);
  await expect(svg().locator("image")).toHaveAttribute(
    "href",
    attached.floorPlan.dataUrl,
  );
  await button("关闭图纸导入").click();
  results.push({
    name: "Independent public-domain image: candidates, correction, embedding, resize retention, reopen",
    passed: true,
    candidates: count,
    scale: "test assumption; image has no real dimension annotation",
  });

  // Deterministic raster fixture exercises exact calibration and geometry.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 500;
    c.height = 400;
    const x = c.getContext("2d");
    x.fillStyle = "white";
    x.fillRect(0, 0, 500, 400);
    x.fillStyle = "black";
    for (const r of [
      [40, 40, 412, 12],
      [40, 340, 412, 12],
      [40, 40, 12, 312],
      [440, 40, 12, 312],
    ])
      x.fillRect(...r);
    return c.toDataURL("image/png").split(",")[1];
  });
  writeFileSync(
    "../evidence/calibration-fixture.png",
    Buffer.from(png, "base64"),
  );
  await button("导入图纸").click();
  await button("显示全部步骤").click();
  await page
    .getByLabel("选择户型图文件")
    .setInputFiles("../evidence/calibration-fixture.png");
  await calibrate([46, 46], [446, 46], 4000);
  await check([46, 46], [46, 346], 2000);
  await expect(modal().getByText("复核偏差 50.00%（限 3%）")).toBeVisible();
  await expect(page.getByLabel("确认图纸比例")).toBeDisabled();
  await button("重新提取候选墙线").click();
  await button("连接附近端点").click();
  await button("用已选墙线生成新工程").click();
  await expect(modal().getByRole("status")).toContainText("偏差超过");
  await check([46, 46], [46, 346], 3000);
  await button("两点补线").click();
  await point(140, 140);
  await point(240, 140);
  await expect(page.getByLabel("候选墙厚")).toHaveValue("120");
  await button("删除所选墙线").click();
  await button("撤回线修改").click();
  await modal()
    .getByRole("button", { name: "选择候选墙线 5", exact: true })
    .press("Enter");
  await button("删除所选墙线").click();
  await page.getByLabel("确认图纸比例").check();
  await button("用已选墙线生成新工程").click();
  await expect(modal()).toHaveCount(0);
  const created = await saved("floorplan-calibrated-generated");
  expect(created.walls).toHaveLength(4);
  expect(created.rooms).toHaveLength(1);
  expect(created.furniture).toHaveLength(0);
  expect(created.dimensionConfidence).toBe("confirmed");
  const p = created.rooms[0].polygon;
  const area =
    Math.abs(
      p.reduce(
        (s, a, i) =>
          s + a.x * p[(i + 1) % p.length].z - p[(i + 1) % p.length].x * a.z,
        0,
      ),
    ) / 2;
  expect(area).toBeCloseTo(3880 * 2880);
  // End a canvas edit and switch immediately, inside its 180 ms debounce.
  await button("绘墙").click();
  const box = await page
    .getByLabel("户型编辑画布", { exact: true })
    .boundingBox();
  await page.mouse.click(box.x + 90, box.y + 90);
  await page.mouse.click(box.x + 190, box.y + 90);
  await button("三维编辑").click();
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  const flushed = await saved("floorplan-immediate-switch");
  expect(flushed.walls).toHaveLength(5);
  await page
    .locator("header")
    .getByRole("button", { name: "↶ 撤回", exact: true })
    .focus();
  await page.keyboard.press("Control+z");
  const undoneWall = await saved("floorplan-keyboard-undo");
  expect(undoneWall.walls).toHaveLength(4);
  expect(undoneWall.furniture).toHaveLength(0);
  await page.screenshot({
    path: "../evidence/floorplan-generated-3d.png",
    fullPage: true,
  });
  if (native) {
    await button("出图").click();
    await page.getByLabel("输出分辨率").selectOption("960x540");
    await page.getByLabel("采样数").fill("16");
    await page.getByLabel("相机视角").selectOption("interior");
    await button("启动高清渲染").click();
    const deadline = Date.now() + 90000;
    let state;
    while (true) {
      state = await page.evaluate(() => window.roomfit.status());
      if (state.status === "failed") throw Error(state.log);
      if (state.status === "completed") break;
      if (Date.now() > deadline)
        throw Error("Imported geometry Cycles render timed out");
      await page.waitForTimeout(250);
    }
    const input = resolve(state.job, "scene.json");
    const manifest = JSON.parse(readFileSync(input, "utf8"));
    expect(manifest.scene.floorPlan.name).toBe("calibration-fixture.png");
    expect(manifest.scene.walls).toHaveLength(4);
    copyFileSync(input, "../evidence/floorplan-cycles.scene.json");
    copyFileSync(state.output, "../evidence/floorplan-cycles.png");
    copyFileSync(
      resolve(state.job, "render.verification.json"),
      "../evidence/floorplan-cycles.verification.json",
    );
    results.push({
      name: "Generated calibrated raster room to actual packaged Cycles render",
      passed: true,
      meshes: manifest.meshes.length,
      output: state.output,
    });
  }
  await button("↶ 撤回").click();
  const reverted = await saved("floorplan-undo");
  expect(reverted.furniture).toHaveLength(6);
  expect(reverted.floorPlan.name).toContain("public-domain");
  results.push({
    name: "Exact calibration, bad dimension rejected, manual wall add/delete/undo, closed net geometry, immediate switch flush, Ctrl+Z, 3D",
    passed: true,
    areaMm2: area,
  });

  const doc = new jsPDF({ unit: "mm", format: [200, 160] });
  doc.text("PDF import test - page 1", 12, 15);
  doc.setLineWidth(2);
  doc.rect(20, 30, 140, 100);
  doc.addPage();
  doc.text("Different geometry - page 2", 12, 15);
  doc.rect(30, 40, 80, 60);
  writeFileSync(
    "../evidence/floorplan-two-pages.pdf",
    Buffer.from(doc.output("arraybuffer")),
  );
  await button("导入图纸").click();
  await button("显示全部步骤").click();
  await page
    .getByLabel("选择户型图文件")
    .setInputFiles("../evidence/floorplan-two-pages.pdf");
  await expect(modal().getByText("1/2", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await calibrate([100, 100], [500, 100], 4000);
  await expect(button("附加底图，继续描墙")).toBeEnabled();
  await button("下一页").click();
  await expect(modal().getByText("2/2", { exact: true })).toBeVisible();
  await expect(button("附加底图，继续描墙")).toBeDisabled();
  await button("顺时针旋转 90°").click();
  await page.screenshot({
    path: "../evidence/floorplan-pdf-page2.png",
    fullPage: true,
  });
  await button("关闭图纸导入").click();
  results.push({
    name: "Local real PDF decoding, page navigation, scale invalidation and rotation",
    passed: true,
  });
  expect(errors).toEqual([]);
  writeFileSync(
    `../evidence/floorplan-${native ? "packaged" : "ui"}-report.json`,
    JSON.stringify({ results, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ results, pageErrors: errors }, null, 2));
} finally {
  if (runtime) await runtime.close();
  else await browser.close();
}

