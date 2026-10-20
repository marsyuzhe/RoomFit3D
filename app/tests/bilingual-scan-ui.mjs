import {enterEditor} from "./editor-entry.mjs";
import { _electron as electron, chromium, expect } from "@playwright/test";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
const native = !!process.env.ROOMFIT_EXE,
  profile = resolve("../evidence/bilingual-packaged-profile");
mkdirSync(profile, { recursive: true });
const env = {
  ...process.env,
  ROOMFIT_TEST_PROFILE: profile,
  ROOMFIT_BLENDER: process.env.ROOMFIT_BLENDER || "blender",
  ROOMFIT_TEST_OUTPUT: resolve(
    "../evidence/bilingual-packaged-renders/中文 路径测试",
  ),
};
delete env.ELECTRON_RUN_AS_NODE;
const runtime = native
  ? await electron.launch({ executablePath: env.ROOMFIT_EXE, args: [], env })
  : null;
if (runtime) {
  const initialWindow=await runtime.firstWindow();
  await initialWindow.waitForURL("**/studio?session=*");
  await runtime.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = "dark"; });
}
const browser = native
  ? null
  : await chromium.launch({ channel: "chrome", headless: true });
const page = native
  ? await runtime.firstWindow()
  : await browser.newPage({
      viewport: { width: 1520, height: 980 },
      colorScheme: "dark",
    });
const results = [],
  errors = [];
let report;
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const output = (name) =>
  resolve(`../evidence/bilingual-${native ? "packaged" : "browser"}-${name}`);
