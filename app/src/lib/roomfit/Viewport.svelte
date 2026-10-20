<script lang="ts">
  import { tr } from "./i18n";
  import { onMount } from "svelte";
  import * as T from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { buildScene, dispose } from "./buildScene";
  import { furnitureModel } from "./models";
  import type { RoomScene } from "./scene";
  let {
    scene,
    selected,
    onselect,
    onmove,
    oncamera,
    cameraMode = "orbit",
    quality = "high",
  }: {
    scene: RoomScene;
    selected: string | null;
    onselect: (id: string | null) => void;
    onmove: (id: string, x: number, z: number) => void;
    oncamera: (position: number[], target: number[]) => void;
    cameraMode?: string;
    quality?: string;
  } = $props();
  let host: HTMLDivElement,
    renderer: T.WebGLRenderer,
    world: T.Scene,
    camera: T.PerspectiveCamera,
    controls: OrbitControls,
    model: T.Group;
  let ready = $state(false),
    error = $state("");
  let dragId: string | null = null,
    origin: T.Vector3 | null = null,
    dragStart = { x: 0, y: 0 };
  let sceneVersion = 0;
  let houseSignature = "";
  const furnitureCache = new Map<
    string,
    { signature: string; object: T.Group }
  >();
  let frame = 0;
  let running = false;
  const keys = new Set<string>();
  const ray = new T.Raycaster(),
    mouse = new T.Vector2(),
    plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function point(e: PointerEvent) {
    const r = host.getBoundingClientRect();
    mouse.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(mouse, camera);
    const p = new T.Vector3();
    return ray.ray.intersectPlane(plane, p) ? p : null;
  }
  function down(e: PointerEvent) {
    if (e.button !== 0 || cameraMode === "walk") return;
    point(e);
    const hit = ray.intersectObjects(model.children, true).find((h) => {
      let o: T.Object3D | null = h.object;
      while (o) {
        if (o.userData.furnitureId) return true;
        o = o.parent;
      }
      return false;
    });
    if (hit) {
      let obj: T.Object3D | null = hit.object;
      while (obj && !obj.userData.furnitureId) obj = obj.parent;
      const id = obj!.userData.furnitureId;
      onselect(id);
      const f = scene.furniture.find((f) => f.id === id);
      if (f && !f.locked) {
        dragId = id;
        origin = point(e);
        dragStart = { x: f.x, y: f.z };
        controls.enabled = false;
        host.setPointerCapture(e.pointerId);
      }
    } else onselect(null);
  }
  function move(e: PointerEvent) {
    if (!dragId || !origin) return;
    const p = point(e);
    if (!p) return;
    const obj = model.children.find((o) => o.userData.furnitureId === dragId);
    if (obj)
      obj.position.set(
        Math.round((dragStart.x + (p.x - origin.x) * 1000) / 10) * 0.01,
        obj.position.y,
        Math.round((dragStart.y + (p.z - origin.z) * 1000) / 10) * 0.01,
      );
  }
  function up(e: PointerEvent) {
    if (dragId) {
      const obj = model.children.find((o) => o.userData.furnitureId === dragId);
      if (obj)
        onmove(
          dragId,
          Math.round(obj.position.x * 1000),
          Math.round(obj.position.z * 1000),
        );
    }
    dragId = null;
    origin = null;
    controls.enabled = true;
    if (host.hasPointerCapture(e.pointerId))
      host.releasePointerCapture(e.pointerId);
  }
  function keyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
    keys.add(e.key.toLowerCase());
  }
  function keyUp(e: KeyboardEvent) {
    keys.delete(e.key.toLowerCase());
  }
  function saveCamera() {
    if (cameraMode !== "interior" && cameraMode !== "walk") return;
    oncamera(
      camera.position.toArray().map((n) => n * 1000),
      controls.target.toArray().map((n) => n * 1000),
    );
  }
  $effect(() => {
    const current = scene;
    if (!ready) return;
    const signature = JSON.stringify({
      rooms: current.rooms,
      walls: current.walls,
      openings: current.openings,
      materials: current.materials,
    });
    if (!model || signature !== houseSignature) {
      if (model) {
        world.remove(model);
        dispose(model);
      }
      furnitureCache.clear();
      model = buildScene({ ...current, furniture: [] });
      world.add(model);
      houseSignature = signature;
    }
    const ids = new Set(current.furniture.map((f) => f.id));
    for (const [id, cached] of furnitureCache) {
      if (!ids.has(id)) {
        model.remove(cached.object);
        dispose(cached.object);
        furnitureCache.delete(id);
      }
    }
    for (const f of current.furniture) {
      const signature = JSON.stringify(f),
        previous = furnitureCache.get(f.id);
      if (previous?.signature === signature) continue;
      if (previous) {
        model.remove(previous.object);
        dispose(previous.object);
      }
      const object = furnitureModel(f,current.assets);
      model.add(object);
      furnitureCache.set(f.id, { signature, object });
    }
    const helper = world.children.find((o) => o.name === "selection"),
      object = model.children.find((o) => o.userData.furnitureId === selected);
    if (helper instanceof T.BoxHelper && object) helper.setFromObject(object);
  });
  $effect(() => {
    const id = selected;
    if (!ready || !model) return;
    world.children
      .filter((o) => o.name === "selection")
      .forEach((o) => {
        world.remove(o);
        dispose(o);
      });
    const obj = model.children.find((o) => o.userData.furnitureId === id);
    if (obj) {
      const helper = new T.BoxHelper(obj, 0x347965);
      helper.name = "selection";
      world.add(helper);
    }
  });
  $effect(() => {
    const mode = cameraMode;
    if (!ready) return;
    if (mode === "interior" || mode === "walk") {
      camera.position.set(
        ...(scene.camera.position.map((n) => n / 1000) as [
          number,
          number,
          number,
        ]),
      );
      controls.target.set(
        ...(scene.camera.target.map((n) => n / 1000) as [
          number,
          number,
          number,
        ]),
      );
    } else if (mode === "top") {
      const p = scene.rooms.flatMap((r) => r.polygon),
        cx =
          (Math.min(...p.map((p) => p.x)) + Math.max(...p.map((p) => p.x))) /
          2000,
        cz =
          (Math.min(...p.map((p) => p.z)) + Math.max(...p.map((p) => p.z))) /
          2000;
      const span = Math.max(
        ...p.map((p) => p.x / 1000),
        ...p.map((p) => p.z / 1000),
        3.6,
      );
      camera.position.set(cx, span * 2.2, cz + 0.001);
      controls.target.set(cx, 0, cz);
    } else {
      const p = scene.rooms.flatMap((r) => r.polygon),
        cx =
          (Math.min(...p.map((p) => p.x)) + Math.max(...p.map((p) => p.x))) /
          2000,
        cz =
          (Math.min(...p.map((p) => p.z)) + Math.max(...p.map((p) => p.z))) /
          2000;
      const span =
        Math.max(
          Math.max(...p.map((p) => p.x)) - Math.min(...p.map((p) => p.x)),
          Math.max(...p.map((p) => p.z)) - Math.min(...p.map((p) => p.z)),
        ) / 1000;
      camera.position.set(cx + span, span * 1.6, cz + span * 1.15);
      controls.target.set(cx, 0.7, cz);
    }
    controls.update();
  });
  $effect(() => {
    const fov = scene.camera.fov;
    if (!ready) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  });
  $effect(() => {
    if (!ready) return;
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
    );
    renderer.shadowMap.enabled = quality !== "low";
  });
  onMount(() => {
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.domElement.dataset.roomfitCanvas = "true";
      host.appendChild(renderer.domElement);
      world = new T.Scene();
      world.background = new T.Color("#e5e7e3");
      camera = new T.PerspectiveCamera(scene.camera.fov, 1, 0.02, 200);
      camera.position.set(7, 6.5, 7);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(1.8, 0.7, 1.6);
      controls.enableDamping = true;
      controls.addEventListener("end", saveCamera);
      controls.update();
      world.add(new T.HemisphereLight(0xf2f4fa, 0x82745e, 2.2));
      const sun = new T.DirectionalLight(0xffedce, 3);
      sun.position.set(2, 6, -3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -8;
      sun.shadow.camera.right = 8;
      sun.shadow.camera.top = 8;
      sun.shadow.camera.bottom = -8;
      sun.shadow.bias = -0.0004;
      world.add(sun);
      const grid = new T.GridHelper(20, 100, 0xb9c2b9, 0xd0d6ce);
      grid.position.y = -0.085;
      world.add(grid);
      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        renderer.setSize(width, height);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      ready = true;
      running = true;
      let last = performance.now();
      function animate(now: number) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (cameraMode === "walk") {
          const forward = new T.Vector3();
          camera.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();
          const right = new T.Vector3().crossVectors(
            forward,
            new T.Vector3(0, 1, 0),
          );
          const delta = new T.Vector3();
          if (keys.has("w")) delta.add(forward);
          if (keys.has("s")) delta.sub(forward);
          if (keys.has("d")) delta.add(right);
          if (keys.has("a")) delta.sub(right);
          delta.multiplyScalar(dt * 1.5);
          camera.position.add(delta);
          controls.target.add(delta);
        }
        if (model)
          for (const obj of model.children) {
            if (!obj.userData.roomfitWall) continue;
            const w = scene.walls.find((w) => w.id === obj.name);
            if (!w) continue;
            const dx = w.end.x - w.start.x,
              dz = w.end.z - w.start.z;
            const vx = camera.position.x * 1000 - (w.start.x + w.end.x) / 2,
              vz = camera.position.z * 1000 - (w.start.z + w.end.z) / 2;
            obj.visible =
              cameraMode === "interior" ||
              cameraMode === "walk" ||
              dz * vx - dx * vz <= 0;
          }
        controls.update();
        renderer.render(world, camera);
        frame = requestAnimationFrame(animate);
      }
      frame = requestAnimationFrame(animate);
      window.addEventListener("keydown", keyDown);
      window.addEventListener("keyup", keyUp);
      const blur = () => keys.clear();
      window.addEventListener("blur", blur);
      return () => {
        running = false;
        sceneVersion++;
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener("keydown", keyDown);
        window.removeEventListener("keyup", keyUp);
        window.removeEventListener("blur", blur);
        controls.dispose();
        dispose(world);
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });
</script>

<div
  class="viewport"
  bind:this={host}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  role="application"
  aria-label={$tr("三维设计工作区")}
>
  {#if error}<div class="error">{$tr("3D 初始化失败：")}{error}</div>{/if}
  <div class="hint">
    {cameraMode === "walk"
      ? $tr("WASD 漫游 · 拖动调整视角")
      : $tr("左键旋转 · 右键平移 · 滚轮缩放 · 拖动家具")}<br />{$tr(
      "X → / Y ↑ / Z ↘ ·\n    毫米尺寸驱动",
    )}
  </div>
</div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    touch-action: none;
  }
  .hint {
    position: absolute;
    bottom: 16px;
    left: 20px;
    font-size: 11px;
    color: #58675c;
    pointer-events: none;
    line-height: 1.8;
  }
  .error {
    padding: 30px;
    color: #af382f;
  }
</style>
