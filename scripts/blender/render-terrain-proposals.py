"""Render deterministic heightfield proposals as transparent 2.5D terrain plates."""
import bpy
import json
import math
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path(os.environ.get('RIOSE_REPO_ROOT', Path(__file__).resolve().parents[2]))
PROPOSAL_DIR = ROOT / 'graphics-poc/generated/terrain-v5'
OUT_DIR = PROPOSAL_DIR
SOURCE_DIR = ROOT / 'assets/candidates/terrain-family-v7'
SOURCE_DIR.mkdir(parents=True, exist_ok=True)

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)

def make_material(name, color, roughness=0.9):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    emission_color = shader.inputs.get('Emission Color')
    emission_strength = shader.inputs.get('Emission Strength')
    if emission_color: emission_color.default_value = (*color, 1)
    if emission_strength: emission_strength.default_value = 0.22
    return material

def make_top_material(path):
    material = bpy.data.materials.new('pasture plate · baked pixel art')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.interpolation = 'Closest'
    texture.extension = 'CLIP'
    surface = nodes.new('ShaderNodeBsdfPrincipled')
    surface.inputs['Roughness'].default_value = 1.0
    surface.inputs['Metallic'].default_value = 0.0
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(texture.outputs['Color'], surface.inputs['Base Color'])
    links.new(texture.outputs['Alpha'], surface.inputs['Alpha'])
    links.new(surface.outputs[0], output.inputs['Surface'])
    return material, texture.image

def make_cliff_material(path):
    material = bpy.data.materials.new('cliff face · authored soil texture')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.interpolation = 'Closest'
    texture.extension = 'REPEAT'
    surface = nodes.new('ShaderNodeBsdfPrincipled')
    surface.inputs['Roughness'].default_value = 1.0
    emission_color = surface.inputs.get('Emission Color')
    emission_strength = surface.inputs.get('Emission Strength')
    if emission_color:
        links.new(texture.outputs['Color'], emission_color)
    if emission_strength:
        emission_strength.default_value = 0.2
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(texture.outputs['Color'], surface.inputs['Base Color'])
    links.new(surface.outputs[0], output.inputs['Surface'])
    return material

def make_light(name, location, energy, size, color):
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy = energy
    light_data.shape = 'DISK'
    light_data.size = size
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, -0.1)) - light.location).to_track_quat('-Z', 'Y').to_euler()

