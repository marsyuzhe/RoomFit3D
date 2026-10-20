import {enterEditor} from "./editor-entry.mjs";
import { _electron as electron, expect } from "@playwright/test";
import { resolve } from "node:path";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from "node:fs";
const label = process.env.ROOMFIT_EXE ? "packaged" : "desktop";
const profile = resolve(`../evidence/${label}-profile`);
mkdirSync(profile, { recursive: true });
const file = (name) => resolve(`../evidence/${label}-${name}`);
function completeFile(path,kind) {
  try {
    const bytes=readFileSync(path);
    return kind==='png' ? bytes.subarray(1,4).toString()==='PNG'&&bytes.subarray(-8,-4).toString()==='IEND' : bytes.subarray(0,4).toString()==='%PDF'&&bytes.subarray(-32).toString().trimEnd().endsWith('%%EOF');
  } catch(error) {
    if(['ENOENT','EBUSY','EACCES'].includes(error.code))return false;
    throw error;
  }
}
for (const p of [
  file("smoke.json"),
  file("report.pdf"),
  file("export.png"),
  file("roundtrip.roomfit"),
  resolve(profile, "recovery.json"),
])
  if (existsSync(p)) rmSync(p);
const env = {
  ...process.env,
  ROOMFIT_TEST_OUTPUT: resolve(`../evidence/${label}-renders/中文 路径测试`),
  ROOMFIT_TEST_PROFILE: profile,
  ROOMFIT_BLENDER: process.env.ROOMFIT_BLENDER || "blender",
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.ROOMFIT_SMOKE;
const options = {
  executablePath:
    process.env.ROOMFIT_EXE ||
    resolve("node_modules/electron/dist/electron.exe"),
  args: process.env.ROOMFIT_EXE ? [] : ["."],
  cwd: process.cwd(),
  env,
};
const runtime = await electron.launch(options);
let report;
try {
  const page = await runtime.firstWindow();
  await page.waitForURL("**/studio?session=*");
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await page.getByLabel("项目名称").fill("桌面重启恢复验证");
  const status = await page.evaluate(() => window.roomfit.status());
  await runtime.evaluate(
    ({ dialog }, { base, label }) => {
      dialog.showSaveDialog = async (_win, options) => ({
        canceled: false,
        filePath:
          base +
          "/" +
          label +
          (options.defaultPath.endsWith(".png")
            ? "-export.png"
            : options.defaultPath.endsWith(".pdf")
              ? "-report.pdf"
              : "-roundtrip.roomfit"),
      });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [base + "/" + label + "-roundtrip.roomfit"],
      });
    },
    { base: resolve("../evidence"), label },
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => existsSync(file("roundtrip.roomfit"))).toBe(true);
  if (
    JSON.parse(readFileSync(file("roundtrip.roomfit"), "utf8")).name !==
    "桌面重启恢复验证"
  )
    throw Error("Save mismatch");
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await page.getByRole("button", { name: "出图", exact: true }).click();
  await page.getByLabel("输出分辨率").selectOption("960x540");
  await page.getByLabel("采样数").fill("16");
  await page.getByLabel("相机视角").selectOption("interior");
  await page.getByRole("button", { name: "启动高清渲染", exact: true }).click();
  const deadline=Date.now()+90000;
  while(true){const state=await page.evaluate(()=>window.roomfit.status());if(state.status==='failed')throw Error(state.log);if(state.status==='completed')break;if(Date.now()>deadline)throw Error('Render deadline exceeded');await page.waitForTimeout(250);}
  await page.locator(".render-image").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "保存 Cycles 原图" }).click();
  await expect
    .poll(
      () => completeFile(file('export.png'),'png'),
    )
    .toBe(true);
  await page.getByRole("button", { name: "方案", exact: true }).click();
  await page.getByRole("button", { name: "保存当前为新方案" }).click();
  await page.getByRole("button", { name: "导出 PDF 平面与家具清单" }).click();
  await expect
    .poll(
      () => completeFile(file('report.pdf'),'pdf'),
      { timeout: 20000 },
    )
    .toBe(true);
  await expect
    .poll(
      () => {
        try {
          const r = JSON.parse(
            readFileSync(resolve(profile, "recovery.json"), "utf8"),
          );
          return (
            JSON.parse(r.scene).name === "桌面重启恢复验证" &&
            r.variants.length === 1
          );
        } catch {
          return false;
        }
      },
      { timeout: 10000 },
    )
    .toBe(true);
  await page.screenshot({ path: file("window.png") });
  const final = await page.evaluate(() => window.roomfit.status());
  report = {
    title: await page.title(),
    blender: status.blender,
    bridge: true,
    canvas: true,
    nativeSaveOpen: true,
    nativeCycles: final.status,
    nativeRenderOutput: final.output,
    pdfBytes: readFileSync(file("report.pdf")).length,
    pngBytes: readFileSync(file("export.png")).length,
  };
} finally {
  await runtime.close();
}
const restarted = await electron.launch(options);
try {
  const page = await restarted.firstWindow();
  await enterEditor(page);
  await page.locator("[data-roomfit-canvas]").waitFor();
  await expect(page.getByLabel("项目名称")).toHaveValue("桌面重启恢复验证");
  await page.getByRole("button", { name: "方案", exact: true }).click();
  await page.getByRole("button", { name: /方案 A ·/ }).waitFor();
  report.restartRecovery = true;
  report.variantsRecovered = true;
  writeFileSync(file("smoke.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await restarted.close();
}

