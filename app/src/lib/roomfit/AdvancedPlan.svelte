<script lang="ts">
  import { tr } from "./i18n";
  import { onMount } from "svelte";
  import FloorPlanCanvas from "$lib/components/editor/FloorPlanCanvas.svelte";
  import {
    loadProject,
    currentProject,
    selectedTool,
    selectedElementId,
    snapEnabled,
    placingFurnitureId,
  } from "$lib/stores/project";
  import { projectSettings } from "$lib/stores/settings";
  import { toOpenPlan, fromOpenPlan } from "./openplanAdapter";
  import type { RoomScene } from "./scene";
  import type { Project } from "$lib/models/types";
  let {
    scene,
    onchange,
    onselect,
    onerror,
  }: {
    scene: RoomScene;
    onchange: (s: RoomScene) => void;
    onselect: (id: string | null) => void;
    onerror: (e: string) => void;
  } = $props();
  let mounted = $state(false),
    tool = $state("select"),
    sync = false,
    last = "",
    timer: ReturnType<typeof setTimeout>;
  let pending: Project | null = null,
    flushing = false;
  export function flush() {
    clearTimeout(timer);
    if (!pending || flushing) return;
    const project = pending;
    pending = null;
    flushing = true;
    try {
      const next = fromOpenPlan(project, JSON.parse(JSON.stringify(scene)));
      // The adapter timestamp alone must not create an undo transaction.
      next.modifiedAt = scene.modifiedAt;
      const json = JSON.stringify(next);
      if (json !== last) {
        last = json;
        onchange(next);
      }
    } catch (e) {
      onerror(e instanceof Error ? e.message : String(e));
    } finally {
      flushing = false;
    }
  }
  $effect(() => {
    const json = JSON.stringify(scene);
    if (!mounted || json === last) return;
    sync = true;
    pending = null;
    clearTimeout(timer);
    loadProject(toOpenPlan(scene));
    last = json;
    sync = false;
  });
  onMount(() => {
    projectSettings.update((s) => ({
      ...s,
      gridSize: 1,
      wallMeasureMode: "edge",
      showInternalDimensions: true,
    }));
    mounted = true;
    const stop = currentProject.subscribe((p) => {
      if (sync || !p || p.id !== scene.id) return;
      clearTimeout(timer);
      pending = p;
      timer = setTimeout(flush, 180);
    });
    const selection = selectedElementId.subscribe((id) => onselect(id));
    const tools = selectedTool.subscribe((t) => (tool = t));
    return () => {
      flush();
      stop();
      selection();
      tools();
    };
  });
</script>

<div class="advanced">
  <div class="tools">
    {#each [["select", $tr("选择")], ["wall", $tr("绘墙")], ["door", $tr("门")], ["window", $tr("窗")], ["measure", $tr("测量")]] as [id, label]}<button
        class:active={tool === id}
        onclick={() => {
          placingFurnitureId.set(null);
          selectedTool.set(id as any);
        }}>{$tr(label)}</button
      >{/each}<label
      ><input type="checkbox" bind:checked={$snapEnabled} />{$tr("吸附")}</label
    ><span>{$tr("双击完成绘墙 · Delete 删除 · 尺寸显示 m/cm")}</span>
  </div>
  <div class="drawing"><FloorPlanCanvas /></div>
</div>

<style>
  .advanced {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .tools {
    display: flex;
    align-items: center;
    padding: 9px 12px;
    gap: 6px;
    background: #f4f6ee;
    border-bottom: 1px solid #d7dfcd;
    font-size: 10px;
  }
  .tools button {
    border: 1px solid #d7dfcd;
    background: white;
    padding: 5px 12px;
    color: #58734d;
    border-radius: 3px;
  }
  .tools button.active {
    background: #356e55;
    color: white;
  }
  .tools label {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 10px;
    color: #4f624a;
  }
  .tools span {
    color: #4f624a;
    font-size: 9px;
    margin-left: auto;
  }
  .drawing {
    flex: 1;
    min-height: 0;
    position: relative;
  }
</style>
