<script lang="ts">
  import { tr,language } from "./i18n";
  import { untrack,onDestroy } from "svelte";
  import Viewport from './Viewport.svelte';
  import {recognizeDimensions,blurScore,type DimensionCandidate} from './ocr';
  import {openingCandidates} from './openingDetection';
  import {
    uid,
    floorPlanSchema,readScene,
    type FloorPlan,
    type RoomScene,
  } from "./scene";
  import {
    calibratedScale,
    checkDeviation,
    detectWallCandidates,
    connectCandidates,
    sceneFromFloorPlan,
    type PixelPoint,
    type WallCandidate,
  } from "./floorplan";
  import {
    loadFloorPlan,
    rasterCanvas,
    rotateRaster,cropRaster,
    type Raster,
  } from "./floorplanImage";
  let {
    existing,
    onclose,
    onattach,
    oncreate,
  }: {
    existing?: FloorPlan;
    onclose: () => void;
    onattach: (p: FloorPlan) => void;
    oncreate: (s: RoomScene) => void;
  } = $props();
  const say=(zh:string,en:string)=>$language==='zh'?zh:en;
  let step=$state(1),allSteps=$state(false),ocrBusy=$state(false),ocrProgress=$state(0),ocrItems=$state<DimensionCandidate[]>([]),ocrUnit=$state<'mm'|'cm'|'m'>('mm'),blur=$state<number|null>(null);
  let abort:AbortController|undefined;
  let preview=$state<RoomScene|null>(null),openingDrafts=$state<ReturnType<typeof openingCandidates>>([]),wallChoice=$state(''),openingKind=$state<'door'|'window'>('door'),openingOffset=$state(1000),openingWidth=$state(850),openingHeight=$state(2100),openingSill=$state(850);
  let cropX=$state(0),cropY=$state(0),cropW=$state(100),cropH=$state(100),thumbnails=$state<{page:number;url:string}[]>([]);
  let dragging:{id:string;end?:'a'|'b'}|null=null;
  function dragStart(e:PointerEvent,id:string,end?:'a'|'b'){e.preventDefault();e.stopPropagation();if(end)remember();dragging={id,end};svg?.setPointerCapture(e.pointerId);}
  function drag(e:PointerEvent){if(!dragging||!source||!svg)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM()!.inverse()),x=Math.max(0,Math.min(source.width,p.x)),y=Math.max(0,Math.min(source.height,p.y));if(dragging.end){const c=candidates.find(c=>c.id===dragging!.id);if(c){c[dragging.end]={x,y};candidates=[...candidates];}}else if(preview){const o=preview.openings.find(o=>o.id===dragging!.id);if(!o)return;const w=preview.walls.find(w=>w.id===o.wallId)!,dx=w.end.x-w.start.x,dz=w.end.z-w.start.z,len=Math.hypot(dx,dz),p=plan(),along=((p.position.x+x*mmPerPixel-w.start.x)*dx+(p.position.z+y*mmPerPixel-w.start.z)*dz)/len;o.offset=Math.max(o.width/2,Math.min(len-o.width/2,along));}}
  function openingLine(o:RoomScene['openings'][number]){const w=preview!.walls.find(w=>w.id===o.wallId)!,dx=w.end.x-w.start.x,dz=w.end.z-w.start.z,len=Math.hypot(dx,dz),p=plan();return {x1:(w.start.x+dx*(o.offset-o.width/2)/len-p.position.x)/mmPerPixel,y1:(w.start.z+dz*(o.offset-o.width/2)/len-p.position.z)/mmPerPixel,x2:(w.start.x+dx*(o.offset+o.width/2)/len-p.position.x)/mmPerPixel,y2:(w.start.z+dz*(o.offset+o.width/2)/len-p.position.z)/mmPerPixel};}
  onDestroy(()=>abort?.abort());
  async function readFile(next:File){busy=true;error='';try{file=next;reset(await loadFloorPlan(next));step=1;message=say('已读取图纸，下一步校准尺寸。','Plan loaded. Calibrate dimensions in the next step.');if(source){blur=await blurScore(source);cropW=source.width;cropH=source.height;}thumbnails=[];if(source&&source.pageCount>1){for(let i=1;i<=Math.min(12,source.pageCount);i++){const r=i===1?source:await loadFloorPlan(next,i),c=await rasterCanvas(r),out=document.createElement('canvas');out.width=160;out.height=Math.round(160*r.height/r.width);out.getContext('2d')!.drawImage(c,0,0,out.width,out.height);thumbnails.push({page:i,url:out.toDataURL('image/png')});}}}catch(e){error=String(e);}finally{busy=false;}}
  async function pasteImage(){try{const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>t.startsWith('image/'));if(type){await readFile(new File([await item.getType(type)],'clipboard.png',{type}));return;}}error=say('剪贴板中没有图片，可用 Ctrl+V 或选择文件。','No image on clipboard. Use Ctrl+V or choose a file.');}catch(e){error=String(e);}}
  async function example(){try{const response=await fetch('/roomfit-example-plan.png');if(!response.ok)throw new Error('Example unavailable');await readFile(new File([await response.blob()],'example-plan.png',{type:'image/png'}));}catch(e){error=String(e);}}
  async function ocr(){if(!source)return;ocrBusy=true;ocrItems=[];ocrProgress=0;error='';abort=new AbortController();try{const result=await recognizeDimensions(source,p=>ocrProgress=p,abort.signal);ocrItems=result.candidates;message=ocrItems.length?say('识别结果仅为候选。先核对数值和单位，再选择尺寸两端。','OCR values are candidates. Verify units and select the measured endpoints.'):say('没有找到可靠尺寸，请手动选择两点并输入已知长度。','No reliable dimensions found. Select two points and enter a known length.');}catch(e){error=String(e);}finally{ocrBusy=false;}}
  function useDimension(c:DimensionCandidate){known=c.mm??c.value*({mm:1,cm:10,m:1000}[ocrUnit]);setTool('calibrate');message=say('已填入候选值，请在尺寸线的两个端点点击；文字框不等于尺寸线。','Candidate entered. Click the two dimension endpoints; the text box is not the measurement line.');}
  function preparePreview(){preview=sceneFromFloorPlan(plan(),wallHeight,false);wallChoice=preview.walls[0]?.id||'';}
  function go(n:number){error='';try{if(n>1&&!source)throw new Error(say('请先选择图纸','Choose a plan first'));if(n>2&&!mmPerPixel)throw new Error(say('请先完成两点比例校准','Calibrate two points first'));if((n===4||n===5)&&!preview)preparePreview();step=n;}catch(e){error=String(e);}}
  async function detectOpenings(){if(!preview||!source)return;const c=await rasterCanvas(source);openingDrafts=openingCandidates(plan(),preview,c.getContext('2d')!.getImageData(0,0,c.width,c.height).data);message=say('亮色缺口仅为门窗假设，请逐项确认；未检测到时可手动添加。','Light gaps are hypotheses. Review each or add openings manually.');}
  function addOpening(wallId=wallChoice,offset=openingOffset,width=openingWidth,kind=openingKind){if(!preview)return false;try{const next=JSON.parse(JSON.stringify(preview)) as RoomScene;next.openings.push({id:uid(),wallId,kind,offset,width,height:kind==='door'?openingHeight:Math.min(openingHeight,1450),sill:kind==='door'?0:openingSill,swing:'left'});preview=readScene(next);return true;}catch(e){error=String(e);return false;}}
  function finish(){try{if(!preview)preparePreview();if(confirmed&&(!deviation||Math.abs(deviation.percent)>3))throw new Error(say('请完成第二尺寸复核','Complete the second dimension check'));preview!.dimensionConfidence=confirmed?'confirmed':'estimated';preview!.rooms.forEach(r=>{r.confidence=preview!.dimensionConfidence;r.height=wallHeight;});preview!.walls.forEach(w=>w.height=wallHeight);preview!.notes.push('门窗高度、窗台与开启方向为人工估算，须现场核对。 / Opening heights, sills and swing are estimated.');oncreate(readScene(preview));}catch(e){error=String(e);}}
  const initial = untrack(() =>
    existing ? (JSON.parse(JSON.stringify(existing)) as FloorPlan) : undefined,
  );
  let source = $state<Raster | null>(initial ? { ...initial } : null);
  let calibration = $state<FloorPlan["calibration"] | null>(
    initial?.calibration ? structuredClone(initial.calibration) : null,
  );
  let crossCheck = $state<FloorPlan["crossCheck"]>(
    initial?.crossCheck ? structuredClone(initial.crossCheck) : undefined,
  );
  let candidates = $state<WallCandidate[]>(
    initial ? structuredClone(initial.candidates) : [],
  );
  let selected = $state(""),
    tool = $state("calibrate"),
    points = $state<PixelPoint[]>([]);
  let known = $state(initial?.calibration.distanceMm || 3600),
    checkKnown = $state(initial?.crossCheck?.distanceMm || 3200);
  let mmPerPixel = $state(initial?.mmPerPixel || 0),
    positionX = $state(initial?.position.x || 0),
    positionZ = $state(initial?.position.z || 0);
  let threshold = $state(150),
    minLength = $state(60),
    minThickness = $state(3),
    snapRadius = $state(12);
  let wallHeight = $state(2800),
    manualThickness = $state(120),
    confirmed = $state(false),
    orthogonal = $state(true);
  let busy = $state(false),
    message = $state("选择图纸后，在已知尺寸两端依次点击。"),
    error = $state(""),
    zoom = $state(100);
  let fileInput: HTMLInputElement;
  let svg = $state<SVGSVGElement>(),
    file = $state<File | null>(null);
  let undoStack = $state<string[]>([]);
  const current = $derived(candidates.find((c) => c.id === selected));
  const deviation = $derived.by(() => {
    if (!crossCheck || !mmPerPixel) return null;
    try {
      return checkDeviation(
        mmPerPixel,
        crossCheck.a,
        crossCheck.b,
        crossCheck.distanceMm,
      );
    } catch {
      return null;
    }
  });
  const accepted = $derived(candidates.filter((c) => c.accepted).length);
  function remember() {
    preview=null;
    undoStack.push(JSON.stringify(candidates));
    if (undoStack.length > 30) undoStack.shift();
  }
  function reset(r: Raster) {
    source = r;
    preview=null;openingDrafts=[];ocrItems=[];blur=null;cropX=0;cropY=0;cropW=r.width;cropH=r.height;
    calibration = null;
    crossCheck = undefined;
    mmPerPixel = 0;
    candidates = [];
    selected = "";
    points = [];
    confirmed = false;
    undoStack = [];
    tool = "calibrate";
    error = "";
    zoom = 100;
  }
  async function selectFile(e: Event) {
    const next = (e.target as HTMLInputElement).files?.[0];
    if (!next) return;
    await readFile(next);fileInput.value='';
  }
  async function changePage(page: number) {
    if (!file || !source || page < 1 || page > source.pageCount) return;
    busy = true;
    error = "";
    try {
      reset(await loadFloorPlan(file, page));
      message = "页面已切换，请为当前页重新校准。";
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
  async function rotate() {
    if (!source) return;
    busy = true;
    try {
      reset(await rotateRaster(source));
      message = "底图已旋转，原校准与候选已清除。";
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
  function setTool(value: string) {
    tool = value;
    points = [];
    error = "";
  }
  function click(e: PointerEvent) {
    if (busy || !source || tool === "select" || e.button !== 0) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg!.getScreenCTM()!.inverse(),
    );
    let q = {
      x: Math.max(0, Math.min(source.width, Math.round(p.x))),
      y: Math.max(0, Math.min(source.height, Math.round(p.y))),
    };
    if (points.length === 2) points = [];
    if (tool === "draw" && points.length === 1 && orthogonal) {
      if (Math.abs(q.x - points[0].x) > Math.abs(q.y - points[0].y))
        q.y = points[0].y;
      else q.x = points[0].x;
    }
    points = [...points, q];
    if (tool === "draw" && points.length === 2) {
      if (!mmPerPixel) {
        error = "请先校准比例";
        return;
      }
      if (Math.hypot(points[0].x - q.x, points[0].y - q.y) < 3) {
        error = "补线长度至少 3 px";
        return;
      }
      const thickness = manualThickness / mmPerPixel;
      if (thickness < 1 || thickness > 400) {
        error = "墙厚换算后须为 1–400 px，请检查比例";
        return;
      }
      remember();
      const id = uid();
      candidates = [
        ...candidates,
        { id, a: points[0], b: q, thickness, accepted: true, origin: "manual" },
      ];
      selected = id;
      points = [];
      error = "";
    }
  }
  function calibrate() {
    try {
      if (points.length !== 2) throw new Error("请在底图上选择两个端点");
      mmPerPixel = calibratedScale(points[0], points[1], known);
      calibration = { a: points[0], b: points[1], distanceMm: known };
      crossCheck = undefined;
      confirmed = false;
      points = [];
      tool = "check";
      message = `比例为 ${mmPerPixel.toFixed(4)} mm/px。请选择另一处已知尺寸复核。`;
      error = "";
    } catch (e) {
      error = String(e);
    }
  }
  function verify() {
    try {
      if (!mmPerPixel || points.length !== 2)
        throw new Error("先完成校准，再选择第二处尺寸两端");
      const result = checkDeviation(
        mmPerPixel,
        points[0],
        points[1],
        checkKnown,
      );
      crossCheck = { a: points[0], b: points[1], distanceMm: checkKnown };
      points = [];
      confirmed = false;
      message = `复核换算长度 ${result.actualMm.toFixed(1)} mm，偏差 ${result.percent.toFixed(2)}%。`;
      error = "";
    } catch (e) {
      error = String(e);
    }
  }
  async function detect() {
    if (!source || !mmPerPixel) return;
    busy = true;
    error = "";
    try {
      const canvas = await rasterCanvas(source),
        pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height);
      // Yield so the busy state paints before the bounded raster scan.
      await new Promise((r) => requestAnimationFrame(r));
      const found = detectWallCandidates(
        pixels.data,
        canvas.width,
        canvas.height,
        { threshold, minLength, minThickness },
      );
      remember();
      candidates = found;
      selected = "";
      points = [];
      tool = "select";
      message = `提取 ${found.length} 条候选。请检查文字/家具误检、墙线端点和厚度；门窗需人工添加。`;
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
  function connect() {
    try {
      remember();
      candidates = connectCandidates(candidates, snapRadius);
      error = "";
      message = "已按指定半径连接正交端点，请检查是否跨越门洞或误连。";
    } catch (e) {
      error = String(e);
    }
  }
  function patch(axis: "a" | "b", coordinate: "x" | "y", value: number) {
    if (!current || !source) return;
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > (coordinate === "x" ? source.width : source.height)
    ) {
      error = "端点超出底图";
      return;
    }
    remember();
    current[axis][coordinate] = value;
    candidates = [...candidates];
    error = "";
  }
  function plan(): FloorPlan {
    if (!source || !calibration || !mmPerPixel)
      throw new Error("请先完成两点校准");
    return floorPlanSchema.parse({
      ...source,
      calibration,
      crossCheck,
      mmPerPixel,
      candidates,
      position: { x: positionX, z: positionZ },
      opacity: initial?.opacity ?? 0.45,
    });
  }
  function attach() {
    try {
      onattach(plan());
    } catch (e) {
      error = String(e);
    }
  }
  function create() {
    try {
      if (confirmed && (!deviation || Math.abs(deviation.percent) > 3))
        throw new Error("确认比例前须完成偏差不超过 3% 的第二尺寸复核");
      oncreate(sceneFromFloorPlan(plan(), wallHeight, confirmed));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<svelte:window onpaste={e=>{const f=e.clipboardData?.files[0];if(f&&f.type.startsWith('image/')){e.preventDefault();void readFile(f);}}}/>
<div class="backdrop" role="presentation" ondragover={e=>e.preventDefault()} ondrop={e=>{e.preventDefault();const f=e.dataTransfer?.files[0];if(f)void readFile(f);}}>
  <div
    class="importer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="floorplan-title"
    tabindex="-1"
    data-floorplan-import
  >
    <header>
      <div>
        <small>{$tr("本地图纸 · 毫米校准")}</small>
        <h2 id="floorplan-title">{$tr("从户型图建立空间")}</h2>
      </div>
      <button onclick={onclose} disabled={busy} aria-label={$tr("关闭图纸导入")}
        >✕</button
      >
    </header>
    <nav class="steps" aria-label={say('导入步骤','Import steps')}>{#each [say('上传图纸','Upload'),say('校准尺寸','Dimensions'),say('确认墙线','Walls'),say('确认门窗','Openings'),say('三维预览','3D preview')] as title,i}<button class:active={step===i+1&&!allSteps} onclick={()=>{allSteps=false;go(i+1);}}>{i+1}. {title}</button>{/each}<button class="all" onclick={()=>allSteps=!allSteps}>{allSteps?say('恢复分步','Guided steps'):say('显示全部步骤','Show all steps')}</button></nav>
    <div class="body">
      <aside>
        <section hidden={!allSteps&&step!==1}><h3>{$tr("01 · 图纸")}</h3>
        <button onclick={() => fileInput.click()} disabled={busy}
          >{$tr("选择图片或 PDF")}</button
        >
        <input
          hidden
          aria-label={$tr("选择户型图文件")}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          bind:this={fileInput}
          onchange={selectFile}
        />
        <p>
          PNG / JPG / WebP / PDF · ≤30 MB<br />{$tr("全部处理在本机完成。")}
        </p>
        {#if source}<b class="filename">{source.name}</b>
          <div class="row">
            <button
              disabled={busy || !file || source.page <= 1}
              onclick={() => changePage(source!.page - 1)}
              >{$tr("上一页")}</button
            ><span>{source.page}/{source.pageCount}</span><button
              disabled={busy || !file || source.page >= source.pageCount}
              onclick={() => changePage(source!.page + 1)}
              >{$tr("下一页")}</button
            >
          </div>
          <button onclick={rotate} disabled={busy}
            >{$tr("顺时针旋转 90°")}</button
          >
          <p>
            {$tr(
              "换页或旋转会清除本页校准和候选。工程保存当前页底图；重新打开后，切换\n            PDF 页需重新选择原文件。",
            )}
          </p>{/if}
        <div class="row"><button onclick={pasteImage} disabled={busy}>{say('粘贴图片','Paste image')}</button><button onclick={example} disabled={busy}>{say('使用示例图','Use example')}</button></div><p>{say('也可拖入文件或按 Ctrl+V 粘贴截图。','You can also drop a file or paste a screenshot with Ctrl+V.')}</p>
        {#if thumbnails.length}<div class="page-thumbs">{#each thumbnails as thumb}<button onclick={()=>changePage(thumb.page)} disabled={busy}><img src={thumb.url} alt={`Page ${thumb.page}`}/><small>{thumb.page}</small></button>{/each}</div><p>{say('缩略图显示前12页，可用上一页/下一页访问其余页面。','Thumbnails show the first 12 pages; use next/previous for the rest.')}</p>{/if}
        {#if source}<details><summary>{say('裁切图纸','Crop plan')}</summary><div class="row"><label>X<input type="number" bind:value={cropX}/></label><label>Y<input type="number" bind:value={cropY}/></label></div><div class="row"><label>{say('宽 px','Width px')}<input type="number" bind:value={cropW}/></label><label>{say('高 px','Height px')}<input type="number" bind:value={cropH}/></label></div><button onclick={async()=>{try{reset(await cropRaster(source!,cropX,cropY,cropW,cropH));blur=await blurScore(source!);}catch(e){error=String(e);}}}>{say('应用裁切并重新校准','Crop and recalibrate')}</button></details>{/if}
        {#if blur!==null&&blur<100}<p class="bad">{say('图纸可能模糊，识别结果需仔细核对；可手动描墙。','The plan may be blurred. Verify recognition or trace walls manually.')}</p>{/if}
        </section><section hidden={!allSteps&&step!==2}><h3>{$tr("02 · 校准与复核")}</h3>
        <button onclick={ocr} disabled={!source||ocrBusy}>{ocrBusy?`OCR ${ocrProgress}%`:say('识别图中尺寸（本机 OCR）','Read dimensions (local OCR)')}</button>{#if ocrBusy}<button onclick={()=>abort?.abort()}>{say('取消识别','Cancel OCR')}</button>{/if}
        {#if ocrItems.length}<p>{say('无单位数字须确认图纸单位；点击候选填入长度，再点尺寸线两端。','Confirm drawing units for bare numbers; choose a value then mark its endpoints.')}</p><select aria-label={say('无单位尺寸采用','Units for bare dimensions')} bind:value={ocrUnit}><option>mm</option><option>cm</option><option>m</option></select><div class="ocr-list">{#each ocrItems as c}<button onclick={()=>useDimension(c)}>{c.raw} · {c.unit==='unknown'?say('单位待确认','unit unknown'):c.unit} · {Math.round(c.confidence)}%</button>{/each}</div>{/if}
        <div class="row">
          <button
            class:active={tool === "calibrate"}
            disabled={busy||ocrBusy}
            onclick={() => setTool("calibrate")}>{$tr("选择校准两点")}</button
          ><button
            class:active={tool === "check"}
            onclick={() => setTool("check")}
            disabled={!mmPerPixel||busy||ocrBusy}>{$tr("选择复核两点")}</button
          >
        </div>
        {#if tool === "calibrate"}<label
            >{$tr("已知实际长度 mm")}<input
              aria-label={$tr("校准实际长度")}
              type="number"
              min="50"
              max="100000"
              bind:value={known}
            /></label
          ><button onclick={calibrate} disabled={points.length !== 2}
            >{$tr("记录比例")}</button
          >
        {:else if tool === "check"}<label
            >{$tr("另一处实际长度 mm")}<input
              aria-label={$tr("复核实际长度")}
              type="number"
              min="50"
              max="100000"
              bind:value={checkKnown}
            /></label
          ><button onclick={verify} disabled={points.length !== 2}
            >{$tr("记录复核")}</button
          >{/if}
        {#if mmPerPixel}<p>
            {$tr("比例")}
            {mmPerPixel.toFixed(4)} mm/px · {source?.width}×{source?.height}
            px
          </p>{/if}
        {#if deviation}<p class:bad={Math.abs(deviation.percent) > 3}>
            {$tr("复核偏差")}
            {deviation.percent.toFixed(2)}{$tr("%（限 3%）")}
          </p>{/if}
        </section><section hidden={!allSteps&&step!==3}><h3>{$tr("03 · 辅助墙线")}</h3><p>{say('绿色为采用的候选，红色为未采用；自动结果可能错误。没有候选时用“两点补线”描出闭合轮廓。','Green candidates are included; red candidates are excluded. Review detection or trace a closed outline with the two-point tool.')}</p><div class="row"><button disabled={!candidates.length} onclick={()=>{remember();candidates=candidates.map(c=>({...c,accepted:true}));}}>{say('全部采用','Accept all')}</button><button disabled={!candidates.length} onclick={()=>{remember();candidates=candidates.map(c=>({...c,accepted:false}));}}>{say('全部排除','Exclude all')}</button></div>
        <div class="row">
          <label
            >{$tr("深色阈值")}<input
              aria-label={$tr("深色阈值")}
              type="number"
              min="1"
              max="255"
              bind:value={threshold}
            /></label
          ><label
            >{$tr("最短线 px")}<input
              type="number"
              min="10"
              max="2400"
              bind:value={minLength}
            /></label
          ><label
            >{$tr("最小厚 px")}<input
              type="number"
              min="1"
              max="100"
              bind:value={minThickness}
            /></label
          >
        </div>
        <button onclick={detect} disabled={busy || !mmPerPixel}
          >{$tr("重新提取候选墙线")}</button
        >
        <p>
          {$tr(
            "识别轴向深色实线。文字、家具和双线墙可能误检。重新提取会替换当前候选，可撤回。",
          )}
        </p>
        <div class="row">
          <label
            >{$tr("连接半径 px")}<input
              type="number"
              min="0"
              max="100"
              bind:value={snapRadius}
            /></label
          ><button onclick={connect} disabled={!accepted}
            >{$tr("连接附近端点")}</button
          >
        </div>
        <div class="row">
          <button
            class:active={tool === "select"}
            onclick={() => setTool("select")}>{$tr("选择墙线")}</button
          ><button
            class:active={tool === "draw"}
            onclick={() => setTool("draw")}
            disabled={!mmPerPixel}>{$tr("两点补线")}</button
          ><button
            disabled={!undoStack.length}
            onclick={() => {
              const json = undoStack.pop();
              if (json) candidates = JSON.parse(json);
              selected = "";
            }}>{$tr("撤回线修改")}</button
          >
        </div>
        <div class="row">
          <label
            >{$tr("补线墙厚 mm")}<input
              type="number"
              min="10"
              max="2000"
              bind:value={manualThickness}
            /></label
          ><label class="check"
            ><input type="checkbox" bind:checked={orthogonal} />{$tr(
              "正交补线",
            )}</label
          >
        </div>
        {#if current}<div class="selected">
            <b
              >{$tr("墙线")}
              {candidates.indexOf(current) + 1} · {current.origin === "manual"
                ? $tr("人工")
                : $tr("候选")}</b
            >
            <label class="check"
              ><input
                aria-label={$tr("采用所选墙线")}
                type="checkbox"
                checked={current.accepted}
                onchange={(e) => {
                  remember();
                  current!.accepted = e.currentTarget.checked;
                  candidates = [...candidates];
                }}
              />{$tr("采用此墙线")}</label
            >
            {#each ["a", "b"] as end}<div class="row">
                {#each ["x", "y"] as coord}<label
                    >{end.toUpperCase()}
                    {coord} px<input
                      aria-label={$tr(`墙线 ${end} ${coord}`)}
                      type="number"
                      value={current[end as "a" | "b"][coord as "x" | "y"]}
                      onchange={(e) =>
                        patch(
                          end as "a" | "b",
                          coord as "x" | "y",
                          +e.currentTarget.value,
                        )}
                    /></label
                  >{/each}
              </div>{/each}
            <label
              >{$tr("墙厚 mm")}<input
                aria-label={$tr("候选墙厚")}
                type="number"
                min="1"
                value={+(current.thickness * mmPerPixel).toFixed(1)}
                onchange={(e) => {
                  const px = +e.currentTarget.value / mmPerPixel;
                  if (px >= 1 && px <= 400) {
                    remember();
                    current!.thickness = px;
                    candidates = [...candidates];
                  } else error = "墙厚换算后须为 1–400 px";
                }}
              /></label
            >
            <button
              onclick={() => {
                remember();
                candidates = candidates.filter((c) => c.id !== selected);
                selected = "";
              }}>{$tr("删除所选墙线")}</button
            >
          </div>{/if}
        </section><section hidden={!allSteps&&step!==4}><h3>{say('04 · 确认门窗','04 · Review openings')}</h3><p>{say('门窗缺口识别为低置信候选，不会自动采用。高度、窗台和开启方向须现场核对。','Gap detection gives low-confidence candidates. Heights, sills and swing need verification.')}</p><button onclick={detectOpenings} disabled={!preview}>{say('查找门窗缺口候选','Find opening gap candidates')}</button>{#each openingDrafts as c}<div class="row"><span>{c.kind} {c.width} mm · {Math.round(c.confidence*100)}%</span><button disabled={c.accepted} onclick={()=>{c.accepted=addOpening(c.wallId,c.offset,c.width,c.kind);}}>{say('采用候选','Use candidate')}</button></div>{/each}
        {#if preview}<label>{say('所属墙体','Wall')}<select aria-label={say('门窗所属墙','Opening wall')} bind:value={wallChoice}>{#each preview.walls as w,i}<option value={w.id}>{say('墙','Wall')} {i+1} · {Math.round(Math.hypot(w.end.x-w.start.x,w.end.z-w.start.z))} mm</option>{/each}</select></label><label>{say('类型','Type')}<select bind:value={openingKind}><option value="door">🚪 {say('门','Door')}</option><option value="window">▥ {say('窗','Window')}</option></select></label><label>{say('沿墙中心位置 mm','Center along wall mm')}<input type="number" bind:value={openingOffset}/></label><label>{say('洞口宽 mm','Opening width mm')}<input type="number" bind:value={openingWidth}/></label><label>{say('估算高度 mm','Estimated height mm')}<input type="number" bind:value={openingHeight}/></label>{#if openingKind==='window'}<label>{say('估算窗台高 mm','Estimated sill mm')}<input type="number" bind:value={openingSill}/></label>{/if}<button onclick={()=>addOpening()}>{say('添加门窗','Add opening')}</button>{#each preview.openings as o,i}<div class="row"><span>{o.kind} {i+1} · {o.width} mm</span><button onclick={()=>{preview!.openings=preview!.openings.filter(x=>x.id!==o.id);}}>{say('删除','Delete')}</button></div>{/each}{/if}
        </section><section hidden={!allSteps&&step!==5}><h3>{say('05 · 预览与建立工程','05 · Preview and create')}</h3>
        <label
          >{$tr("层高 mm")}<input
            aria-label={$tr("导入房间层高")}
            type="number"
            min="500"
            max="20000"
            bind:value={wallHeight}
          /></label
        >
        <div class="row">
          <label
            >{$tr("底图左上 X mm")}<input
              type="number"
              bind:value={positionX}
            /></label
          ><label>Z mm<input type="number" bind:value={positionZ} /></label>
        </div>
        <label class="check"
          ><input
            aria-label={$tr("确认图纸比例")}
            type="checkbox"
            bind:checked={confirmed}
            disabled={!deviation || Math.abs(deviation.percent) > 3}
          />{$tr("已核对第二尺寸，确认图纸比例")}</label
        >
        <p>
          {$tr("未勾选时尺寸标记为估算。生成后仍需确认门窗、墙厚和现场尺寸。")}
        </p>
      </section></aside>
      <div class="preview">
        <div class="preview-tools">
          <span
            >{busy
              ? $tr("正在本地处理…")
              : $tr(
                  `已选 ${points.length}/2 点 · 采用 ${accepted}/${candidates.length} 条墙线`,
                )}</span
          ><label
            >{$tr("缩放")}
            <input
              aria-label={$tr("底图缩放")}
              type="range"
              min="60"
              max="400"
              step="10"
              bind:value={zoom}
            />{zoom}%</label
          >
        </div>
        <div class="scroll">
          {#if step===5&&!allSteps&&preview}<div class="preview-3d"><Viewport scene={preview} selected={null} onselect={()=>{}} onmove={()=>{}} oncamera={()=>{}}/></div>{:else if source}<svg
              bind:this={svg}
              viewBox={`0 0 ${source.width} ${source.height}`}
              style={`width:${zoom}%;max-width:none;`}
              onpointerdown={click}
              onpointermove={drag}
              onpointerup={()=>dragging=null}
              onpointercancel={()=>dragging=null}
              role="application"
              aria-label={$tr("图纸校准与候选墙线")}
            >
              <image
                href={source.dataUrl}
                width={source.width}
                height={source.height}
              />
              {#if step===2||allSteps}{#each ocrItems as c}<g pointer-events="none"><rect x={c.box.x0} y={c.box.y0} width={c.box.x1-c.box.x0} height={c.box.y1-c.box.y0} stroke="#e58916" fill="#ffb31c22" stroke-width="2"/><text x={c.box.x0} y={c.box.y0-3} font-size="16" fill="#885000">{c.raw}</text></g>{/each}{/if}
              {#each candidates as c, i}<g
                  role="button"
                  tabindex="0"
                  aria-label={$tr(`选择候选墙线 ${i + 1}`)}
                  onclick={(e) => {
                    if (tool === "select") {
                      e.stopPropagation();
                      selected = c.id;
                    }
                  }}
                  onpointerdown={(e) => {
                    if (tool === "select") e.stopPropagation();
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      selected = c.id;
                      tool = "select";
                    }
                  }}
                >
                  <line
                    x1={c.a.x}
                    y1={c.a.y}
                    x2={c.b.x}
                    y2={c.b.y}
                    stroke={selected === c.id
                      ? "#ff9d32"
                      : c.accepted
                        ? "#0d9c80"
                        : "#df5454"}
                    stroke-width={Math.max(c.thickness, 3)}
                    opacity=".55"
                  />
                  <line
                    x1={c.a.x}
                    y1={c.a.y}
                    x2={c.b.x}
                    y2={c.b.y}
                    stroke="transparent"
                    stroke-width={Math.max(12, c.thickness)}
                  />
                  <circle
                    cx={(c.a.x + c.b.x) / 2}
                    cy={(c.a.y + c.b.y) / 2}
                    r="3"
                    fill={c.accepted ? "#0d9c80" : "#df5454"}
                  />
                  {#if selected === c.id}{#each [c.a, c.b] as p,j}<circle
                        role="button" tabindex="0" aria-label={say('拖动墙线端点','Drag wall endpoint')}
                        onkeydown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();remember();p.x=Math.max(0,Math.min(source!.width,p.x+(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0)));p.y=Math.max(0,Math.min(source!.height,p.y+(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)));candidates=[...candidates];}}}
                        onpointerdown={e=>dragStart(e,c.id,j===0?'a':'b')}
                        cx={p.x}
                        cy={p.y}
                        r="6"
                        fill="#ff9d32"
                        stroke="white"
                        stroke-width="2"
                      />{/each}{/if}
                </g>{/each}
              {#if preview&&step===4}{#each preview.openings as o}{@const line=openingLine(o)}<g role="button" tabindex="0" aria-label={say('拖动门窗位置','Drag opening position')} onkeydown={()=>{}}><line {...line} stroke={o.kind==='door'?'#c0782b':'#1b78b0'} stroke-width="10" onpointerdown={e=>dragStart(e,o.id)}/><text x={(line.x1+line.x2)/2} y={(line.y1+line.y2)/2-12} font-size="18" fill="#214d3b" pointer-events="none">{o.kind==='door'?'🚪':'▥'} {Math.round(o.width)} mm</text></g>{/each}{/if}
              {#each [calibration, crossCheck] as line, i}{#if line}<line
                    x1={line.a.x}
                    y1={line.a.y}
                    x2={line.b.x}
                    y2={line.b.y}
                    stroke={i === 0 ? "#205cdc" : "#a444d1"}
                    stroke-width="3"
                    stroke-dasharray="10 5"
                    pointer-events="none"
                  />{/if}{/each}
              {#if points.length === 2}<line
                  x1={points[0].x}
                  y1={points[0].y}
                  x2={points[1].x}
                  y2={points[1].y}
                  stroke="#e84d67"
                  stroke-width="3"
                  pointer-events="none"
                />{/if}
              {#each points as p}<circle
                  cx={p.x}
                  cy={p.y}
                  r="6"
                  fill="#e84d67"
                  stroke="white"
                  stroke-width="2"
                  pointer-events="none"
                />{/each}
            </svg>{:else}<div class="empty">
              <strong>{$tr("导入你的户型图")}</strong>
              <p>{$tr("标记已知尺寸 → 复核比例 → 修正墙线 → 生成三维")}</p>
              <p>{$tr("现有工程在点击生成前保持原样。")}</p>
            </div>{/if}
        </div>
        <div class="message" class:bad={!!error} role="status">
          {$tr(error || message)}
        </div>
      </div>
    </div>
    <footer>
      {#if !allSteps&&step>=3&&mmPerPixel}<button onclick={attach}>{say('先附加底图，人工描墙','Attach plan and trace manually')}</button>{/if}
      {#if !allSteps}<button disabled={step===1||busy} onclick={()=>go(step-1)}>{say('上一步','Back')}</button>{#if step<5}<button class="primary" disabled={busy||ocrBusy} onclick={()=>go(step+1)}>{say('下一步','Next')} →</button>{:else}<button class="primary" disabled={!preview||busy} onclick={finish}>{say('进入装修并保存工程','Start decorating')}</button>{/if}{/if}
      <div class="legacy-actions" hidden={!allSteps}>
      <span
        >{$tr("附加底图保留当前墙体与家具；生成新工程可用主工具栏撤回。")}</span
      ><button disabled={busy || !mmPerPixel} onclick={attach}
        >{$tr("附加底图，继续描墙")}</button
      ><button
        class="primary"
        disabled={busy || !mmPerPixel || !accepted}
        onclick={create}>{$tr("用已选墙线生成新工程")}</button
      >
      </div>
    </footer>
  </div>
</div>

<style>
  [hidden]{display:none!important}.steps{display:flex;gap:4px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid #d7e0d0;background:#edf3e6}.steps button{padding:8px;font-size:11px}.steps .all{margin-left:auto}.page-thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:10px 0}.page-thumbs img{width:100%;height:60px;object-fit:contain}.page-thumbs button{padding:3px}.ocr-list{display:flex;flex-wrap:wrap;gap:4px;max-height:180px;overflow:auto;margin:8px 0}.ocr-list button{font-size:10px;padding:5px}.preview-3d{height:100%;min-height:300px}.legacy-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.body aside section{display:block}.body aside section p{line-height:1.7}
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: #20372dcc;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font:
      12px "Microsoft YaHei",
      sans-serif;
    color: #294335;
  }
  .importer {
    background: #f8faf4;
    width: min(1440px, 100%);
    height: min(940px, 100%);
    display: flex;
    flex-direction: column;
    border: 1px solid #cbd9c7;
    border-radius: 10px;
    box-shadow: 0 20px 100px #0005;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    border-bottom: 1px solid #d7e0d0;
  }
  small {
    font-size: 10px;
    color: #4f624a;
    letter-spacing: 2px;
  }
  h2 {
    font-size: 22px;
    font-weight: 500;
    margin: 5px 0 0;
  }
  h3 {
    font-size: 12px;
    margin: 22px 0 10px;
    border-top: 1px solid #dce4d6;
    padding-top: 14px;
  }
  h3:first-child {
    margin-top: 0;
    border: 0;
    padding: 0;
  }
  .body {
    display: grid;
    grid-template-columns: 305px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
  }
  aside {
    padding: 18px;
    overflow: auto;
    background: #f0f4e9;
    border-right: 1px solid #d7e0d0;
  }
  p {
    font-size: 10px;
    line-height: 1.7;
    color: #4f624a;
    margin: 8px 0;
  }
  .filename {
    display: block;
    overflow-wrap: anywhere;
    font-size: 11px;
    margin: 10px 0;
  }
  .row {
    display: flex;
    align-items: end;
    gap: 6px;
    margin: 8px 0;
  }
  .row > * {
    min-width: 0;
    flex: 1;
  }
  .row span {
    align-self: center;
    text-align: center;
  }
  button {
    background: #fff;
    border: 1px solid #c6d4be;
    color: #3a6247;
    padding: 8px 9px;
    border-radius: 4px;
    cursor: pointer;
    font:
      11px "Microsoft YaHei",
      sans-serif;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.primary,
  button.active {
    color: white;
    background: #306a51;
    border-color: #306a51;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 10px;
    margin: 9px 0;
  }
  input[type="number"] {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
    padding: 7px;
    border: 1px solid #ccd7c6;
    background: white;
    color: #294335;
    border-radius: 3px;
  }
  .check {
    display: flex;
    flex-direction: row;
    align-items: center;
    line-height: 1.6;
  }
  .selected {
    padding: 10px;
    background: white;
    border: 1px solid #bdcead;
    border-radius: 5px;
    margin-top: 12px;
  }
  .preview {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #e0e7dc;
  }
  .preview-tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 15px;
    background: #fff;
    min-height: 45px;
    font-size: 10px;
    color: #4f624a;
  }
  .preview-tools label {
    flex-direction: row;
    align-items: center;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 20px;
    position: relative;
  }
  svg {
    display: block;
    background: #fff;
    touch-action: none;
    cursor: crosshair;
    box-shadow: 0 2px 15px #20352b20;
  }
  .message {
    background: #fff;
    padding: 12px 16px;
    border-top: 1px solid #d7e0d0;
    font-size: 11px;
    min-height: 18px;
  }
  .bad {
    color: #b44739 !important;
  }
  .empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: #4f624a;
  }
  .empty strong {
    font-size: 24px;
    font-weight: 400;
  }
  .empty p {
    font-size: 12px;
  }
  footer {
    padding: 12px 18px;
    border-top: 1px solid #d7e0d0;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  footer span {
    margin-right: auto;
    font-size: 10px;
    color: #4f624a;
  }
  @media (max-width: 1000px) {
    .backdrop {
      padding: 8px;
    }
    .body {
      grid-template-columns: 270px minmax(0, 1fr);
    }
    footer span {
      display: none;
    }
  }
</style>
