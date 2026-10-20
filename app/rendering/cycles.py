"""RoomFit shared-mesh Cycles backend. No scripts or remote assets are evaluated."""
import bpy, json, sys, math, pathlib, hashlib, time
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def make_material(data, cache):
    key=json.dumps(data,sort_keys=True)
    if key in cache: return cache[key]
    mat=bpy.data.materials.new(data['kind']); mat.use_nodes=True
    nt=mat.node_tree; nodes=nt.nodes; links=nt.links
    bs=nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*data['color'],1)
    bs.inputs['Roughness'].default_value=data['roughness'];bs.inputs['Metallic'].default_value=data['metalness']
    bs.inputs['Emission Color'].default_value=(*data.get('emission',[0,0,0]),1);bs.inputs['Emission Strength'].default_value=data.get('emissionStrength',0)
    kind=data['kind']
    if kind=='glass':
        bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.45
    elif kind=='light':
        strength=data.get('emissionStrength',0)
        bs.inputs['Emission Color'].default_value=(*data.get('emission',[1,.82,.56]),1);bs.inputs['Emission Strength'].default_value=strength
    elif kind in ('wood','fabric','paint','concrete','tile'):
        tex=nodes.new('ShaderNodeTexCoord'); mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY'
        # Position is in metres: grain/weave scale is independent of object size.
        mapping.inputs[1].default_value=(3,95,8) if kind=='wood' else (1,1,1)
        links.new(tex.outputs['Object'],mapping.inputs[0]);noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5 if kind=='wood' else 380 if kind=='fabric' else 85;noise.inputs['Detail'].default_value=3
        links.new(mapping.outputs['Vector'],noise.inputs['Vector'])
        ramp=nodes.new('ShaderNodeValToRGB');base=data['color'];ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[1].position=.85
        amount=.28 if kind=='wood' else .07
        ramp.color_ramp.elements[0].color=(*(v*(1-amount) for v in base),1);ramp.color_ramp.elements[1].color=(*(min(1,v*(1+amount)) for v in base),1)
        links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],bs.inputs['Base Color'])
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.0008 if kind=='fabric' else .0005
        links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    cache[key]=mat;return mat

