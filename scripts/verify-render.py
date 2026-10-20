"""Independently verify the manifest fingerprint, pixel size, mesh bounds and camera."""
import hashlib, json, pathlib, struct, sys

def verify(manifest_path, png_path):
    source=pathlib.Path(manifest_path).read_bytes();manifest=json.loads(source)
    path=pathlib.Path(png_path);image=path.read_bytes()
    assert image[:8]==b'\x89PNG\r\n\x1a\n', 'Not a PNG'
    resolution=list(struct.unpack('>II',image[16:24]));report=json.loads(path.with_suffix('.verification.json').read_text(encoding='utf-8'))
    assert report['manifest_sha256']==hashlib.sha256(source).hexdigest(),'Render snapshot mismatch'
    assert resolution==[manifest['scene']['render']['width'],manifest['scene']['render']['height']]==report['resolution'],'Resolution mismatch'
    assert len(manifest['meshes'])==report['mesh_count'],'Missing meshes'
    max_error=0
    for i,mesh in enumerate(manifest['meshes']):
        actual=report['bounds'][str(i)];assert actual['name']==mesh['name']
        for axis in range(3):
            for kind,fn in [('min',min),('max',max)]:
                error=abs(actual[kind][axis]-fn(p[axis] for p in mesh['vertices']));max_error=max(max_error,error)
                assert error<1e-5,f'Mesh bounds differ: {i} / {axis}'
    assert report['camera']==manifest['camera'],'Camera transform mismatch'
    assert report['camera_projection_error']<1e-5,'Camera projection mismatch'
    result={'passed':True,'resolution':resolution,'meshes':len(manifest['meshes']),'max_mesh_error_mm':max_error*1000,'camera_projection_error':report['camera_projection_error'],'seconds':report['seconds'],'backend':report['backend']}
    path.with_suffix('.qa.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2));return result

if __name__=='__main__':verify(*sys.argv[1:3])
