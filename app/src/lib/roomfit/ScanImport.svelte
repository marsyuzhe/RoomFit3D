<script lang="ts">
  import { tr } from "./i18n";
  import {
    loadScanFile,
    scanLevels,
    scanSummary,
    sceneFromScan,
  } from "./scanImport";
  import type { RoomScene } from "./scene";
  let {
    onclose,
    oncreate,
  }: { onclose: () => void; oncreate: (scene: RoomScene) => void } = $props();
  let data = $state.raw<any>(null),
    name = $state(""),
    level = $state(0),
    cleanup = $state(false),
    doors = $state(true),
    windows = $state(true),
    furniture = $state(false),
    error = $state(""),
    busy = $state(false);
  const levels = $derived(data ? scanLevels(data) : []),
    summary = $derived(data ? scanSummary(data, level) : null);
  let input: HTMLInputElement;
  async function choose(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    error = "";
    try {
      const next = await loadScanFile(file);
      data = next;
      name = file.name;
      level = scanLevels(next)[0].level;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      input.value = "";
    }
  }
  function create() {
    try {
      oncreate(
        sceneFromScan(data, name, { level, cleanup, doors, windows, furniture })
          .scene,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div class="backdrop">
  <div
    class="scan"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-labelledby="scan-title"
    data-scan-import
  >
    <small>ROOMPLAN · {$tr("本地扫描导入")}</small>
    <h2 id="scan-title">{$tr("从手机扫描建立房间")}</h2>
    <p>
      {$tr(
        "在支持 RoomPlan 的 iPhone/iPad 上采集，再导出 JSON 或扫描 ZIP 到电脑。Windows 不能直接执行 Apple RoomPlan 采集。",
      )}
    </p>
    <p>
      {$tr(
        "openPlan3D 手机端优先选择 Export Editable Plan (JSON)。原始扫描 ZIP 应只含一个 room.json；含 plan.json 的编辑工程包请改用可编辑 JSON。",
      )}
    </p>
    <input
      hidden
      type="file"
      accept=".json,.zip"
      aria-label={$tr("选择扫描文件")}
      bind:this={input}
      onchange={choose}
    />
    <button onclick={() => input.click()} disabled={busy}
      >{$tr(busy ? "正在本地处理…" : "选择 RoomPlan JSON / ZIP")}</button
    >
    {#if data}<b class="filename">{name}</b><label
        >{$tr("导入楼层")}<select
          aria-label={$tr("导入楼层")}
          bind:value={level}
          >{#each levels as item}<option value={item.level}>{item.name}</option
            >{/each}</select
        ></label
      >
      <p>
        {$tr("墙体")}
        {summary?.walls} · {$tr("门")}
        {summary?.doors} · {$tr("窗")}
        {summary?.windows} · {$tr("家具")}
        {summary?.objects}
      </p>
      <label
        ><input type="checkbox" bind:checked={cleanup} />{$tr(
          "校正接近水平/垂直的墙线并连接近邻端点（会改变墙线）",
        )}</label
      >
      <label
        ><input
          type="checkbox"
          aria-label={$tr("导入门")}
          bind:checked={doors}
        />{$tr("导入门（当前仅支持内开单门）")}</label
      >
      <label
        ><input type="checkbox" bind:checked={windows} />{$tr(
          "导入窗，特殊窗型暂用矩形洞口",
        )}</label
      >
      <label
        ><input type="checkbox" bind:checked={furniture} />{$tr(
          "导入当前家具库支持的识别家具（估算）",
        )}</label
      >
      <p>
        {$tr(
          "每次导入一个楼层。原始扫描数据保存在工程来源资源中；不支持的对象不会伪装成已完成模型。",
        )}
      </p>{/if}
    <p class="notice">
      {$tr(
        "扫描尺寸始终标记为估算，请复测墙长、门宽和家具尺寸。生成将替换当前场景，可撤回。",
      )}
    </p>
    <p class="error" role="status">{$tr(error)}</p>
    <div class="actions">
      <button onclick={onclose} disabled={busy}>{$tr("取消")}</button><button
        class="primary"
        onclick={create}
        disabled={!data || busy}>{$tr("导入扫描并建立三维")}</button
      >
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #20372dcc;
    color: #30443a;
    font:
      12px "Segoe UI",
      "Microsoft YaHei",
      sans-serif;
    color-scheme: light;
    padding: 20px;
  }
  .scan {
    background: #f7f9f1;
    border-radius: 8px;
    padding: 28px;
    width: min(580px, 100%);
    max-height: 90vh;
    overflow: auto;
    box-shadow: 0 20px 70px #0004;
  }
  .scan small {
    color: #4f624a;
    letter-spacing: 1px;
  }
  h2 {
    font-size: 24px;
    font-weight: 500;
    margin: 10px 0 16px;
  }
  p {
    line-height: 1.7;
    color: #4f624a;
    font-size: 12px;
    margin: 12px 0;
  }
  button,
  select {
    font: inherit;
    border: 1px solid #becdb5;
    background: white;
    color: #30443a;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .primary {
    background: #306d59;
    color: white;
  }
  .filename {
    display: block;
    overflow-wrap: anywhere;
    margin-top: 15px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 0;
  }
  select {
    flex: 1;
  }
  .notice {
    border-top: 1px solid #d3ddcb;
    padding-top: 12px;
  }
  .error {
    color: #963b2a;
    min-height: 18px;
  }
  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  input[type="checkbox"] {
    accent-color: #306d59;
  }
</style>
