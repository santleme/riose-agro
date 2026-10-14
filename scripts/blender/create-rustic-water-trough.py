import bpy
import math
import os
import json
from mathutils import Vector

out = os.path.abspath(bpy.context.scene.get('riose_output', 'assets/candidates/blender-demo'))
os.makedirs(out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
    for datablock in list(datablocks):
        if datablock.users == 0: datablocks.remove(datablock)

def material(name, color, roughness=0.82):
    mat = bpy.data.materials.new(name); mat.diffuse_color = (*color, 1); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value = (*color, 1); bsdf.inputs['Roughness'].default_value = roughness
    return mat

wood = material('cedar · warm Brazilian timber', (0.34, 0.20, 0.105))
wood_light = material('cedar · sunlit edge', (0.51, 0.33, 0.18))
water = material('water · deep reservoir blue', (0.12, 0.39, 0.48), 0.34)
iron = material('iron · dark brackets', (0.12, 0.14, 0.13))

def box(name, location, scale, mat, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location); obj = bpy.context.object; obj.name = name; obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('soft cut edge', 'BEVEL'); mod.width = bevel; mod.segments = 1
        obj.modifiers.new('weighted corner normals', 'WEIGHTED_NORMAL')
    return obj

# Open, four-sided feed-water trough on four short timber feet.
for x in (-0.9, 0.9):
    for y in (-0.37, 0.37): box('square timber foot', (x, y, 0.27), (0.14, 0.14, 0.54), wood_light)
for y in (-0.39, 0.39):
    box('long oak side', (0, y, 0.58), (2.05, 0.12, 0.46), wood, 0.035)
for x in (-0.97, 0.97):
    box('end oak board', (x, 0, 0.58), (0.12, 0.78, 0.46), wood_light, 0.025)
# Visible dark inner rim and a shallow blue water surface below the lip.
for y in (-0.305, 0.305): box('dark iron rim', (0, y, 0.83), (2.0, 0.035, 0.045), iron, 0.008)
for x in (-0.91, 0.91): box('dark iron rim', (x, 0, 0.83), (0.035, 0.62, 0.045), iron, 0.008)
box('calm water surface', (0, 0, 0.69), (1.78, 0.51, 0.028), water, 0.006)
# Two broad highlights make the water read at small sprite scale.
highlight = material('water · glint', (0.48, 0.72, 0.70), 0.5)
for x, width in ((-0.34, 0.42), (0.34, 0.24)):
    box('water highlight', (x, -0.12, 0.711), (width, 0.025, 0.008), highlight, 0)

camera_data = bpy.data.cameras.new('orthographic isometric camera')
camera = bpy.data.objects.new('orthographic isometric camera', camera_data); bpy.context.collection.objects.link(camera)
camera.location = (3.6, -5.2, 4.1); target = Vector((0, 0, 0.48)); camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3.5; bpy.context.scene.camera = camera

def area_light(name, location, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.shape = 'DISK'; data.size = size; data.color = color
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj); obj.location = location; obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()

area_light('large warm key · upper left', (-3, -4, 7), 430, 5.0, (1.0, 0.84, 0.64))
area_light('soft fill · sky', (4, 2, 5), 190, 4.0, (0.68, 0.82, 1.0))
scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 20; scene.cycles.use_denoising = False
scene.render.resolution_x = 480; scene.render.resolution_y = 360; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.film_transparent = True
scene.world.color = (0.16, 0.16, 0.16); scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'Medium High Contrast'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
scene.render.filepath = os.path.join(out, 'rustic-water-trough-blender.png')
scene['riose_projection'] = 'orthographic isometric 2:1 composition'; scene['riose_anchor'] = 'ground contact at image bottom center'; scene['riose_pixel_pipeline'] = 'transparent PNG render, then deterministic 3x nearest-neighbor pixel normalization'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'rustic-water-trough.blend'))
bpy.ops.render.render(write_still=True)
metadata = {
    'schemaVersion': 1,
    'id': 'water.trough.rustic.blender-demo.v1',
    'category': 'water',
    'file': os.path.join(out, 'rustic-water-trough-blender.png'),
    'sourceFile': os.path.join(out, 'rustic-water-trough.blend'),
    'sourceTool': 'Blender Python 4.0.2; Cycles CPU; orthographic camera; transparent PNG',
    'dimensions': {'width': 480, 'height': 360, 'resolution': 'render pixels'},
    'perspective': 'isometric 2:1 composition, orthographic camera',
    'footprint': {'worldUnits': [2.05, 0.78], 'collision': 'rounded rectangle around trough and feet'},
    'pivot': {'x': 0.5, 'y': 1.0, 'meaning': 'ground-contact center-bottom'},
    'heightWorldUnits': 0.85,
    'occlusionBounds': 'full alpha silhouette; extends above water plane',
    'animations': [],
    'license': {'state': 'project-created-internal-review', 'notes': 'No third-party model or texture used; Blender Foundation package is GPL software.'},
    'status': 'REVIEW',
    'notes': 'Headless fabrication proof. Inspect style match and pixel normalization before adding this candidate to runtime scenes.'
}
with open(os.path.join(out, 'rustic-water-trough-blender.json'), 'w', encoding='utf8') as handle:
    json.dump(metadata, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
print('RIOSE_BLENDER_ASSET', scene.render.filepath, bpy.context.scene.render.resolution_x, 'x', bpy.context.scene.render.resolution_y)