async function saved(name, english = false) {
  const path = output(name + ".roomfit");
  if (native) {
    if (existsSync(path)) unlinkSync(path);
    await runtime.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, path);
    await button(english ? "Save as" : "另存为").click();
    await expect.poll(() => existsSync(path)).toBe(true);
  } else {
    const pending = page.waitForEvent("download");
    await button(english ? "Save" : "保存").click();
    const file = await pending;
    await file.saveAs(path);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
async function contrast() {
  const controls = await page
    .locator(
      "input:not([type=checkbox]):not([type=range]):not([type=color]),select,textarea",
    )
    .evaluateAll((nodes) => {
      const rgb = (s) => s.match(/[\d.]+/g).map(Number),
        lum = (c) =>
          c
            .slice(0, 3)
            .map((n) => {
              n /= 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            })
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      return nodes
        .filter((n) => !n.disabled && n.getBoundingClientRect().height > 0)
        .map((n) => {
          const css = getComputedStyle(n);
          let el = n,
            bg;
          while (el) {
            const b = rgb(getComputedStyle(el).backgroundColor);
            if (b.length === 3 || b[3] >= 0.99) {
              bg = b;
              break;
            }
            el = el.parentElement;
          }
          bg ??= [255, 255, 255];
          const a = lum(rgb(css.color)),
            b = lum(bg);
          return {
            label: n.getAttribute("aria-label") || n.type || n.tagName,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
    });
  expect(controls.length).toBeGreaterThan(2);
  for (const c of controls)
    expect(c.ratio, JSON.stringify(c)).toBeGreaterThanOrEqual(4.5);
  return controls;
}
try {
  if (native) {
    await page.waitForURL("**/studio?session=*");
    await page.evaluate(() => localStorage.setItem("o3d_theme", "dark"));
    await page.reload();
  } else {
    await page.addInitScript(() => localStorage.setItem("o3d_theme", "dark"));
    await page.goto(process.env.ROOMFIT_URL || "http://127.0.0.1:5203/studio");
  }
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await page.getByLabel("界面语言 / Interface language").selectOption("zh");
  await button("载入标准卧室示例").click();
  const before = await saved("before-language");
  const chineseContrast = await contrast();
  await page.screenshot({ path: output("zh.png"), fullPage: true });
  await page.getByLabel("界面语言 / Interface language").selectOption("en");
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    before.name,
  );
  const englishContrast = await contrast();
  await expect(button("Import plan")).toBeVisible();
  await expect(button("Import scan")).toBeVisible();
  const navFits = await page.locator(".library nav").evaluate((nav) => {
    const box = nav.getBoundingClientRect();
    return [...nav.children].every(
      (button) => button.getBoundingClientRect().right <= box.right + 1,
    );
  });
  expect(navFits).toBe(true);
  const after = await saved("after-language", true);
  expect(after).toEqual(before);
  await page.waitForTimeout(250);
  await page.screenshot({ path: output("en.png"), fullPage: true });
  await page.getByPlaceholder("Search furniture…").fill("wardrobe");
  await expect(page.locator(".add-card")).toHaveCount(3);
  await page.getByPlaceholder("Search furniture…").fill("");
  await button("Rooms").click();
  await button("Edit walls and openings").click();
  await page.getByLabel("Floor plan editor canvas", { exact: true }).waitFor();
  await page.getByLabel("界面语言 / Interface language").selectOption("zh");
  await page.getByLabel("户型编辑画布", { exact: true }).waitFor();
  await page.getByLabel("界面语言 / Interface language").selectOption("en");
  await page.getByLabel("Floor plan editor canvas", { exact: true }).waitFor();
  await button("3D editor").click();
  await page.setViewportSize({ width: 1192, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: output("en-1192.png"), fullPage: true });
  await page.setViewportSize({ width: 1520, height: 980 });
  await button("Import plan").click();
  await expect(
    page.getByRole("heading", { name: "Build a space from a plan" }),
  ).toBeVisible();
  await page
    .getByLabel("Choose floorplan file")
    .setInputFiles("../samples/C-Floor-plan-1-public-domain.jpg");
  await page
    .getByRole("application", { name: "Plan calibration and wall candidates" })
    .waitFor();
  await contrast();
  await button("Close plan import").click();
  results.push({
    name: "Dark system theme, readable controls, Chinese/English, same saved scene, search, inherited canvas, narrow window and plan dialog",
    passed: true,
    chineseContrast,
    englishContrast,
  });

  await button("Import scan").click();
  await page
    .getByLabel("Choose scan file")
    .setInputFiles("../samples/D-RoomPlan-test-fixture.json");
  await expect(page.getByLabel("Floor to import")).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Import recognized furniture supported by this catalog (estimated)",
    })
    .check();
  await button("Import scan and build 3D").click();
  await page.getByLabel("Floor plan editor canvas", { exact: true }).waitFor();
  const scan = await saved("scan", true);
  expect(scan.walls).toHaveLength(4);
  expect(scan.openings).toHaveLength(2);
  expect(scan.furniture).toHaveLength(1);
  expect(scan.furniture[0].width).toBe(1800);
  expect(scan.dimensionConfidence).toBe("estimated");
  expect(JSON.parse(scan.assets["roomplan-source"].data).walls).toHaveLength(4);
  await button("3D editor").click();
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await page.screenshot({ path: output("scan-3d.png"), fullPage: true });
  if (native) {
    await button("Render").click();
    await page.getByLabel("Output resolution").selectOption("960x540");
    await page.getByLabel("Samples").fill("16");
    await page.getByLabel("Camera view").selectOption("interior");
    await button("Start render").click();
    const deadline = Date.now() + 90000;
    let state;
    while (true) {
      state = await page.evaluate(() => window.roomfit.status());
      if (state.status === "failed") throw Error(state.log);
      if (state.status === "completed") break;
      if (Date.now() > deadline) throw Error("scan render deadline");
      await page.waitForTimeout(250);
    }
    copyFileSync(
      resolve(state.job, "scene.json"),
      "../evidence/scan-cycles.scene.json",
    );
    copyFileSync(state.output, "../evidence/scan-cycles.png");
    copyFileSync(
      resolve(state.job, "render.verification.json"),
      "../evidence/scan-cycles.verification.json",
    );
  }
  await button("Designs").click();
  const pdfPath = output(native ? "english-report.pdf" : "english-report.html");
  if (native) {
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
    await runtime.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, pdfPath);
    await button("Export PDF plan and furniture list").click();
    await expect.poll(() => existsSync(pdfPath), { timeout: 20000 }).toBe(true);
  } else {
    const pending = page.waitForEvent("download");
    await button("Export PDF plan and furniture list").click();
    await (await pending).saveAs(pdfPath);
    expect(readFileSync(pdfPath, "utf8")).toContain("Furniture dimensions");
  }
  const zip = new JSZip();
  zip.file(
    "room.json",
    readFileSync("../samples/D-RoomPlan-test-fixture.json"),
  );
  writeFileSync(
    output("raw-scan.zip"),
    await zip.generateAsync({ type: "nodebuffer" }),
  );
  await button("Import scan").click();
  await page
    .getByLabel("Choose scan file")
    .setInputFiles(output("raw-scan.zip"));
  await expect(page.getByLabel("Floor to import")).toBeVisible();
  await button("Cancel").click();
  zip.file("plan.json", "{}");
  writeFileSync(
    output("edited.zip"),
    await zip.generateAsync({ type: "nodebuffer" }),
  );
  await button("Import scan").click();
  await page.getByLabel("Choose scan file").setInputFiles(output("edited.zip"));
  await expect(
    page.locator("[data-scan-import]").getByRole("status"),
  ).toContainText("Export Editable Plan");
  await button("Cancel").click();
  results.push({
    name:
      "RoomPlan JSON and raw ZIP, edited-package rejection, mm geometry, original source retention, English export" +
      (native ? " and actual Cycles" : ""),
    passed: true,
  });
  await page.reload();
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await expect(page.getByLabel("界面语言 / Interface language")).toHaveValue(
    "en",
  );
  expect(errors).toEqual([]);
  report = { native, results, pageErrors: errors, englishReport: pdfPath };
} finally {
  if (runtime) await runtime.close();
  else await browser.close();
}
if (native) {
  const second = await electron.launch({
    executablePath: env.ROOMFIT_EXE,
    args: [],
    env,
  });
  try {
    const p = await second.firstWindow();
    await enterEditor(p);
    await p.locator("[data-roomfit-canvas]").waitFor();
    await expect(p.getByLabel("界面语言 / Interface language")).toHaveValue(
      "en",
    );
    report.languagePersistsAcrossRestart = true;
  } finally {
    await second.close();
  }
}
writeFileSync(output("report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

