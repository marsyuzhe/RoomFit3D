<script lang="ts">
  import { tr } from "./i18n";
  import type { RoomScene } from "./scene";
  import { footprint } from "./geometry";
  let {
    scene,
    selected,
    onselect,
    onmove,
  }: {
    scene: RoomScene;
    selected: string | null;
    onselect: (id: string | null) => void;
    onmove: (id: string, x: number, z: number) => void;
  } = $props();
  let svg: SVGSVGElement;
  let dragging: string | null = null;
  let preview = $state<{ id: string; x: number; z: number } | null>(null);
  let bounds = $derived.by(() => {
    const p = scene.rooms.flatMap((r) => r.polygon);
    const minX = Math.min(...p.map((p) => p.x)) - 600,
      minZ = Math.min(...p.map((p) => p.z)) - 600;
    return `${minX} ${minZ} ${Math.max(...p.map((p) => p.x)) - minX + 600} ${Math.max(...p.map((p) => p.z)) - minZ + 600}`;
  });
  function point(e: PointerEvent) {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
    return { x: Math.round(p.x / 10) * 10, z: Math.round(p.y / 10) * 10 };
  }
  function down(e: PointerEvent, id: string) {
    e.stopPropagation();
    onselect(id);
    const f = scene.furniture.find((f) => f.id === id)!;
    if (f.locked) return;
    dragging = id;
    svg.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragging) preview = { id: dragging, ...point(e) };
  }
  function up(e: PointerEvent) {
    if (preview) onmove(preview.id, preview.x, preview.z);
    preview = null;
    dragging = null;
    if (svg.hasPointerCapture(e.pointerId))
      svg.releasePointerCapture(e.pointerId);
  }
</script>

<svg
  bind:this={svg}
  viewBox={bounds}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  aria-label={$tr("二维平面图")}
  role="application"
>
  <defs
    ><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"
      ><path
        d="M100 0H0V100"
        fill="none"
        stroke="#dde2db"
        stroke-width="2"
      /></pattern
    ></defs
  ><rect
    x="-100000"
    y="-100000"
    width="200000"
    height="200000"
    fill="url(#grid)"
  />
  {#each scene.rooms as room}<polygon
      points={room.polygon.map((p) => `${p.x},${p.z}`).join(" ")}
      fill="#f4f2e9"
    />{/each}
  {#each scene.walls as w}<line
      x1={w.start.x}
      y1={w.start.z}
      x2={w.end.x}
      y2={w.end.z}
      stroke="#68746b"
      stroke-width={w.thickness}
    />{/each}
  {#each scene.openings as o}{@const w = scene.walls.find(
      (w) => w.id === o.wallId,
    )!}{@const l = Math.hypot(
      w.end.x - w.start.x,
      w.end.z - w.start.z,
    )}{@const x = w.start.x + ((w.end.x - w.start.x) * o.offset) / l}{@const z =
      w.start.z + ((w.end.z - w.start.z) * o.offset) / l}<g
      transform={`translate(${x} ${z}) rotate(${(Math.atan2(w.end.z - w.start.z, w.end.x - w.start.x) * 180) / Math.PI})`}
      ><rect
        x={-o.width / 2}
        y={-w.thickness / 2 - 2}
        width={o.width}
        height={w.thickness + 4}
        fill={o.kind === "window" ? "#b3d5d5" : "#f4f2e9"}
      />{#if o.kind === "door"}<path
          d={`M${-o.width / 2} 0 L${-o.width / 2} ${o.width} A${o.width} ${o.width} 0 0 0 ${o.width / 2} 0`}
          fill="none"
          stroke="#ad9373"
          stroke-width="12"
        />{/if}</g
    >{/each}
  {#each scene.furniture as f}{@const pos =
      preview?.id === f.id ? { ...f, x: preview.x, z: preview.z } : f}<g
      role="button"
      tabindex="0"
      aria-label={$tr(f.name)}
      onpointerdown={(e) => down(e, f.id)}
      onkeydown={(e) => {
        if (e.key === "Enter") onselect(f.id);
      }}
      ><polygon
        points={footprint(pos)
          .map((p) => `${p.x},${p.z}`)
          .join(" ")}
        fill={f.color}
        fill-opacity=".8"
        stroke={selected === f.id ? "#1c7864" : "#8b8d80"}
        stroke-width={selected === f.id ? 22 : 8}
      /><text
        x={pos.x}
        y={pos.z}
        text-anchor="middle"
        font-size="72"
        fill="#39473b"
        pointer-events="none">{$tr(f.name)}</text
      ><text
        x={pos.x}
        y={pos.z + 90}
        text-anchor="middle"
        font-size="50"
        pointer-events="none">{f.width} × {f.depth}</text
      ></g
    >{/each}
  {#each scene.rooms as r}{@const a = r.polygon[0]}{@const b =
      r.polygon[1]}<line
      x1={a.x}
      y1={a.z - 300}
      x2={b.x}
      y2={b.z - 300}
      stroke="#498273"
      stroke-width="6"
    /><text
      x={(a.x + b.x) / 2}
      y={a.z - 350}
      text-anchor="middle"
      font-size="75"
      fill="#347965">{Math.round(Math.hypot(b.x - a.x, b.z - a.z))} mm</text
    >{/each}
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    background: #e9ede6;
    touch-action: none;
  }
  g[role="button"] {
    cursor: grab;
  }
</style>
