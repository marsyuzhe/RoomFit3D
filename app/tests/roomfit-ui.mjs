import {enterEditor} from "./editor-entry.mjs";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1520, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
const check = async (name, fn) => {
  await fn();
  results.push({ name, passed: true });
};
try {
  await page.goto(process.env.ROOMFIT_URL || "http://127.0.0.1:5201/studio");
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await page.waitForTimeout(1200);
  await check("initial real 3D canvas and exact area", async () => {
    if (!(await page.getByText("11.52 m²", { exact: false }).count()))
      throw Error("area missing");
  });
  await page.screenshot({ path: "../evidence/editor-3d.png", fullPage: true });
  await page.getByRole("button", { name: "二维平面", exact: true }).click();
  await check("2D furniture selection and dimensional input", async () => {
    await page.getByRole("button", { name: "双人床", exact: true }).click();
    await page.getByLabel("家具宽度").fill("1700");
    await page.getByLabel("家具宽度").press("Tab");
    if ((await page.getByLabel("家具宽度").inputValue()) !== "1700")
      throw Error("dimension edit failed");
  });
  await check("rotation and undo", async () => {
    await page.getByLabel("家具旋转").fill("15");
    await page.getByLabel("家具旋转").press("Tab");
    await page.getByRole("button", { name: "↶ 撤回", exact: true }).click();
    if ((await page.getByLabel("家具旋转").inputValue()) !== "0")
      throw Error("undo failed");
  });
  await page.screenshot({ path: "../evidence/editor-2d.png", fullPage: true });
  await check("save/download and reload invariant", async () => {
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    const d = await wait;
    await d.saveAs("../evidence/ui-saved.roomfit");
    const { readFileSync } = await import("node:fs");
    const scene = JSON.parse(
      readFileSync("../evidence/ui-saved.roomfit", "utf8"),
    );
    if (scene.furniture[0].width !== 1700 || scene.units !== "mm")
      throw Error("save lost geometry");
    await page.waitForTimeout(1000);
    await page.reload();
    await enterEditor(page);
    await page.getByRole("button", { name: "二维平面", exact: true }).click();
    await page.getByRole("button", { name: "双人床", exact: true }).click();
    if ((await page.getByLabel("家具宽度").inputValue()) !== "1700")
      throw Error("recovery failed");
  });
  await check("new manually sized room", async () => {
    await page.getByRole("button", { name: "新建", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("spinbutton", { name: "宽度", exact: true })
      .fill("4000");
    await dialog.getByRole("button", { name: "创建三维空间" }).click();
    if (!(await page.getByText("12.80 m²", { exact: false }).count()))
      throw Error("new room dimensions missing");
  });
  await check(
    "functional catalogue placement and collision warning",
    async () => {
      await page
        .getByRole("button", { name: "双人床", exact: false })
        .first()
        .click();
      await page.getByLabel("家具宽度").fill("5000");
      await page.getByLabel("家具宽度").press("Tab");
      await page
        .getByRole("button", { name: /双人床 越出房间或与墙体相交/ })
        .waitFor();
    },
  );
  await check(
    "invalid dimension is rejected and rolls back without breaking the UI",
    async () => {
      await page.getByLabel("家具宽度").fill("-20");
      await page.getByLabel("家具宽度").press("Tab");
      if ((await page.getByLabel("家具宽度").inputValue()) !== "5000")
        throw Error("invalid change did not roll back");
    },
  );
  await check(
    "mature wall tool and millimetre property roundtrip",
    async () => {
      await page.getByRole("button", { name: "房间", exact: true }).click();
      await page.getByRole("button", { name: /└ 墙体 1/ }).click();
      await page.getByLabel("墙高", { exact: true }).fill("2900");
      await page.getByLabel("墙高", { exact: true }).press("Tab");
      await page.getByRole("button", { name: "打开墙体与门窗工具" }).click();
      await page.getByRole("button", { name: "绘墙", exact: true }).waitFor();
      await page
        .getByLabel("户型编辑画布", { exact: true })
        .waitFor();
      await page.screenshot({ path: "../evidence/editor-wall-tools.png" });
      await page.getByRole("button", { name: "三维编辑", exact: true }).click();
      await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
    },
  );
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  writeFileSync(
    "../evidence/ui-test-report.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
}

