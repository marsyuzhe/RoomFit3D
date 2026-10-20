<script lang="ts">
  import {onMount} from 'svelte';
  import * as T from 'three';
  import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
  import {createRoom,addItem,type Furniture} from './scene';
  import {furnitureModel} from './models';
  import {dispose} from './buildScene';
  let {catalogId,furniture}:{catalogId:string;furniture?:Furniture}=$props();
  let host:HTMLDivElement,ready=$state(false),error=$state('');
  let renderer:T.WebGLRenderer,world:T.Scene,camera:T.PerspectiveCamera,controls:OrbitControls,object:T.Group|undefined;
  $effect(()=>{const id=catalogId,custom=furniture;if(!ready)return;if(object){world.remove(object);dispose(object);}const f=custom?{...custom,x:0,y:0,z:0,rotation:0}:addItem(createRoom(),id,0,0);object=furnitureModel(f);world.add(object);const box=new T.Box3().setFromObject(object),c=box.getCenter(new T.Vector3()),n=box.getSize(new T.Vector3()).length();camera.position.copy(c).add(new T.Vector3(n*.8,n*.6,n*.9));controls.target.copy(c);controls.update();});
  onMount(()=>{let raf=0;let observer:ResizeObserver;try{renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=T.ACESFilmicToneMapping;host.appendChild(renderer.domElement);world=new T.Scene();world.background=new T.Color('#e9ece3');world.add(new T.HemisphereLight('#ffffff','#9c967b',3));const key=new T.DirectionalLight('#fff4de',3);key.position.set(-3,5,4);world.add(key);camera=new T.PerspectiveCamera(40,1,.001,100);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;observer=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/Math.max(host.clientHeight,1);camera.updateProjectionMatrix();});observer.observe(host);ready=true;const tick=()=>{raf=requestAnimationFrame(tick);controls.update();renderer.render(world,camera);};tick();}catch(e){error=String(e);}return()=>{ready=false;cancelAnimationFrame(raf);observer?.disconnect();controls?.dispose();if(world)dispose(world);renderer?.dispose();renderer?.forceContextLoss();};});
</script>
<div class="model-preview" bind:this={host} data-model-preview>{#if error}<p>{error}</p>{/if}</div>
<style>.model-preview{width:100%;height:320px;min-width:0;overflow:hidden;border-radius:12px}.model-preview :global(canvas){display:block;max-width:100%}</style>
