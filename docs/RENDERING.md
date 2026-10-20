# Blender Cycles

RoomFit exports actual buildScene world triangles and material/light/camera data to a bounded local child process. The same meshes drive Three.js previews. Millimetres map to Blender metres as (x,y,z) → (x,-z,y)/1000; camera FOV is vertical. Separate copies of cycles.py are checked against the source when packaging.

Select your own Blender executable in the application. Tested Blender 4.5.9 LTS tries OptiX, then CUDA, then CPU. A GPU is not required for editing; rendering performance varies. Blender is not bundled or relicensed. See https://www.blender.org/about/license/ for Blender’s terms.

Rendering exports authored geometry, not inferred room photography. Materials are simplified and colour temperature is an RGB approximation. Texture-bearing imported GLB assets are not supported by this release. Use the progress/error log to diagnose actual failures. Optional Python QA checks output dimensions, mesh bounds and camera agreement; it does not certify photorealism or construction accuracy.
