const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { createServer } = require("node:http");
const { randomBytes } = require("node:crypto");
const { join, resolve, dirname } = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const fsp = fs.promises;
const { spawn, execFile } = require("node:child_process");
let win,
  server,
  currentPath,
  child,
  config = {},
  state = { status: "idle", log: "", output: null };
const root = resolve(__dirname, "..");
if (process.env.ROOMFIT_TEST_PROFILE) {
  fs.mkdirSync(process.env.ROOMFIT_TEST_PROFILE, { recursive: true });
  app.setPath("userData", process.env.ROOMFIT_TEST_PROFILE);
}
let outputDir, configPath;
function detectBlender() {
  const candidates = [
    config.blender,
    process.env.ROOMFIT_BLENDER,
    join(process.resourcesPath, "blender", "blender.exe"),
    resolve(root, "../tools/blender-4.5.9-windows-x64/blender.exe"),
  ];
  for (const base of [
    "C:\\Program Files\\Blender Foundation",
    "D:\\Program Files\\Blender Foundation",
  ]) {
    if (fs.existsSync(base))
      for (const f of fs.readdirSync(base))
        candidates.push(join(base, f, "blender.exe"));
  }
  return candidates.find((p) => p && fs.existsSync(p));
}
function bounded(json, max = 80e6) {
  if (typeof json !== "string" || Buffer.byteLength(json) > max)
    throw new Error("文件格式或大小不受支持");
  return JSON.parse(json);
}
function validateFile(data) {
  if (
    data.schema !== "RoomFit3D" ||
    ![1, 2, 3].includes(data.version) ||
    data.units !== "mm" ||
    !Array.isArray(data.walls) ||
    !Array.isArray(data.furniture)
  )
    throw new Error("RoomFit 工程版本或单位不受支持");
}
const pendingWrites = new Map();
function atomic(path, text) {
  const job = (pendingWrites.get(path) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const tmp = path + ".tmp";
      await fsp.writeFile(tmp, text, "utf8");
      if (fs.existsSync(path)) await fsp.copyFile(path, path + ".bak");
      await fsp.rename(tmp, path);
    });
  pendingWrites.set(path, job);
  return job.finally(() => {
    if (pendingWrites.get(path) === job) pendingWrites.delete(path);
  });
}
function safeFrame(event) {
  if (
    event.sender !== win?.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error("非法调用来源");
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    safeFrame(event);
    return fn(...args);
  });
}
app
  .whenReady()
  .then(async () => {
    configPath = join(app.getPath("userData"), "config.json");
    try {
      config = JSON.parse(await fsp.readFile(configPath, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") console.error(e);
    }
    outputDir =
      process.env.ROOMFIT_TEST_OUTPUT ||
      join(app.getPath("documents"), "RoomFit 3D", "renders");
    await fsp.mkdir(outputDir, { recursive: true });
    process.env.PUBLIC_ENABLE_ANALYTICS = "false";
    const { handler } = await import(
      pathToFileURL(join(root, "build", "handler.js")).href
    );
    const token = randomBytes(32).toString("hex");
    server = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.searchParams.get("session") === token) {
        res.setHeader(
          "Set-Cookie",
          `roomfit-session=${token}; HttpOnly; SameSite=Strict; Path=/`,
        );
      } else if (
        !(req.headers.cookie || "")
          .split(";")
          .some((c) => c.trim() === `roomfit-session=${token}`)
      ) {
        res.writeHead(403);
        res.end("Local session required");
        return;
      }
      if (url.pathname.startsWith("/api/") || url.pathname === "/mcp") {
        res.writeHead(404);
        res.end();
        return;
      }
      handler(req, res);
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    win = new BrowserWindow({
      width: 1520,
      height: 980,
      minWidth: 1100,
      minHeight: 720,
      title: "RoomFit 3D — Links Tam",
      icon: join(__dirname, "roomfit.ico"),
      backgroundColor: "#f4f4ee",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(`http://127.0.0.1:${server.address().port}/`))
        e.preventDefault();
    });
    // Desktop core never makes outbound requests or invokes the inherited cloud routes.
    win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
      const u = new URL(details.url);
      cb({
        cancel:
          !["data:", "blob:", "devtools:"].includes(u.protocol) &&
          u.hostname !== "127.0.0.1",
      });
    });
    const recoveryPath = join(app.getPath("userData"), "recovery.json");
    handle("preferences", async (value) => {
      if (value !== undefined) {
        if (!value || typeof value !== 'object') throw new Error('Invalid preferences');
        if(value.language!==undefined){if(!['zh','en'].includes(value.language))throw new Error('Unsupported language');config.language=value.language;}
        if(typeof value.homeDirect==='boolean')config.homeDirect=value.homeDirect;
        if(typeof value.simpleMode==='boolean')config.simpleMode=value.simpleMode;
        for(const key of ['favorites','recent'])if(value[key]!==undefined){if(!Array.isArray(value[key])||value[key].length>200||value[key].some(id=>typeof id!=='string'||id.length>160))throw new Error('Invalid library preference');config[key]=value[key];}
        if(value.personal!==undefined){if(!Array.isArray(value.personal)||value.personal.length>80||JSON.stringify(value.personal).length>32e6)throw new Error('个人家具库超过限制 / Personal library exceeds 32 MB');config.personal=value.personal;}
        await atomic(configPath, JSON.stringify(config, null, 2));
      }
      return { language: config.language || "zh", homeDirect:!!config.homeDirect, simpleMode:config.simpleMode!==false, favorites:config.favorites||[],recent:config.recent||[],personal:config.personal||[] };
    });
    handle("restore", async () => {
      try {
        return bounded(await fsp.readFile(recoveryPath, "utf8"), 180e6);
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    });
    handle("checkpoint", async (json, variants) => {
      validateFile(bounded(json));
      if (
        !Array.isArray(variants) ||
        variants.length > 20 ||
        JSON.stringify(variants).length > 16e6
      )
        throw new Error("方案恢复库超过限制，请导出工程后整理方案");
      for (const v of variants) {
        if (typeof v.name !== "string") throw new Error("无效方案");
        validateFile(bounded(v.json));
      }
      await atomic(recoveryPath, JSON.stringify({ scene: json, variants }));
      return true;
    });
    handle("save", async (json, saveAs) => {
      const data = bounded(json);
      validateFile(data);
      let path = currentPath;
      if (!path || saveAs) {
        const result = await dialog.showSaveDialog(win, {
          defaultPath: data.name + ".roomfit",
          filters: [{ name: "RoomFit 工程", extensions: ["roomfit"] }],
        });
        if (result.canceled) return null;
        path = result.filePath;
      }
      await atomic(path, json);
      currentPath = path;
      return path;
    });
    handle("open", async () => {
      const r = await dialog.showOpenDialog(win, {
        filters: [{ name: "RoomFit 工程", extensions: ["roomfit"] }],
        properties: ["openFile"],
      });
      if (r.canceled) return null;
      const path = r.filePaths[0];
      const stat = await fsp.stat(path);
      if (stat.size > 80e6) throw new Error("工程超过 80 MB");
      const json = await fsp.readFile(path, "utf8");
      validateFile(bounded(json));
      currentPath = path;
      return json;
    });
    handle("configure-blender", async () => {
      const r = await dialog.showOpenDialog(win, {
        title: "选择 Blender 程序",
        filters: [{ name: "Blender", extensions: ["exe"] }],
        properties: ["openFile"],
      });
      if (r.canceled) return null;
      const executable = r.filePaths[0];
      await new Promise((ok, no) =>
        execFile(
          executable,
          ["--version"],
          { windowsHide: true, timeout: 15000 },
          (e, out) =>
            e
              ? no(e)
              : out.startsWith("Blender ")
                ? ok()
                : no(new Error("请选择 Blender 程序")),
        ),
      );
      config.blender = executable;
      await atomic(configPath, JSON.stringify(config));
      return executable;
    });
    handle("render", async (json) => {
      if (child) throw new Error("已有渲染任务，请先取消或等待");
      const manifest = bounded(json, 120e6);
      validateFile(manifest.scene);
      if (
        manifest.schema !== "RoomFitRender" ||
        manifest.meshes?.length > 20000
      )
        throw new Error("无效渲染场景");
      const blender = detectBlender();
      if (!blender)
        throw new Error(
          "未检测到 Blender。点击“渲染器设置”选择官方 Blender 4.5+ 程序。",
        );
      const job = join(
        outputDir,
        new Date().toISOString().replace(/[:.]/g, "-"),
      );
      await fsp.mkdir(job, { recursive: true });
      const input = join(job, "scene.json");
      await fsp.writeFile(input, json);
      await fsp.writeFile(
        join(job, "snapshot.roomfit"),
        JSON.stringify(manifest.scene, null, 2),
      );
      state = {
        status: "running",
        log: "正在构建场景…",
        output: join(job, "render.png"),
        job,
      };
      const log = fs.createWriteStream(join(job, "blender.log"));
      child = spawn(
        blender,
        [
          "--background",
          "--factory-startup",
          "--disable-autoexec",
          "--python-exit-code",
          "1",
          "--python",
          app.isPackaged
            ? join(process.resourcesPath, "rendering", "cycles.py")
            : join(root, "rendering", "cycles.py"),
          "--",
          input,
          state.output,
        ],
        { windowsHide: true, shell: false },
      );
      const append = (b) => {
        const str = b.toString();
        log.write(str);
        state.log = (state.log + str).slice(-14000);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (e) => {
        state.status = "failed";
        state.log += "\n" + e.message;
        child = null;
        log.end();
      });
      child.on("close", (code) => {
        if (state.status !== "cancelled")
          state.status =
            code === 0 && fs.existsSync(state.output) ? "completed" : "failed";
        state.log += `\nExit ${code}`;
        child = null;
        log.end();
      });
      return { job };
    });
    handle("cancel", () => {
      if (child) {
        state.status = "cancelled";
        child.kill();
      }
      return state;
    });
    handle("render-status", () => ({
      ...state,
      blender: detectBlender() || null,
    }));
    handle("render-result", async () =>
      state.status === "completed"
        ? "data:image/png;base64," +
          (await fsp.readFile(state.output)).toString("base64")
        : null,
    );
    handle("export-image", async () => {
      if (state.status !== "completed") throw new Error("尚无完成的渲染图");
      const r = await dialog.showSaveDialog(win, {
        defaultPath: "RoomFit-render.png",
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!r.canceled) {
        await fsp.copyFile(state.output, r.filePath);
        return r.filePath;
      }
      return null;
    });
    handle("print-report", async (html) => {
      if (typeof html !== "string" || html.length > 2e6)
        throw new Error("报告过大");
      const r = await dialog.showSaveDialog(win, {
        defaultPath: "RoomFit-report.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (r.canceled) return null;
      const report = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          javascript: false,
        },
      });
      try {
        await report.loadURL(
          "data:text/html;charset=utf-8," + encodeURIComponent(html),
        );
        const pdf = await report.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
        });
        await fsp.writeFile(r.filePath, pdf);
        return r.filePath;
      } finally {
        report.destroy();
      }
    });
    await win.loadURL(
      `http://127.0.0.1:${server.address().port}/studio?session=${token}`,
    );
    if (process.env.ROOMFIT_SMOKE) {
      await fsp.writeFile(
        process.env.ROOMFIT_SMOKE,
        JSON.stringify({
          title: win.getTitle(),
          url: win.webContents.getURL(),
          blender: detectBlender(),
        }),
      );
      setTimeout(() => app.quit(), 4000);
    }
  })
  .catch((e) => {
    dialog.showErrorBox("RoomFit 启动失败", e.stack || e.message);
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (child) child.kill();
  server?.close();
});
