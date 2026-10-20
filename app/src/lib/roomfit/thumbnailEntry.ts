import * as T from "three";
import { catalog, addItem, createRoom } from "./scene";
import { furnitureModel } from "./models";
import { buildScene,dispose } from "./buildScene";
import {templates,templateScene} from './templates';
export async function thumbnails() {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(256, 180);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  const out: Record<string, string> = {};
  for (const c of catalog) {
    const scene = new T.Scene();
    scene.background = new T.Color("#eeeee5");
    const f = addItem(createRoom(), c.id, 0, 0);
    const g = furnitureModel(f);
    scene.add(g);
    const bounds = new T.Box3().setFromObject(g),
      size = bounds.getSize(new T.Vector3()),
      center = bounds.getCenter(new T.Vector3());
    const aspect = 256 / 180;
    const radius = Math.max(size.x, size.y, size.z) * 0.72;
    const camera = new T.OrthographicCamera(
      -radius * aspect,
      radius * aspect,
      radius,
      -radius,
      0.01,
      100,
    );
    camera.position.copy(center).add(new T.Vector3(3, 2.3, 3));
    camera.lookAt(center);
    scene.add(new T.HemisphereLight(0xffffff, 0xb9b09e, 3));
    const light = new T.DirectionalLight(0xfff1d6, 3);
    light.position.set(-3, 5, 4);
    scene.add(light);
    renderer.render(scene, camera);
    out[c.id] = renderer.domElement.toDataURL("image/png").split(",")[1];
    dispose(scene);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
export async function roomThumbnails(){const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(360,230);renderer.toneMapping=T.ACESFilmicToneMapping;const out:Record<string,string>={};try{for(const t of templates){const s=templateScene(t.id),world=new T.Scene();world.background=new T.Color('#e7ece0');const room=buildScene(s);for(const id of [s.walls[1].id,s.walls[2].id,'ceiling-light']){const o=room.children.find(o=>o.name===id);if(o)o.visible=false;}world.add(room);world.add(new T.HemisphereLight('#ffffff','#948c78',3));const sun=new T.DirectionalLight('#fff2dc',3);sun.position.set(-3,6,4);world.add(sun);const radius=Math.max(t.w,t.d)/1000*.66,camera=new T.OrthographicCamera(-radius*360/230,radius*360/230,radius,-radius,.01,100);camera.position.set(t.w/1000+4,6,t.d/1000+4);camera.lookAt(t.w/2000,.8,t.d/2000);renderer.render(world,camera);out[t.id]=renderer.domElement.toDataURL('image/png').split(',')[1];dispose(world);}}finally{renderer.dispose();renderer.forceContextLoss();}return out;}