def build_terrain_mesh(record, top_material):
    grid = record['heightmap']
    rows, columns = record['grid']['rows'], record['grid']['columns']
    size_x, size_y = record['grid']['worldSize']
    x0, y0 = -size_x / 2, -size_y / 2
    base_z = -0.5
    vertices, faces, material_indices, face_uvs = [], [], [], []
    heights = [[float(value) for value in row] for row in grid]

    def point(row, col):
        return (x0 + size_x * col / (columns - 1), y0 + size_y * row / (rows - 1), heights[row][col])

    def source_uv(x, y):
        px = 887.0 + (x - y) * 61.0
        py = 423.0 + (x + y) * 27.2
        # The orthographic camera's local screen-right axis is the inverse of
        # the source plate x axis for this (+x,+y) viewing direction.
        return (1.0 - px / 1774.0, 1.0 - py / 887.0)

    # Heightfield top, independent from surface art. Each quad is a real 3D surface.
    top_index = []
    for row in range(rows):
        line = []
        for col in range(columns):
            x, y, z = point(row, col)
            line.append(len(vertices)); vertices.append((x, y, z))
        top_index.append(line)
    for row in range(rows - 1):
        for col in range(columns - 1):
            a, b = top_index[row][col], top_index[row][col + 1]
            c, d = top_index[row + 1][col + 1], top_index[row + 1][col]
            faces.append((a, b, c, d)); material_indices.append(0)
            face_uvs.append([source_uv(*vertices[index][:2]) for index in (a, b, c, d)])

    # Discrete step risers between height levels create visible terraces/cliffs.
    earth_layer_count = 3
    for row in range(rows - 1):
        for col in range(columns - 1):
            for side in ('east', 'south'):
                if side == 'east':
                    h0, h1 = heights[row][col], heights[row][col + 1]
                    if abs(h0 - h1) < 0.18: continue
                    x = x0 + size_x * (col + 1) / (columns - 1)
                    y_a, y_b = y0 + size_y * row / (rows - 1), y0 + size_y * (row + 1) / (rows - 1)
                    low_a, low_b, high_a, high_b = (h0, h0, h1, h1) if h0 < h1 else (h1, h1, h0, h0)
                    coords = [(x,y_a,low_a),(x,y_b,low_b),(x,y_b,high_b),(x,y_a,high_a)]
                else:
                    h0, h1 = heights[row][col], heights[row + 1][col]
                    if abs(h0 - h1) < 0.18: continue
                    y = y0 + size_y * (row + 1) / (rows - 1)
                    x_a, x_b = x0 + size_x * col / (columns - 1), x0 + size_x * (col + 1) / (columns - 1)
                    low_a, low_b, high_a, high_b = (h0, h0, h1, h1) if h0 < h1 else (h1, h1, h0, h0)
                    coords = [(x_a,y,low_a),(x_b,y,low_b),(x_b,y,high_b),(x_a,y,high_a)]
                base = len(vertices); vertices.extend(coords); faces.append(tuple(range(base, base + 4)))
                material_indices.append(5)
                world_axis = 1 if side == 'east' else 0
                face_uvs.append([(coord[world_axis], coord[2] - base_z) for coord in coords])

    # Variable-height perimeter walls and a continuous clay underside.
    boundary = []
    boundary.extend([(0, col) for col in range(columns)])
    boundary.extend([(row, columns - 1) for row in range(1, rows)])
    boundary.extend([(rows - 1, col) for col in range(columns - 2, -1, -1)])
    boundary.extend([(row, 0) for row in range(rows - 2, 0, -1)])
    ring_ids = [top_index[row][col] for row, col in boundary]
    perimeter_distance = 0.0
    for index, current in enumerate(ring_ids):
        following = ring_ids[(index + 1) % len(ring_ids)]
        p0, p1 = vertices[current], vertices[following]
        low0, low1 = (p0[0], p0[1], base_z), (p1[0], p1[1], base_z)
        base = len(vertices); vertices.extend([p0, p1, low1, low0])
        faces.append((base, base+1, base+2, base+3)); material_indices.append(5)
        segment_length = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        u0, u1 = perimeter_distance, perimeter_distance + segment_length
        face_uvs.append([(u0, 1), (u1, 1), (u1, 0), (u0, 0)])
        perimeter_distance = u1
    bottom_start = len(vertices)
    vertices.extend([(x0, y0, base_z), (x0 + size_x, y0, base_z), (x0 + size_x, y0 + size_y, base_z), (x0, y0 + size_y, base_z)])
    faces.append((bottom_start, bottom_start + 1, bottom_start + 2, bottom_start + 3)); material_indices.append(4); face_uvs.append([(0, 0)] * 4)

    mesh = bpy.data.meshes.new(f"{record['proposal']} · heightfield mesh")
    mesh.from_pydata(vertices, [], faces); mesh.update()
    uv_layer = mesh.uv_layers.new(name='world-isometric UV')
    for polygon, values, mat_index in zip(mesh.polygons, face_uvs, material_indices):
        polygon.material_index = mat_index
        polygon.use_smooth = mat_index == 0
        for loop_index, uv in zip(polygon.loop_indices, values): uv_layer.data[loop_index].uv = uv
    obj = bpy.data.objects.new(f"terrain · {record['proposal']}", mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def render_proposal(path):
    record = json.loads(path.read_text())
    clear_scene()
    top_material, _ = make_top_material(ROOT / record['materials']['topSurface'])
    cliff_material = make_cliff_material(ROOT / record['materials']['cliffFace'])
    palette = [
        (0.47, 0.265, 0.145), (0.56, 0.33, 0.18), (0.40, 0.22, 0.12),
        (0.31, 0.16, 0.09),
    ]
    materials = [top_material] + [make_material(f'interior soil strata {index+1}', color) for index, color in enumerate(palette)] + [cliff_material]
    terrain = build_terrain_mesh(record, top_material)
    # Index 0 is the top plate, 1-4 are underside strata, and 5 textures both
    # internal risers and perimeter walls in world-scaled UVs.
    for material in materials: terrain.data.materials.append(material)

    target = Vector((0, 0, -0.067))
    camera_data = bpy.data.cameras.new('orthographic isometric terrain camera')
    camera = bpy.data.objects.new('orthographic isometric terrain camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (9, 9, -0.067 + math.sqrt(2) * 9 * math.tan(math.radians(30)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'; camera_data.ortho_scale = 950.0 / (61.0 * math.sqrt(2)); bpy.context.scene.camera = camera

    make_light('warm sun · upper left', (-5, -7, 10), 850, 7.0, (1.0, 0.86, 0.69))
    make_light('cool sky fill', (5, 4, 8), 500, 9.0, (0.72, 0.83, 1.0))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 20; scene.cycles.use_denoising = False
    scene.render.resolution_x = 1774; scene.render.resolution_y = 950; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.film_transparent = True
    scene.world.color = (0.16, 0.16, 0.16)
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'Medium High Contrast'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    scene.render.filepath = str(OUT_DIR / f"{record['proposal']}-render.png")
    scene['riose_projection'] = 'orthographic isometric 2:1; 30 degree elevation'
    scene['riose_heightfield'] = str(path.relative_to(ROOT))
    scene['riose_seed'] = record['seed']
    scene['riose_surface_source'] = record['materials']['topSurface']
    bpy.context.preferences.filepaths.save_version = 0
    blend_path = SOURCE_DIR / f"terrain-{record['proposal']}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    image_path = Path(scene.render.filepath)
    print('RIOSE_TERRAIN_RENDER', record['proposal'], record['seed'], image_path, '1774x950', 'Cycles CPU')

proposal_ids = {item['proposal'] for item in json.loads((PROPOSAL_DIR / 'proposals.json').read_text())['proposals']}
for input_path in sorted(PROPOSAL_DIR.glob('*.json')):
    if input_path.stem not in proposal_ids: continue
    render_proposal(input_path)