def area_light(name,pos,target,energy,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='RECTANGLE';data.size=size;data.size_y=size;data.color=color
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=pos;aim(obj,target)

def main(input_path, output):
    input_path=str(pathlib.Path(input_path).resolve());output=str(pathlib.Path(output).resolve())
    start=time.monotonic();raw=pathlib.Path(input_path).read_bytes();data=json.loads(raw)
    if data.get('schema')!='RoomFitRender' or data.get('units')!='metres': raise ValueError('Unsupported render manifest')
    s=data['scene'];opts=s['render'];bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=min(1024,max(1,int(opts['samples'])));scene.cycles.use_denoising=True
    scene.render.resolution_x=int(opts['width']);scene.render.resolution_y=int(opts['height']);scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(output);scene.render.threads_mode='FIXED';scene.render.threads=12
    devices=[];backend='CPU'
    prefs=bpy.context.preferences.addons['cycles'].preferences
    for kind in ['OPTIX','CUDA']:
        try:
            prefs.compute_device_type=kind;prefs.get_devices();found=[d for d in prefs.devices if d.type==kind]
            if found:
                for d in prefs.devices:d.use=d.type==kind
                devices=[d.name for d in found];backend=kind;scene.cycles.device='GPU';break
        except (TypeError,RuntimeError):continue
    print('ROOMFIT_DEVICE',backend,devices,flush=True)
    cache={};counts={};bounds={}
    for i,item in enumerate(data['meshes']):
        if len(item['vertices'])>1000000 or len(item['faces'])>1000000:raise ValueError('Mesh too large')
        mesh=bpy.data.meshes.new(item['name']);mesh.from_pydata(item['vertices'],[],item['faces']);mesh.update()
        obj=bpy.data.objects.new(item['name'],mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(make_material(item['material'],cache))
        counts[item['name']]=counts.get(item['name'],0)+1
        vs=[v.co for v in mesh.vertices];bounds[str(i)]={'name':item['name'],'min':[min(v[a] for v in vs) for a in range(3)],'max':[max(v[a] for v in vs) for a in range(3)]}
        if item['name'] in ('wall','bed-frame','opening-jamb','door-leaf','skirting'):
            bevel=obj.modifiers.new('edge highlights','BEVEL');bevel.width=.002;bevel.segments=2
    scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');night=opts['preset']=='night';bg.inputs[0].default_value=(.35,.43,.56,1) if night else (.73,.82,1,1);bg.inputs[1].default_value=.05 if night else .45
    for item in data.get('lights',[]):
        light=bpy.data.lights.new('RoomFit RGB','POINT');light.energy=max(0,min(120,float(item['power'])));light.color=item['color'];light.shadow_soft_size=.08
        obj=bpy.data.objects.new('RoomFit RGB',light);bpy.context.collection.objects.link(obj);obj.location=item['position']
    verts=[p for r in s['rooms'] for p in r['polygon']];cx=sum(p['x'] for p in verts)/len(verts)/1000;cy=-sum(p['z'] for p in verts)/len(verts)/1000;h=s['rooms'][0]['height']/1000
    if not night:
        for op in s['openings']:
            if op['kind']!='window':continue
            wall=next(w for w in s['walls'] if w['id']==op['wallId']);dx=wall['end']['x']-wall['start']['x'];dz=wall['end']['z']-wall['start']['z'];l=math.hypot(dx,dz);x=(wall['start']['x']+dx*op['offset']/l)/1000;y=-(wall['start']['z']+dz*op['offset']/l)/1000
            area_light('window daylight',(x+dz/l*.08,y+dx/l*.08,(op['sill']+op['height']*.6)/1000),(cx,cy,.8),320 if opts['preset']=='overcast' else 620,op['width']/1000,(.86,.92,1))
        sun_data=bpy.data.lights.new('illustrative sun','SUN');sun_data.energy=1.4 if opts['preset']=='day' else .4;sun_data.angle=.12;sun=bpy.data.objects.new('illustrative sun',sun_data);bpy.context.collection.objects.link(sun);sun.rotation_euler=(math.radians(28),math.radians(-25),math.radians(-18))
    area_light('ceiling luminaire',(cx,cy,h-.09),(cx,cy,0),18 if night else 55,.6,(1,.79,.55))
    area_light('soft fill',(cx+.3,cy+.4,2.4),(cx,cy,.6),4 if night else 65,1.8,(1,.88,.7))
    cam_data=bpy.data.cameras.new('RoomFit camera');camera=bpy.data.objects.new('RoomFit camera',cam_data);bpy.context.collection.objects.link(camera);camera.location=data['camera']['position'];aim(camera,data['camera']['target']);cam_data.type='PERSP';cam_data.sensor_fit='VERTICAL';cam_data.sensor_height=24;cam_data.lens=24/(2*math.tan(math.radians(data['camera']['fov'])/2));cam_data.clip_start=.02;scene.camera=camera
    bpy.context.view_layer.update();projection_error=0
    for check in data.get('projectionChecks',[]):
        actual=world_to_camera_view(scene,camera,Vector(check['world']))
        projection_error=max(projection_error,abs(actual.x-check['expected'][0]),abs(actual.y-check['expected'][1]))
    if projection_error>1e-5:raise ValueError(f'Camera projection mismatch: {projection_error}')
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=opts['exposure']
    out=pathlib.Path(output);out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
    try:bpy.ops.render.render(write_still=True)
    except RuntimeError:
        if backend=='CPU':raise
        print('ROOMFIT_GPU_RETRY_CPU',flush=True);scene.cycles.device='CPU';backend='CPU fallback';bpy.ops.render.render(write_still=True)
    report={'manifest_sha256':hashlib.sha256(raw).hexdigest(),'mesh_count':len(data['meshes']),'mesh_names':counts,'bounds':bounds,'camera':data['camera'],'camera_projection_error':projection_error,'resolution':[scene.render.resolution_x,scene.render.resolution_y],'backend':backend,'devices':devices,'seconds':round(time.monotonic()-start,3),'output':str(out)}
    out.with_suffix('.verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('ROOMFIT_COMPLETE',json.dumps({k:v for k,v in report.items() if k!='bounds'}),flush=True)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];main(*args[:2])
