<script lang="ts">
  import { tr, language, initializeLanguage } from "$lib/roomfit/i18n";
  import { onMount } from "svelte";
  import Home from "$lib/roomfit/Home.svelte";
  import Mall from "$lib/roomfit/Mall.svelte";
  import PersonalLibrary from '$lib/roomfit/PersonalLibrary.svelte';
  import type {PersonalItem} from '$lib/roomfit/PersonalLibrary.svelte';
  import {templateScene} from "$lib/roomfit/templates";
  import {lengthMm,validateDimension,attach,syncSupports,replaceItem,temperatureColor} from "$lib/roomfit/editing";
  import { version } from "../../../package.json";
  import Viewport from "$lib/roomfit/Viewport.svelte";
  import Plan from "$lib/roomfit/Plan.svelte";
  import AdvancedPlan from "$lib/roomfit/AdvancedPlan.svelte";
  import FloorPlanImport from "$lib/roomfit/FloorPlanImport.svelte";
  import ScanImport from "$lib/roomfit/ScanImport.svelte";
  import { toOpenPlan, fromOpenPlan } from "$lib/roomfit/openplanAdapter";
  import {
    bedroom,
    createRoom,
    addItem,
    catalog,
    readScene,
    uid,
    type RoomScene,
    type Furniture,
    type FloorPlan,
  } from "$lib/roomfit/scene";
  import {
    analyze,
    area,
    clearance,
    distance,
    footprint,
  } from "$lib/roomfit/geometry";
  import {
    History,
    encodeScene,
    decodeScene,
    download,
    furnitureCSV,
    planSVG,
  } from "$lib/roomfit/storage";
  import { renderManifest } from "$lib/roomfit/buildScene";
  let home=$state(true), homeDirect=$state(false),simpleMode=$state(true),favorites=$state<string[]>([]),recent=$state<string[]>([]);
  const say=(zh:string,en:string)=>$language==='zh'?zh:en;
  async function preference(value:Record<string,unknown>){try{if(api())await api().preferences(value);else {const old=JSON.parse(localStorage.getItem('roomfit-settings')||'{}');localStorage.setItem('roomfit-settings',JSON.stringify({...old,...value}));}}catch(e){error=String(e);}}
  function favorite(id:string){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];void preference({favorites});}
  function addPersonal(p:PersonalItem){change(()=>{const f=addItem(s,p.catalogId);Object.assign(f,{name:p.name,width:p.width,depth:p.depth,height:p.height,color:p.color,brand:p.brand,model:p.model,sourceUrl:p.sourceUrl,confidence:'estimated'});if(p.asset){f.assetId='personal-'+p.id;s.assets[f.assetId]=p.asset;}selected=f.id;});}
  function chooseTemplate(id:string){change(()=>{s=templateScene(id);selected=null;home=false;},say('已载入可编辑示例模板','Editable example loaded'));mode='3d';}
  function nudge(dx:number,dz:number){if(item)move(item.id,item.x+dx,item.z+dz);}
  function align(edge:'left'|'right'|'back'|'front'|'center'){if(!item||item.locked)return;change(()=>{const p=s.rooms[0].polygon,minX=Math.min(...p.map(p=>p.x)),maxX=Math.max(...p.map(p=>p.x)),minZ=Math.min(...p.map(p=>p.z)),maxZ=Math.max(...p.map(p=>p.z)),a=item!.rotation*Math.PI/180,hw=(Math.abs(item!.width*Math.cos(a))+Math.abs(item!.depth*Math.sin(a)))/2,hd=(Math.abs(item!.width*Math.sin(a))+Math.abs(item!.depth*Math.cos(a)))/2;delete item!.support;if(edge==='left')item!.x=minX+hw;if(edge==='right')item!.x=maxX-hw;if(edge==='back')item!.z=minZ+hd;if(edge==='front')item!.z=maxZ-hd;if(edge==='center')item!.x=(minX+maxX)/2;});}
  function replace(id:string){if(item)change(()=>replaceItem(s,item!,id));}
  function dimensionInput(key:string,input:HTMLInputElement){try{const n=lengthMm(input.value);validateDimension(item!,key,n);patch(key as keyof Furniture,n,input);}catch(e){error=String(e);input.value=String(item?.[key as 'width'|'depth'|'height']||'');}}
  let s = $state<RoomScene>(bedroom()),
    selected = $state<string | null>(null),
    mode = $state("3d"),
    cameraMode = $state("orbit"),
    quality = $state("high");
  let tab = $state("furniture"),
    search = $state(""),
    status = $state("本地编辑 · 项目尚未保存"),
    error = $state(""),
    showNew = $state(false),
    showChecks = $state(true);
  let width = $state(3600),
    depth = $state(3200),
    height = $state(2800),
    thickness = $state(120),
    shape = $state<"rectangle" | "L">("rectangle");
  let history = new History();
  let openInput = $state<HTMLInputElement>();
  let advanced = $state.raw<AdvancedPlan>();
  let showImport = $state(false);
  let showScan = $state(false);
  function createFromScan(next: RoomScene) {
    change(() => {
      s = next;
      showScan = false;
      home = false;
      selected = null;
    }, "扫描已导入；尺寸仍需现场复测");
    mode = "plan-edit";
  }
  function attachFloorPlan(plan: FloorPlan) {
    change(() => {
      s.floorPlan = plan;
      showImport = false;
      home = false;
      selected = null;
    }, "已附加毫米校准底图，当前几何保留");
    mode = "plan-edit";
  }
  function createFromFloorPlan(next: RoomScene) {
    change(() => {
      s = next;
      showImport = false;
      home = false;
      selected = null;
    }, "已由人工取舍的墙线生成工程；门窗待确认");
    mode = "plan-edit";
  }
  let renderStatus = $state("idle"),
    renderLog = $state(""),
    renderImage = $state(""),
    rendererPath = $state("");
  let variants = $state<{ name: string; json: string }[]>([]),
    currentVariant = $state(0);
  let debounce: ReturnType<typeof setTimeout>;
  let loaded = false;
  const item = $derived(s.furniture.find((f) => f.id === selected));
  const selectedWall = $derived(s.walls.find((w) => w.id === selected));
  const selectedOpening = $derived(s.openings.find((o) => o.id === selected));
  const findings = $derived(analyze(s));
  const totalArea = $derived(
    s.rooms.reduce((sum, r) => sum + area(r.polygon), 0) / 1e6,
  );
  const labels: Record<string, string> = {
    measured: "现场实测确认",
    drawing: "可信图纸",
    manufacturer: "厂商尺寸",
    confirmed: "用户确认",
    estimated: "估算 · 待确认",
  };
  const api = () =>
    typeof window !== "undefined" ? (window as any).roomfit : null;
  function change(action: () => void, message = "已更新") {
    advanced?.flush();
    const before = JSON.parse(JSON.stringify(s));
    try {
      action();
      s.modifiedAt = new Date().toISOString();
      syncSupports(s);
      readScene(s);
      history.push(before);
      status = message;
      error = "";
    } catch (e) {
      s = before;
      error = e instanceof Error ? e.message : String(e);
    }
  }
  function patch(key: keyof Furniture, value: any, input?: HTMLInputElement) {
    if (
      !item ||
      (item.locked &&
        ["width", "depth", "height", "x", "y", "z", "rotation"].includes(key))
    )
      return;
    change(() => {const f=s.furniture.find(f=>f.id===selected)!;if(f.support){const parent=s.furniture.find(p=>p.id===f.support!.parentId)!;if(key==='x'||key==='z')delete f.support;else if(key==='rotation')f.support.rotation=value-parent.rotation;else if(key==='y')f.support.offsetY=value-parent.y-parent.height;}Object.assign(f,{[key]:value});});
    if (input)
      input.value = String(
        s.furniture.find((f) => f.id === selected)?.[key] ?? "",
      );
  }
  function move(id: string, x: number, z: number) {
    const f = s.furniture.find((f) => f.id === id);
    if (!f || f.locked) return;
    change(() => {delete f.support;Object.assign(f, { x, z });}, "家具已移动 · 10 mm 网格吸附");
  }
  function add(id: string) {
    change(() => {
      const def=catalog.find(c=>c.id===id)!;
      const context=item?.support?s.furniture.find(f=>f.id===item!.support!.parentId):item;
      const parent=context&&catalog.find(c=>c.id===context.catalogId)?.family==='desk'?context:s.furniture.findLast(f=>catalog.find(c=>c.id===f.catalogId)?.family==='desk');
      const room=s.rooms[0].polygon;
      const f = addItem(s,id,(def.placement==='surface'||def.family==='monitor'||def.family==='chair')?parent?.x ?? (Math.min(...room.map(p=>p.x))+Math.max(...room.map(p=>p.x)))/2:(Math.min(...room.map(p=>p.x))+Math.max(...room.map(p=>p.x)))/2,parent?.z ?? (Math.min(...room.map(p=>p.z))+Math.max(...room.map(p=>p.z)))/2);
      if(parent&&(def.placement==='surface'||def.family==='monitor'&&id!=='television'))attach(s,f,parent);
      if(def.family==='chair'&&parent){f.x=parent.x;f.z=parent.z+parent.depth/2+f.depth/2+150;f.rotation=180;}
      if(def.placement==='wall'&&id!=='curtain'){f.y=Math.min(1800,s.rooms[0].height-f.height);f.z=Math.min(...room.map(p=>p.z))+f.depth/2+10;}
      if(def.placement==='ceiling')f.y=s.rooms[0].height-f.height;
      selected = f.id;
      recent=[id,...recent.filter(x=>x!==id)].slice(0,30);void preference({recent});
    }, "家具已添加 · 请确认商品尺寸");
  }
  function remove() {
    if (!item || item.locked) return;
    change(() => {
      for(const child of s.furniture)if(child.support?.parentId===selected)delete child.support;
      s.furniture = s.furniture.filter((f) => f.id !== selected);
      selected = null;
    }, "已删除家具");
  }
  function duplicate() {
    if (!item) return;
    change(() => {
      const f = {
        ...JSON.parse(JSON.stringify(item!)),
        id: uid(),
        x: item!.x + 100,
        z: item!.z + 100,
        locked: false,
      };
      if(f.support){f.support.x+=100;f.support.z+=100;}
      s.furniture.push(f);
      selected = f.id;
    }, "已复制家具");
  }
  function undo() {
    advanced?.flush();
    s = history.undo(s);
    status = "已撤回";
  }
  function redo() {
    advanced?.flush();
    s = history.redo(s);
    status = "已重做";
  }
  function wallProperty(key: "thickness" | "height", value: number) {
    change(() => {
      const next = JSON.parse(JSON.stringify(s));
      next.walls.find((w: any) => w.id === selected)[key] = value;
      s = fromOpenPlan(toOpenPlan(next), next);
    }, "墙体与内部净轮廓已同步更新");
  }
  function newRoom() {
    try {
      const next = createRoom(width, depth, height, thickness, shape);
      change(() => {
        s = next;
        selected = null;
        showNew = false;
        home = false;
      });
    } catch (e) {
      error = String(e);
    }
  }
  function resizeRoom() {
    change(() => {
      const next = createRoom(width, depth, height, thickness, shape);
      next.furniture = s.furniture;
      next.materials = s.materials;
      next.floorPlan = s.floorPlan;
      next.name = s.name;
      next.id = s.id;
      next.createdAt = s.createdAt;
      s = next;
    }, "房间几何已更新，家具保留原坐标");
  }
  async function save(saveAs = false) {
    advanced?.flush();
    try {
      if (api()) {
        const path = await api().save(encodeScene(s), saveAs);
        if (path) status = "工程已保存：" + path;
      } else {
        download(s.name + ".roomfit", encodeScene(s), "application/json");
        status = "已导出 .roomfit 工程";
      }
    } catch (e) {
      error = String(e);
    }
  }
  async function open() {
    try {
      if (api()) {
        const json = await api().open();
        if (json)
          change(() => {
            s = decodeScene(json);
            selected = null;
          }, "工程已载入");
      } else openInput?.click();
    } catch (e) {
      error = String(e);
    }
  }
  async function readFile(e: Event) {
    try {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 80e6) throw new Error("工程超过 80 MB");
      const next = decodeScene(await file.text());
      change(() => {
        s = next;
        selected = null;
      }, "工程已载入");
    } catch (e) {
      error = String(e);
    } finally {
      if(openInput)openInput.value = "";
    }
  }
  async function configure() {
    try {
      if (!api()) throw new Error("请运行 Windows 桌面版以配置本地 Blender");
      const path = await api().configure();
      if (path) rendererPath = path;
    } catch (e) {
      error = String(e);
    }
  }
  async function render() {
    advanced?.flush();
    try {
      if (!api())
        throw new Error(
          "高清渲染需要运行 RoomFit 3D 桌面版。开发测试请使用 scripts/render-sample.ps1。",
        );
      const manifest = renderManifest(s);
      await api().render(JSON.stringify(manifest));
      renderStatus = "running";
      tab = "render";
      status = "Cycles 后台任务已启动";
      error = "";
    } catch (e) {
      error = String(e);
    }
  }
  async function cancelRender() {
    try {
      await api()?.cancel();
      renderStatus = "cancelled";
    } catch (e) {
      error = String(e);
    }
  }
  function camera(position: number[], target: number[]) {
    s.camera.position = position as [number, number, number];
    s.camera.target = target as [number, number, number];
  }
  function copyVariant() {
    advanced?.flush();
    if (variants.length >= 20) {
      error = "本地方案最多 20 套，请先导出工程。";
      return;
    }
    const next = [
      ...variants,
      {
        name: "方案 " + String.fromCharCode(65 + variants.length),
        json: encodeScene(s),
      },
    ];
    if (JSON.stringify(next).length > 16e6) {
      error = "方案快照超过 16 MB，请先另存工程或减小底图。";
      return;
    }
    variants = next;
    currentVariant = variants.length - 1;
    status = "当前方案已保存到方案列表";
  }
  function switchVariant(i: number) {
    change(() => {
      s = decodeScene(variants[i].json);
      currentVariant = i;
      selected = null;
    }, "已切换方案");
  }
  async function pdf() {
    advanced?.flush();
    try {
      const esc = (x: any) =>
        String(x).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c]!,
        );
      const html = `<!doctype html><html><meta charset="utf-8"><style>body{font:11px sans-serif;padding:12px;color:#253c30}p{margin:6px 0}h2{font-size:15px;margin:16px 0 8px}tr{break-inside:avoid}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px}svg{max-width:100%;height:290px}h1{font-size:24px}</style><h1>RoomFit 3D · ${esc(s.name)}</h1><p>${totalArea.toFixed(2)} m² · ${esc(new Date().toLocaleString($language === "en" ? "en-GB" : "zh-CN"))} · Links Tam</p>${planSVG(s, $language)}<h2>${esc($tr("家具尺寸清单 · mm"))}</h2><table><tr><th>${esc($tr("名称"))}</th><th>${esc($tr("宽 × 深 × 高"))}</th><th>${esc($tr("尺寸来源"))}</th></tr>${s.furniture.map((f) => `<tr><td>${esc($tr(f.name))}</td><td>${f.width} × ${f.depth} × ${f.height}</td><td>${esc($tr(labels[f.confidence]))}</td></tr>`).join("")}</table><h2>${esc($tr("空间检查"))}</h2>${findings.map((f) => `<p>${esc($tr(f.message))}</p>`).join("")}<p>${esc($tr("净距目标"))} ${s.clearanceTarget} ${esc($tr("mm 为用户偏好，未作规范合规判断。"))}</p></html>`;
      if (api()) {
        const p = await api().print(html);
        if (p) status = "PDF 已保存：" + p;
      } else download(s.name + "-report.html", html, "text/html");
    } catch (e) {
      error = String(e);
    }
  }
  function screenshot() {
    const canvas = document.querySelector(
      "[data-roomfit-canvas]",
    ) as HTMLCanvasElement;
    if (canvas) {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = s.name + "-实时预览.png";
      a.click();
      status = "已导出真实实时预览图";
    }
  }
  $effect(() => {
    const json = JSON.stringify(s);
    const snapshots = JSON.stringify(variants);
    if (!loaded) return;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        decodeScene(json);
        if (api()) await api().checkpoint(json, JSON.parse(snapshots));
        else {
          localStorage.setItem("roomfit-recovery", json);
          localStorage.setItem("roomfit-variants", snapshots);
        }
      } catch (e) {
        error = "自动恢复保存失败：" + String(e);
      }
    }, 700);
  });
  onMount(() => {
    document.documentElement.classList.add("roomfit-light");
    void (async()=>{try{const p=api()?await api().preferences():JSON.parse(localStorage.getItem('roomfit-settings')||'{}');homeDirect=!!p.homeDirect;simpleMode=p.simpleMode!==false;home=!homeDirect;favorites=p.favorites||[];recent=p.recent||[];}catch{}})();
    void initializeLanguage();
    void (async () => {
      try {
        const native = api() ? await api().restore() : null;
        const recovery = api()
          ? native?.scene
          : localStorage.getItem("roomfit-recovery");
        if (recovery) {
          s = decodeScene(recovery);
          status = "已恢复上次本地编辑";
        }
        const saved = api()
          ? native?.variants
          : JSON.parse(localStorage.getItem("roomfit-variants") || "[]");
        if (saved) {
          for (const v of saved) decodeScene(v.json);
          variants = saved;
        }
      } catch (e) {
        error = "恢复文件无效：" + String(e);
      }
      loaded = true;
    })();
    const timer = setInterval(async () => {
      if (!api()) return;
      try {
        const state = await api().status();
        rendererPath = state.blender || "";
        renderLog = state.log;
        const changed = renderStatus !== state.status;
        renderStatus = state.status;
        if (changed && state.status === "completed") {
          renderImage = await api().result();
          status = "Cycles 渲染完成";
          mode = "render";
        }
        if (changed && state.status === "failed")
          error = "渲染失败，请展开任务日志查看原因";
      } catch (e) {
        error = String(e);
      }
    }, 1000);
    const key = (e: KeyboardEvent) => {
      if (showImport || showScan) return;
      if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        save();
      }
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.shiftKey ? redo() : undo();
      }
      if (mode !== "plan-edit") {
        if (e.key === "Delete") remove();
        if (e.key === "r" && item)
          patch("rotation", (item.rotation + 15) % 360);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      document.documentElement.classList.remove("roomfit-light");
      clearInterval(timer);
      clearTimeout(debounce);
      window.removeEventListener("keydown", key, true);
    };
  });
</script>

<svelte:head
  ><title>RoomFit 3D — Links Tam</title><meta
    name="description"
    content={$tr("本地优先、真实尺寸驱动的三维家居设计")}
  /></svelte:head
>
{#if home}<Home recent={s.name} direct={homeDirect} ondirect={v=>{homeDirect=v;void preference({homeDirect:v});}} onupload={()=>showImport=true} ondimensions={()=>showNew=true} ontemplate={chooseTemplate} oncontinue={()=>home=false} onopen={async()=>{await open();home=false;}}/>{:else}
<div class="app" class:simple={simpleMode}>
  <header>
    <div class="brand">
      <span class="mark">R<span>3D</span></span>
      <div>
        <strong>RoomFit <em>3D</em></strong><small
          >{$tr("空间有尺度，设计有依据")}</small
        >
      </div>
    </div>
    <div class="document">
      <input aria-label={$tr("项目名称")} bind:value={s.name} /><span
        >{$tr("● 本地工程")}</span
      >
    </div>
    <div class="header-actions">
      <button onclick={()=>home=true}>{say('首页','Home')}</button>
      <button aria-label={say('切换操作模式','Switch editing mode')} onclick={()=>{simpleMode=!simpleMode;void preference({simpleMode});}}>{simpleMode?say('简单模式','Simple mode'):say('专业模式','Professional mode')}</button>
      <button onclick={() => (showNew = true)}>{$tr("新建")}</button><button
        onclick={() => {
          advanced?.flush();
          showImport = true;
        }}>{$tr("导入图纸")}</button
      ><button
        onclick={() => {
          advanced?.flush();
          showScan = true;
        }}>{$tr("导入扫描")}</button
      ><button onclick={open}>{$tr("打开")}</button><button
        onclick={() => save()}>{$tr("保存")}</button
      ><button onclick={() => save(true)}>{$tr("另存为")}</button><i></i><button
        onclick={undo}
        title="Ctrl+Z">{$tr("↶ 撤回")}</button
      ><button onclick={redo}>{$tr("↷ 重做")}</button><button
        class="primary"
        onclick={render}
        disabled={renderStatus === "running"}>{$tr("◈ 高清渲染")}</button
      >
      <select
        class="language-select"
        aria-label="界面语言 / Interface language"
        value={$language}
        onchange={(e) => language.set(e.currentTarget.value as "zh" | "en")}
        ><option value="zh">简体中文</option><option value="en">English</option
        ></select
      >
    </div>
  </header>
  <div class="workspace">
    <aside class="library">
      <nav>
        {#each [["furniture", $tr("家具")], ["room", $tr("房间")], ["materials", $tr("材质")], ["variants", $tr("方案")], ["render", $tr("出图")]] as [id, label]}<button
            class:active={tab === id}
            onclick={() => (tab = id)}>{$tr(label)}</button
          >{/each}
      </nav>
      {#if tab === "furniture"}<Mall onadd={add} onreplace={replace} selected={!!item&&!item.locked} {favorites} {recent} onfavorite={favorite} scene={s}/><PersonalLibrary onadd={addPersonal}/>
      {:else if tab === "room"}<div class="section-title">
          {$tr("房屋结构")}
        </div>
        <div class="fields">
          <label
            >{$tr("房间宽度 mm")}<input
              type="number"
              min="800"
              bind:value={width}
            /></label
          ><label
            >{$tr("房间进深 mm")}<input
              type="number"
              min="800"
              bind:value={depth}
            /></label
          ><label
            >{$tr("层高 mm")}<input
              type="number"
              min="1800"
              bind:value={height}
            /></label
          ><label
            >{$tr("墙厚 mm")}<input
              type="number"
              min="50"
              bind:value={thickness}
            /></label
          ><label
            >{$tr("轮廓")}<select bind:value={shape}
              ><option value="rectangle">{$tr("矩形")}</option><option value="L"
                >{$tr("L 形")}</option
              ></select
            ></label
          ><button class="primary" onclick={resizeRoom}
            >{$tr("应用房间尺寸")}</button
          >
          <p class="note">
            {$tr("家具保留原始毫米坐标，空间检查会重新计算。")}
          </p>
          <button onclick={() => (mode = "plan-edit")}
            >{$tr("打开墙体与门窗工具")}</button
          >
          <h3>{$tr("结构对象")}</h3>
          {#each s.walls as w, i}<button
              class="tree"
              onclick={() => (selected = w.id)}
              >{$tr("└ 墙体")}
              {i + 1}<span
                >{Math.round(
                  Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z),
                )} mm</span
              ></button
            >{/each}{#each s.openings as o}<button
              class="tree"
              onclick={() => (selected = o.id)}
              >└ {o.kind === "door" ? $tr("门") : $tr("窗")}<span
                >{o.width} × {o.height}</span
              ></button
            >{/each}<label
            >{$tr("房屋尺寸来源")}<select bind:value={s.dimensionConfidence}
              >{#each Object.entries(labels) as [value, label]}<option {value}
                  >{$tr(label)}</option
                >{/each}</select
            ></label
          >
        </div>
      {:else if tab === "materials"}<div class="section-title">
          {$tr("装修材质")}
        </div>
        <div class="fields">
          {#each ["floor", "wall"] as role}{@const m =
              s.materials[role as "floor" | "wall"]}
            <h3>{role === "floor" ? $tr("地面") : $tr("墙面")}</h3>
            <label
              >{$tr("材质")}<select
                value={m.kind}
                onchange={(e) =>
                  change(() => {
                    m.kind = e.currentTarget.value as any;
                  })}
                ><option value="wood">{$tr("木材")}</option><option
                  value="paint">{$tr("乳胶漆")}</option
                ><option value="tile">{$tr("瓷砖")}</option><option
                  value="concrete">{$tr("混凝土")}</option
                ><option value="fabric">{$tr("织物")}</option></select
              ></label
            ><label
              >{$tr("基础色")}<input
                type="color"
                value={m.color}
                onchange={(e) =>
                  change(() => {
                    m.color = e.currentTarget.value;
                  })}
              /></label
            ><label
              >{$tr("粗糙度")}<input
                type="range"
                min="0"
                max="1"
                step=".01"
                value={m.roughness}
                onchange={(e) =>
                  change(() => {
                    m.roughness = +e.currentTarget.value;
                  })}
              /></label
            ><label
              >{$tr("铺装尺度 mm")}<input
                type="number"
                min="50"
                value={m.tileMm}
                onchange={(e) =>
                  change(() => {
                    m.tileMm = +e.currentTarget.value;
                  })}
              /></label
            >{/each}
        </div>
      {:else if tab === "variants"}<div class="section-title">
          {$tr("本地方案")}
        </div>
        <div class="fields">
          <button class="primary" onclick={copyVariant}
            >{$tr("保存当前为新方案")}</button
          >{#each variants as v, i}<button
              class:active={currentVariant === i}
              onclick={() => switchVariant(i)}
              >{v.name} · {decodeScene(v.json).furniture.length}
              {$tr("件家具")}</button
            >{/each}
          <p class="note">
            {$tr("切换前可保存为新方案。方案快照保存在本机自动恢复库中。")}
          </p>
          <button
            onclick={() =>
              download(s.name + ".csv", furnitureCSV(s, $language), "text/csv")}
            >{$tr("导出家具 CSV")}</button
          ><button
            onclick={() =>
              download(s.name + ".svg", planSVG(s, $language), "image/svg+xml")}
            >{$tr("导出 SVG 平面图")}</button
          ><button onclick={pdf}>{$tr("导出 PDF 平面与家具清单")}</button
          ><button onclick={screenshot}>{$tr("导出实时预览 PNG")}</button>
        </div>
      {:else}<div class="section-title">Blender Cycles</div>
        <div class="fields">
          <label
            >{$tr("照明预设")}<select bind:value={s.render.preset}
              ><option value="day">{$tr("白天自然光")}</option><option
                value="overcast">{$tr("阴天")}</option
              ><option value="dusk">{$tr("黄昏")}</option><option value="night"
                >{$tr("夜晚开灯")}</option
              ></select
            ></label
          ><label
            >{$tr("输出分辨率")}<select
              value={`${s.render.width}x${s.render.height}`}
              onchange={(e) => {
                const [w, h] = e.currentTarget.value.split("x").map(Number);
                s.render.width = w;
                s.render.height = h;
              }}
              ><option value="960x540">{$tr("快速 · 960 × 540")}</option><option
                value="1920x1080">{$tr("标准 · 1920 × 1080")}</option
              ><option value="2560x1440">2K · 2560 × 1440</option><option
                value="3840x2160">4K · 3840 × 2160</option
              ></select
            ></label
          ><label
            >{$tr("采样数")}<input
              type="number"
              min="1"
              max="1024"
              bind:value={s.render.samples}
            /></label
          ><label
            >{$tr("曝光 EV")}<input
              type="number"
              min="-4"
              max="4"
              step=".25"
              bind:value={s.render.exposure}
            /></label
          ><label
            >{$tr("相机视场 °")}<input
              type="number"
              min="25"
              max="85"
              bind:value={s.camera.fov}
            /></label
          >
          <p class="note">
            {$tr("使用当前三维机位。先切换“室内”构图，拖动调整后出图。")}
          </p>
          <button onclick={configure}>{$tr("渲染器设置")}</button><small
            class="path">{rendererPath || $tr("尚未检测到 Blender")}</small
          ><button
            class="primary"
            onclick={render}
            disabled={renderStatus === "running"}>{$tr("启动高清渲染")}</button
          >{#if renderStatus === "running"}<button onclick={cancelRender}
              >{$tr("取消当前任务")}</button
            >{/if}{#if renderImage}<button
              onclick={async () => {
                try {
                  const p = await api().exportImage();
                  if (p) status = "图片已保存：" + p;
                } catch (e) {
                  error = String(e);
                }
              }}>{$tr("保存 Cycles 原图")}</button
            >{/if}
          <details>
            <summary>{$tr("任务日志 ·")} {$tr(renderStatus)}</summary>
            <pre>{renderLog || $tr("尚无渲染任务")}</pre>
          </details>
        </div>{/if}
      <footer>
        © 2026 Links Tam <span>v{version} · {$tr("离线核心")}</span>
      </footer>
    </aside>
    <main>
      <div class="viewbar">
        <div class="segmented">
          {#each [["2d", $tr("二维平面")], ["3d", $tr("三维编辑")], ["render", $tr("效果图")]] as [value, label]}<button
              class:active={mode === value}
              onclick={() => (mode = value)}>{$tr(label)}</button
            >{/each}
        </div>
        <span
          >{totalArea.toFixed(2)} m² <b>·</b>
          {s.furniture.length}
          {$tr("件家具")}</span
        >
        <div class="view-options">
          <select aria-label={$tr("相机视角")} bind:value={cameraMode}
            ><option value="orbit">{$tr("轴测")}</option><option
              value="interior">{$tr("室内")}</option
            ><option value="top">{$tr("俯视")}</option><option value="walk"
              >{$tr("漫游")}</option
            ></select
          ><select aria-label={$tr("预览画质")} bind:value={quality}
            ><option value="high">{$tr("高画质")}</option><option value="medium"
              >{$tr("中画质")}</option
            ><option value="low">{$tr("低画质")}</option></select
          >
        </div>
      </div>
      <div class="canvas">
        {#if mode === "plan-edit"}<AdvancedPlan
            bind:this={advanced}
            scene={s}
            onchange={(next) =>
              change(() => {
                s = next;
              }, "墙体、门窗和净轮廓已同步")}
            onselect={(id) => (selected = id)}
            onerror={(e) => (error = e)}
          />{:else if mode === "2d"}<Plan
            scene={s}
            {selected}
            onselect={(id) => (selected = id)}
            onmove={move}
          />{:else if mode === "3d"}<Viewport
            scene={s}
            {selected}
            onselect={(id) => (selected = id)}
            onmove={move}
            oncamera={camera}
            {cameraMode}
            {quality}
          />{:else if renderImage}<img
            class="render-image"
            src={renderImage}
            alt={$tr("当前场景的 Blender Cycles 实际渲染结果")}
          />{:else}<div class="empty">
            <span>◈</span>
            <h2>{$tr("从真实空间，到真实光影")}</h2>
            <p>{$tr("在三维视图中调整机位，再启动本地 Cycles 渲染。")}</p>
            <button
              class="primary"
              onclick={() => {
                tab = "render";
                mode = "3d";
                cameraMode = "interior";
              }}>{$tr("设置渲染")}</button
            >
          </div>{/if}
        {#if item && mode!=='render'}<div class="floating-tools" data-furniture-toolbar>
          <b>{item.name}</b><button disabled={item.locked} onclick={()=>patch('rotation',(item.rotation+90)%360)}>{say('旋转','Rotate')} ↻</button><button onclick={duplicate}>{$tr('复制')}</button><button disabled={item.locked} onclick={remove}>{$tr('删除')}</button><button onclick={()=>patch('locked',!item.locked)}>{item.locked?say('解锁','Unlock'):say('锁定','Lock')}</button><input aria-label={say('快捷材质颜色','Quick material color')} type="color" value={item.color} onchange={e=>patch('color',e.currentTarget.value)}/>
          <div><button disabled={item.locked} onclick={()=>nudge(-50,0)}>←</button><button disabled={item.locked} onclick={()=>nudge(0,-50)}>↑</button><button disabled={item.locked} onclick={()=>nudge(0,50)}>↓</button><button disabled={item.locked} onclick={()=>nudge(50,0)}>→</button><button disabled={item.locked} onclick={()=>align('back')}>{say('靠后墙','Back wall')}</button><button disabled={item.locked} onclick={()=>align('center')}>{say('水平居中','Center')}</button></div>
        </div>{/if}
        <div class="canvas-tag">
          {mode === "2d" ? "PLAN" : mode === "render" ? "CYCLES" : "DESIGN"}
          <span>{$tr("1:1 尺寸数据")}</span>
        </div>
      </div>
      <section class="checks">
        <button class="checks-title" onclick={() => (showChecks = !showChecks)}
          ><span class:bad={findings.some((f) => f.severity === "error")}
            >●</span
          >
          {$tr("空间检查")}
          <small
            >{findings.filter((f) => f.severity === "error").length}
            {$tr("处几何问题 ·")}
            {findings.filter((f) => f.severity === "warning").length}
            {$tr("项待确认")}</small
          ><span class="collapse">{showChecks ? "⌄" : "⌃"}</span></button
        >{#if showChecks}<div class="check-list">
            {#if !findings.length}<p>
                {$tr("当前几何检查未发现碰撞。请按现场尺寸核对。")}
              </p>{/if}{#each findings as f}<button
                class:problem={f.severity === "error"}
                onclick={() => (selected = f.ids[0] || null)}
                ><span>{f.severity === "error" ? "!" : "○"}</span>{$tr(
                  f.message,
                )}</button
              >{/each}
          </div>{/if}
      </section>
    </main>
    <aside class="properties">
      <div class="section-title">
        {item
          ? $tr("家具属性")
          : selectedWall
            ? $tr("墙体属性")
            : selectedOpening
              ? $tr("门窗属性")
              : $tr("项目概览")}<small>mm</small>
      </div>
      {#if item}<div class="fields">
          <label
            >{$tr("名称")}<input
              value={item.name}
              onchange={(e) => patch("name", e.currentTarget.value)}
            /></label
          >
          <div class="badge">{$tr(labels[item.confidence])}</div>
          <h3>{$tr("真实尺寸")}</h3>
          <div class="triple">
            {#each [["width", $tr("宽")], ["depth", $tr("深")], ["height", $tr("高")]] as [key, label]}<label
                >{$tr(label)}<input
                  aria-label={$tr(`家具${label}度`)}
                  type="text"
                  inputmode="decimal"
                  value={item[key as "width" | "depth" | "height"]}
                  onchange={(e) =>
                    dimensionInput(key,e.currentTarget)}
                  disabled={item.locked}
                /></label
              >{/each}
          </div>
          <label
            >{$tr("尺寸来源")}<select
              value={item.confidence}
              onchange={(e) => patch("confidence", e.currentTarget.value)}
              >{#each Object.entries(labels) as [value, label]}<option {value}
                  >{$tr(label)}</option
                >{/each}</select
            ></label
          >
          <details open={!simpleMode}><summary>{say('位置与朝向','Position and orientation')}</summary>          <h3>{$tr("位置与朝向")}</h3>
          <div class="triple">
            {#each ["x", "y", "z"] as key}<label
                >{key.toUpperCase()}<input
                  type="number"
                  step="10"
                  value={item[key as "x" | "y" | "z"]}
                  onchange={(e) =>
                    patch(key as any, +e.currentTarget.value, e.currentTarget)}
                  disabled={item.locked}
                /></label
              >{/each}
          </div>
</details>          <label
            >{$tr("旋转 °")}<input
              aria-label={$tr("家具旋转")}
              type="number"
              step="15"
              value={item.rotation}
              onchange={(e) =>
                patch("rotation", +e.currentTarget.value, e.currentTarget)}
              disabled={item.locked}
            /></label
          ><label
            >{$tr("颜色")}<input
              type="color"
              value={item.color}
              onchange={(e) => patch("color", e.currentTarget.value)}
            /></label
          ><label class="inline"
            ><input
              type="checkbox"
              checked={item.locked}
              onchange={(e) => patch("locked", e.currentTarget.checked)}
            />{$tr("锁定尺寸与位置")}</label
          >
          <p class="note">{say('可输入 120cm、1.2m、1200mm；无单位默认毫米。','Use 120cm, 1.2m or 1200mm; bare numbers use mm.')}</p>
          <label>{say('快速替换','Quick replace')}<select aria-label={say('快速替换家具','Quick replace furniture')} value="" onchange={e=>{if(e.currentTarget.value)replace(e.currentTarget.value);e.currentTarget.value='';}} disabled={item.locked}><option value="">{say('选择同类家具…','Choose a similar item…')}</option>{#each catalog.filter(c=>c.family===catalog.find(x=>x.id===item.catalogId)?.family&&c.id!==item.catalogId) as c}<option value={c.id}>{$language==='zh'?c.name:c.en}</option>{/each}</select></label>
          <label>{say('放置于家具表面','Support surface')}<select aria-label={say('家具支撑关系','Furniture support')} value={item.support?.parentId||''} onchange={e=>change(()=>{const parent=s.furniture.find(f=>f.id===e.currentTarget.value);if(parent)attach(s,item!,parent);else delete item!.support;})} disabled={item.locked}><option value="">{say('独立放置','Detached')}</option>{#each s.furniture.filter(f=>f.id!==item.id&&!f.support&&['desk','table','cabinet'].includes(catalog.find(c=>c.id===f.catalogId)?.family||'')) as f}<option value={f.id}>{f.name}</option>{/each}</select></label>
          {#if catalog.find(c=>c.id===item.catalogId)?.family==='cabinet'}<div class="row">{#each ['cols','rows'] as key}<label>{key==='cols'?say('列数','Columns'):say('层数','Rows')}<input aria-label={key==='cols'?say('柜体列数','Cabinet columns'):say('柜体层数','Cabinet rows')} type="number" min="1" max="8" value={item.modules?.[key as 'cols'|'rows']||Number(catalog.find(c=>c.id===item.catalogId)?.features.find(f=>f.startsWith(key))?.slice(4)||2)} onchange={e=>change(()=>{const c=catalog.find(c=>c.id===item!.catalogId)!;item!.modules={cols:Number(c.features.find(f=>f.startsWith('cols'))?.slice(4)||1),rows:Number(c.features.find(f=>f.startsWith('rows'))?.slice(4)||2),...item!.modules,[key]:+e.currentTarget.value};})} disabled={item.locked}/></label>{/each}</div>{/if}
          {#if item.light && catalog.find(c=>c.id===item.catalogId)?.family==='lamp'}<label>{say('色温参考 K','Color temperature reference K')}<input aria-label={say('灯具色温','Lamp temperature')} type="number" min="1000" max="12000" step="100" value={item.light.temperature??''} onchange={e=>{try{patch('light',{...item.light,temperature:+e.currentTarget.value,color:temperatureColor(+e.currentTarget.value)});}catch(err){error=String(err);}}}/></label><p class="note">{say('使用近似颜色参考；非灯具光谱标定。','Approximate color reference, not calibrated luminaire spectra.')}</p>{/if}{#if item.light}<h3>{say('灯光与屏幕','Lighting and display')}</h3><label><input type="checkbox" checked={item.light.enabled} onchange={e=>patch('light',{...item.light,enabled:e.currentTarget.checked})}/>{say('开启','Enabled')}</label><label>{say('发光颜色','Emission color')}<input aria-label={say('灯光颜色','Light color')} type="color" value={item.light.color} onchange={e=>patch('light',{...item.light,color:e.currentTarget.value,temperature:undefined})}/></label><label>{say('强度','Intensity')}<input aria-label={say('灯光强度','Light intensity')} type="range" min="0" max="15" step="0.1" value={item.light.intensity} onchange={e=>patch('light',{...item.light,intensity:+e.currentTarget.value})}/></label><select aria-label={say('灯光预设','Light preset')} onchange={e=>patch('light',{...item.light,color:e.currentTarget.value,temperature:undefined,enabled:true})}><option value="">{say('选择预设','Choose preset')}</option>{#each [['#ffbd77','暖白','Warm white'],['#d9ecff','冷白','Cool white'],['#8454ff','紫蓝','Purple blue'],['#74ddff','冰蓝','Ice blue'],['#fa70de','粉紫','Pink purple'],['#c32138','暗红','Dark red']] as [color,zh,en]}<option value={color}>{say(zh,en)}</option>{/each}</select>{/if}
          <h3>{$tr("空间距离")}</h3>
          <div class="metric">
            <span>{$tr("最近房间边界")}</span><b
              >{Math.round(clearance(s, item))} <small>mm</small></b
            >
          </div>
          {#each s.furniture
            .filter((f) => f.id !== item.id && f.catalogId !== "curtain")
            .map((f) => ({ f, dist: distance(footprint(item!), footprint(f)) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 2) as near}<div class="metric">
              <span>{$tr("至")}{near.f.name}</span><b
                >{Math.round(near.dist)} <small>mm</small></b
              >
            </div>{/each}<label
            >{$tr("个人净距目标 mm")}<input
              type="number"
              min="0"
              max="2000"
              bind:value={s.clearanceTarget}
            /></label
          >
          <p class="note">{$tr("显示平面最短净距，不作为建筑规范结论。")}</p>
          <details>
            <summary>{$tr("商品资料")}</summary
            >{#each [["brand", $tr("品牌")], ["model", $tr("型号")], ["sourceUrl", $tr("商品链接")]] as [key, label]}<label
                >{$tr(label)}<input
                  value={item[key as "brand" | "model" | "sourceUrl"]}
                  onchange={(e) => patch(key as any, e.currentTarget.value)}
                /></label
              >{/each}
          </details>
          <div class="row">
            <button onclick={duplicate}>{$tr("复制")}</button><button
              class="danger"
              onclick={remove}
              disabled={item.locked}>{$tr("删除")}</button
            >
          </div>
        </div>{:else if selectedWall}<div class="fields">
          <h3>{$tr("墙体尺寸 · mm")}</h3>
          <div class="metric">
            <span>{$tr("中心线长度")}</span><b
              >{Math.round(
                Math.hypot(
                  selectedWall.end.x - selectedWall.start.x,
                  selectedWall.end.z - selectedWall.start.z,
                ),
              )} mm</b
            >
          </div>
          <label
            >{$tr("墙厚")}<input
              type="number"
              min="10"
              value={selectedWall.thickness}
              onchange={(e) =>
                wallProperty("thickness", +e.currentTarget.value)}
            /></label
          ><label
            >{$tr("墙高")}<input
              type="number"
              min="100"
              value={selectedWall.height}
              onchange={(e) => wallProperty("height", +e.currentTarget.value)}
            /></label
          >
          <p class="note">
            {$tr(
              "在墙体工具中拖动墙和端点。净轮廓、三维网格和碰撞会使用更新后的墙体。",
            )}
          </p>
          <button onclick={() => (mode = "plan-edit")}
            >{$tr("墙体与门窗工具")}</button
          >
        </div>{:else if selectedOpening}<div class="fields">
          <h3>
            {selectedOpening.kind === "door" ? $tr("门") : $tr("窗")}{$tr(
              "洞 · mm",
            )}
          </h3>
          {#each [["width", $tr("宽度")], ["height", $tr("高度")], ["offset", $tr("沿墙中心距离")], ["sill", $tr("离地高度")]] as [key, label]}<label
              >{$tr(label)}<input
                type="number"
                value={selectedOpening[
                  key as "width" | "height" | "offset" | "sill"
                ]}
                onchange={(e) =>
                  change(() => {
                    Object.assign(
                      s.openings.find((o) => o.id === selected)!,
                      { [key]: +e.currentTarget.value },
                    );
                  })}
              /></label
            >{/each}{#if selectedOpening.kind === "door"}<label
              >{$tr("铰链侧")}<select
                value={selectedOpening.swing}
                onchange={(e) =>
                  change(() => {
                    s.openings.find((o) => o.id === selected)!.swing = e
                      .currentTarget.value as "left" | "right";
                  })}
                ><option value="left">{$tr("左")}</option><option value="right"
                  >{$tr("右")}</option
                ></select
              ></label
            >{/if}
        </div>{:else}<div class="fields overview">
          <div class="area">
            {totalArea.toFixed(2)}<small>{$tr("m² 内部净面积")}</small>
          </div>
          <p>{s.name}</p>
          <div class="metric">
            <span>{$tr("尺寸来源")}</span><b
              >{$tr(labels[s.dimensionConfidence])}</b
            >
          </div>
          <div class="metric">
            <span>{$tr("层高")}</span><b>{s.rooms[0].height} mm</b>
          </div>
          <div class="metric">
            <span>{$tr("墙体")}</span><b>{s.walls.length} {$tr("面")}</b>
          </div>
          <div class="metric">
            <span>{$tr("门窗")}</span><b>{s.openings.length} {$tr("处")}</b>
          </div>
          <hr />
          <p class="note">
            {$tr("从左侧添加家具，点击或拖动家具后在这里输入精确数值。")}
          </p>
          <button
            onclick={() => {
              change(() => {
                s = bedroom();
                selected = null;
              }, "已载入标准卧室示例");
            }}>{$tr("载入标准卧室示例")}</button
          ><button onclick={() => (showNew = true)}
            >{$tr("输入尺寸创建房间")}</button
          ><button onclick={() => (tab = "variants")}
            >{$tr("导出与方案管理")}</button
          >
          <div class="privacy">
            {$tr("◉ 本地优先")}<br /><small
              >{$tr("工程、图纸与效果图保存在本机。")}</small
            >
          </div>
          {#if s.notes.length}<details>
              <summary>{$tr("来源与导入说明")}</summary
              >{#each s.notes as note}<p class="note">{$tr(note)}</p>{/each}
            </details>{/if}
        </div>{/if}
    </aside>
  </div>
  <div class="statusbar">
    <span class:error={!!error}>{$tr(error || status)}</span><span
      >{$tr("毫米 · 右手坐标系 · Links Tam")}</span
    >
  </div>
</div>
{/if}
{#if showImport}<FloorPlanImport
    existing={s.floorPlan}
    onclose={() => (showImport = false)}
    onattach={attachFloorPlan}
    oncreate={createFromFloorPlan}
  />{/if}
{#if showScan}<ScanImport
    onclose={() => (showScan = false)}
    oncreate={createFromScan}
  />{/if}
<input
  hidden
  type="file"
  accept=".roomfit,application/json"
  bind:this={openInput}
  onchange={readFile}
/>

{#if showNew}<div class="modal-backdrop">
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="new-title"
    >
      <small>{$tr("开始一个真实空间")}</small>
      <h2 id="new-title">{$tr("输入尺寸，创建房间")}</h2>
      <p>{$tr("以下为装修后内部净尺寸，单位为毫米。")}</p>
      <div class="fields">
        <div class="row">
          <label>{$tr("宽度")}<input type="number" bind:value={width} /></label
          ><label>{$tr("进深")}<input type="number" bind:value={depth} /></label
          >
        </div>
        <div class="row">
          <label>{$tr("层高")}<input type="number" bind:value={height} /></label
          ><label
            >{$tr("墙厚")}<input type="number" bind:value={thickness} /></label
          >
        </div>
        <label
          >{$tr("形状")}<select bind:value={shape}
            ><option value="rectangle">{$tr("矩形房间")}</option><option
              value="L">{$tr("L 形房间")}</option
            ></select
          ></label
        >
        <div class="row">
          <button onclick={() => (showNew = false)}>{$tr("取消")}</button
          ><button class="primary" onclick={newRoom}
            >{$tr("创建三维空间")}</button
          >
        </div>
      </div>
    </div>
  </div>{/if}

<style>
  :global(body) {
    overflow: hidden;
  }
  .app {
    color-scheme: light;
    height: 100vh;
    display: flex;
    flex-direction: column;
    color: #30443a;
    background: #f3f4ef;
    font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
    font-size: 12px;
  }
  button,
  input,
  select {
    font: inherit;
  }
  button {
    cursor: pointer;
    border: 1px solid #d8ded5;
    background: #fff;
    color: #405347;
    border-radius: 4px;
    padding: 7px 11px;
    transition: background 0.12s;
  }
  button:hover {
    background: #edf2eb;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  button.primary {
    background: #306d59;
    color: white;
    border-color: #306d59;
  }
  .active {
    background: #e1ebe0 !important;
    color: #225b46 !important;
    border-color: #aac0aa !important;
  }
  header {
    height: 72px;
    display: flex;
    align-items: center;
    gap: 7px;
    border-bottom: 1px solid #d6ddd2;
    background: #fcfcf8;
    padding: 0 20px;
    flex-shrink: 0;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
  }
  .language-select {
    width: 94px;
    padding: 6px;
    color: #30443a;
    background: #fff;
  }
  @media (max-width: 1400px) {
    header {
      height: auto;
      min-height: 72px;
      flex-wrap: wrap;
      padding: 10px 16px;
      row-gap: 8px;
    }
    .header-actions {
      width: 100%;
      flex-wrap: wrap;
    }
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 260px;
  }
  .brand strong {
    font-size: 22px;
    letter-spacing: -0.8px;
  }
  .brand em {
    font-style: normal;
    color: #4f624a;
    font-weight: 400;
  }
  .brand small {
    display: block;
    color: #4f624a;
    font-size: 10px;
    letter-spacing: 1.4px;
    margin-top: 2px;
  }
  .mark {
    font: 27px Georgia;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    background: #316e58;
    color: #fff;
    border-radius: 8px;
    position: relative;
  }
  .mark span {
    font: 8px sans-serif;
    position: absolute;
    bottom: 4px;
    right: 4px;
  }
  .document {
    margin-right: auto;
    min-width: 160px;
    padding-left: 20px;
  }
  .document input {
    border: 0;
    background: transparent;
    font-size: 13px;
    width: 230px;
    padding: 0;
  }
  .document span {
    font-size: 10px;
    color: #4f624a;
    display: block;
    margin-top: 4px;
  }
  header i {
    height: 22px;
    width: 1px;
    background: #ddd;
    margin: 0 5px;
  }
  .floating-tools{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:5;max-width:94%;width:max-content;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;background:#fffef9f2;border:1px solid #bbcdb2;box-shadow:0 5px 20px #1c3d2420;padding:8px;border-radius:10px}.floating-tools b{font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.floating-tools button{font-size:10px;padding:5px 8px}.floating-tools input{width:28px;height:28px;padding:2px}.floating-tools div{display:flex;gap:3px}.simple .view-options select:last-child{display:none}details summary{cursor:pointer;font-size:12px;color:#38553b;margin:10px 0}
  @media(max-width:1050px){.workspace{grid-template-columns:220px minmax(280px,1fr) 235px!important}.brand{min-width:180px!important}.document{padding-left:0!important}.header-actions{gap:4px!important}.header-actions button{padding:7px 8px!important}}
  @media(max-width:800px){.workspace{grid-template-columns:190px minmax(260px,1fr) 210px!important}.app{overflow:auto}.canvas{min-height:260px}}
  .workspace {
    display: grid;
    grid-template-columns: 250px minmax(350px, 1fr) 265px;
    flex: 1;
    min-height: 0;
  }
  .library,
  .properties {
    background: #fcfcf8;
    min-height: 0;
    overflow: auto;
    border-right: 1px solid #d6ddd2;
    display: flex;
    flex-direction: column;
  }
  .properties {
    border: 0;
    border-left: 1px solid #d6ddd2;
  }
  .library nav {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-bottom: 1px solid #ddd;
    padding: 10px 8px;
    gap: 2px;
  }
  .library nav button {
    padding: 6px 3px;
    font-size: 11px;
    white-space: nowrap;
    border-color: transparent;
    background: transparent;
  }
  .section-title {
    padding: 18px 18px 12px;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-title small {
    font-weight: 400;
    color: #4f624a;
    font-size: 10px;
  }
  .fields {
    padding: 4px 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 13px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #4f624a;
    font-size: 10px;
  }
  input,
  select {
    border: 1px solid #d9dfd3;
    border-radius: 3px;
    background: #fff;
    padding: 7px 9px;
    color: #3d5142;
    min-width: 0;
    width: 100%;
    outline: none;
  }
  input:focus,
  select:focus {
    border-color: #749b78;
  }
  input[type="color"] {
    height: 32px;
    padding: 3px;
  }
  input[type="range"] {
    padding: 0;
  }
  input[type="checkbox"] {
    width: auto;
  }
  h3 {
    font-size: 11px;
    letter-spacing: 0.7px;
    font-weight: 600;
    color: #405743;
    border-bottom: 1px solid #e2e6dc;
    margin: 10px 0 0;
    padding: 0 0 9px;
  }
  .triple {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
  }
  .triple input {
    padding: 7px 5px;
  }
  .inline {
    flex-direction: row;
    align-items: center;
  }
  .badge {
    font-size: 10px;
    background: #f0eddf;
    color: #4f624a;
    padding: 7px 9px;
    border-radius: 3px;
  }
  .metric {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    align-items: center;
    font-size: 10px;
  }
  .metric > span {
    color: #4f624a;
  }
  .metric b {
    font-size: 11px;
    font-weight: 500;
  }
  .metric small {
    font-size: 8px;
    color: #4f624a;
  }
  .row {
    display: flex;
    gap: 10px;
  }
  .row > * {
    flex: 1;
  }
  .danger {
    color: #a35a4d;
  }
  .area {
    font-size: 40px;
    letter-spacing: -2px;
    line-height: 1.2;
    padding: 12px 0;
    color: #416f56;
  }
  .area small {
    display: block;
    font-size: 10px;
    letter-spacing: 0.5px;
    color: #4f624a;
    margin-top: 10px;
  }
  .overview > p {
    font-size: 12px;
  }
  .privacy {
    padding: 15px;
    border: 1px solid #dfe8d7;
    margin-top: 20px;
    line-height: 2;
    color: #4f624a;
  }
  .privacy small {
    color: #4f624a;
  }
  .tree {
    font-size: 10px;
    display: flex;
    justify-content: space-between;
    color: #4f624a;
  }
  .tree span {
    color: #4f624a;
  }
  .statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 26px;
    background: #edf0e7;
    border-top: 1px solid #d5ddcc;
    color: #4f624a;
    padding: 0 14px;
    font-size: 9px;
    gap: 10px;
  }
  .statusbar > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80%;
  }
  .statusbar .error {
    color: #963b2a;
  }
  main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .viewbar {
    height: 52px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #d5dece;
    padding: 0 15px;
    gap: 20px;
    background: #f5f6f0;
    flex-shrink: 0;
  }
  .segmented {
    display: flex;
    gap: 2px;
    background: #e9ede2;
    padding: 3px;
    border-radius: 4px;
  }
  .segmented button {
    border: 0;
    background: transparent;
    font-size: 10px;
    padding: 6px 13px;
  }
  .segmented .active {
    background: #fff !important;
    box-shadow: 0 1px 3px #0001;
    color: #385d3e;
  }
  .viewbar > span {
    font-size: 9px;
    color: #4f624a;
  }
  .viewbar b {
    margin: 0 8px;
  }
  .view-options {
    display: flex;
    margin-left: auto;
    gap: 6px;
  }
  .view-options select {
    font-size: 9px;
    background: transparent;
    padding: 5px;
    width: 70px;
  }
  .canvas {
    flex: 1;
    min-height: 200px;
    position: relative;
    background: #e5e7e3;
  }
  .canvas-tag {
    position: absolute;
    top: 18px;
    left: 20px;
    background: #f8faf0dc;
    border: 1px solid #d1dccb;
    color: #4f624a;
    font-size: 9px;
    padding: 7px 10px;
    letter-spacing: 1px;
    pointer-events: none;
  }
  .canvas-tag span {
    margin-left: 10px;
    color: #4f624a;
    letter-spacing: 0;
  }
  .checks {
    background: #f7f8f2;
    border-top: 1px solid #d6dece;
    max-height: 180px;
    flex-shrink: 0;
  }
  .checks-title {
    display: flex;
    align-items: center;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    gap: 10px;
    text-align: left;
    padding: 12px 18px;
    font-size: 10px;
  }
  .checks-title > span {
    color: #4f624a;
  }
  .checks-title .bad {
    color: #963b2a;
  }
  .checks-title small {
    font-size: 9px;
    color: #4f624a;
    margin-left: 9px;
  }
  .checks-title .collapse {
    margin-left: auto;
  }
  .check-list {
    max-height: 125px;
    overflow: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    padding: 0 14px 10px;
    gap: 6px;
  }
  .check-list button {
    font-size: 9px;
    border: 0;
    background: #eeeee2;
    color: #4f624a;
    padding: 6px 9px;
  }
  .check-list button.problem {
    color: #963b2a;
    background: #f3eae0;
  }
  .check-list span {
    margin-right: 7px;
  }
  .check-list p {
    font-size: 10px;
    color: #4f624a;
    margin: 0;
  }
  details summary {
    font-size: 10px;
    cursor: pointer;
    color: #4f624a;
  }
  details label {
    margin-top: 12px;
  }
  pre {
    white-space: pre-wrap;
    max-height: 240px;
    overflow: auto;
    font: 9px Consolas;
    background: #edf0e7;
    padding: 8px;
    color: #4f624a;
  }
  .path {
    font-size: 9px;
    word-break: break-all;
    color: #4f624a;
  }
  .render-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #202a23;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    height: 100%;
    gap: 16px;
    color: #4f624a;
  }
  .empty > span {
    font-size: 50px;
    opacity: 0.4;
  }
  .empty h2 {
    font-size: 18px;
    font-weight: 400;
  }
  .empty p {
    font-size: 11px;
    color: #4f624a;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: #243b2e88;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .modal {
    background: #fbfcf6;
    width: 440px;
    padding: 32px;
    border: 1px solid #cdd9c3;
    box-shadow: 0 15px 80px #0003;
    border-radius: 6px;
  }
  .modal > small {
    letter-spacing: 2px;
    color: #4f624a;
    font-size: 10px;
  }
  .modal h2 {
    font-size: 25px;
    font-weight: 500;
    margin: 10px 0;
  }
  .modal p {
    color: #4f624a;
    font-size: 11px;
    margin: 0 0 22px;
  }
  .modal .fields {
    padding: 0;
  }
  hr {
    border: 0;
    border-top: 1px solid #e0e7d7;
    width: 100%;
    margin: 12px 0;
  }
  @media (max-width: 1200px) {
    .floating-tools{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:5;max-width:94%;width:max-content;display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap;background:#fffef9f2;border:1px solid #bbcdb2;box-shadow:0 5px 20px #1c3d2420;padding:8px;border-radius:10px}.floating-tools b{font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.floating-tools button{font-size:10px;padding:5px 8px}.floating-tools input{width:28px;height:28px;padding:2px}.floating-tools div{display:flex;gap:3px}.simple .view-options select:last-child{display:none}details summary{cursor:pointer;font-size:12px;color:#38553b;margin:10px 0}
  @media(max-width:1050px){.workspace{grid-template-columns:220px minmax(280px,1fr) 235px!important}.brand{min-width:180px!important}.document{padding-left:0!important}.header-actions{gap:4px!important}.header-actions button{padding:7px 8px!important}}
  @media(max-width:800px){.workspace{grid-template-columns:190px minmax(260px,1fr) 210px!important}.app{overflow:auto}.canvas{min-height:260px}}
  .workspace {
      grid-template-columns: 220px minmax(350px, 1fr) 240px;
    }
    .brand {
      min-width: 220px;
    }
    .document {
      padding-left: 0;
    }
    .document input {
      width: 150px;
    }
    .viewbar {
      gap: 10px;
      padding: 0 10px;
    }
    .viewbar > span {
      display: none;
    }
  }
</style>
