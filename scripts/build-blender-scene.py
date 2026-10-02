"""Build an editable Blender animation from the browser installation snapshot.

Run with: blender --background --python scripts/build-blender-scene.py -- DATA.json OUT.blend
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    if '--' not in sys.argv:
        raise SystemExit('Expected -- DATA.json OUT.blend')
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) != 2:
        raise SystemExit('Expected -- DATA.json OUT.blend')
    return Path(args[0]).resolve(), Path(args[1]).resolve()


DATA_PATH, OUT_PATH = arguments()
DATA = json.loads(DATA_PATH.read_text(encoding='utf-8'))
PROJECT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT / 'public' / 'models' / '3mushroom.glb'
FPS = DATA['fps']
MAIN_END = DATA['timelineSeconds'] * FPS + 1
FINAL_FRAME = (DATA['timelineSeconds'] + DATA['continuationSeconds']) * FPS + 1


def from_web(point):
    """Three.js Y-up into Blender Z-up, preserving handedness."""
    return Vector((point[0], -point[2], point[1]))


def rgb(hex_color):
    h = hex_color.lstrip('#')
    channels = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels)


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def put_object(name, data, parent_collection):
    obj = bpy.data.objects.new(name, data)
    parent_collection.objects.link(obj)
    return obj


def material(name, color, emission=0, roughness=.8, fiber=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb(color), 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Emission Color'].default_value = (*rgb(color), 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    if fiber:
        tex = nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 34
        tex.inputs['Detail'].default_value = 3
        tex.inputs['Roughness'].default_value = .68
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .016
        mat.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def set_growth(curve, birth, duration, normalised=True):
    begin = 1 + round(birth * DATA['timelineSeconds'] * FPS) if normalised else round(birth * FPS) + 1
    end = 1 + round((birth + duration) * DATA['timelineSeconds'] * FPS) if normalised else round((birth + duration) * FPS) + 1
    begin = max(1, begin)
    end = max(begin + 1, min(FINAL_FRAME, end))
    curve.bevel_factor_end = 0
    curve.keyframe_insert(data_path='bevel_factor_end', frame=max(1, begin - 1))
    curve.keyframe_insert(data_path='bevel_factor_end', frame=begin)
    curve.bevel_factor_end = 1
    curve.keyframe_insert(data_path='bevel_factor_end', frame=end)


def make_hypha(item, target, mat, tapered=True):
    curve = bpy.data.curves.new(item['name'], type='CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = max(.002, item['radius'])
    curve.bevel_resolution = 2 if item['radius'] > .018 else 1
    curve.bevel_factor_mapping_end = 'SPLINE'
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(item['points']) - 1)
    for index, point in enumerate(item['points']):
        pos = from_web(point)
        spline.points[index].co = (*pos, 1)
        t = index / max(1, len(item['points']) - 1)
        if tapered:
            end_scale = .17 if item.get('depth') == 0 else .035
            contour = 1 + .045 * math.sin(t * 23) + .022 * math.sin(t * 59 + .8)
            spline.points[index].radius = (1 - t ** 1.5 * (1 - end_scale)) * min(1, .58 + t * 5) * contour
        else:
            spline.points[index].radius = 1
    curve.materials.append(mat)
    obj = put_object(item['name'], curve, target)
    set_growth(curve, item['birth'], item['duration'])
    return obj


def setup_compositor(scene):
    try:
        tree = bpy.data.node_groups.new('Soft fungal glow', 'CompositorNodeTree')
        scene.compositing_node_group = tree
        tree.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        render = tree.nodes.new('CompositorNodeRLayers')
        glare = tree.nodes.new('CompositorNodeGlare')
        glare.inputs['Type'].default_value = 'Fog Glow'
        glare.inputs['Threshold'].default_value = 1.15
        glare.inputs['Quality'].default_value = 'Medium'
        glare.inputs['Strength'].default_value = .62
        output = tree.nodes.new('NodeGroupOutput')
        tree.links.new(render.outputs['Image'], glare.inputs['Image'])
        tree.links.new(glare.outputs['Image'], output.inputs['Image'])
    except (AttributeError, TypeError, RuntimeError) as exc:
        print(f'Compositor glow unavailable in this Blender version: {exc}')


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = FINAL_FRAME
scene.view_settings.view_transform = 'AgX'
scene.world = bpy.data.worlds.new('Near-black atmosphere')
scene.world.use_nodes = True
world_bg = scene.world.node_tree.nodes.get('Background')
world_bg.inputs['Color'].default_value = (.0015, .002, .002, 1)
world_bg.inputs['Strength'].default_value = .2
setup_compositor(scene)

primary_col = collection('01 · Primary mycelium')
secondary_col = collection('02 · Secondary forks')
fine_col = collection('03 · Fine hyphae')
filament_col = collection('04 · Floating filaments')
mushroom_col = collection('05 · Red mushrooms (editable GLB instances)')
ongoing_col = collection('06 · Growth after 100%')
origin_col = collection('07 · Six colony origins')
lights_col = collection('08 · Camera and lights')
source_col = collection('09 · Supplied model source')

primary_mat = material('Warm white · textured primary', '#d6dad1', .34, .8, True)
companion_mat = material('Faint braided companion fiber', '#a9b7b0', .24, .78, True)
secondary_mat = material('Pale ivory · textured secondary', '#dfe6db', .30, .79, True)
fine_mat = material('Delicate luminous hypha', '#e7eee4', .42, .75, True)
filament_mat = material('Airborne microfilament', '#c7d6cc', .48, .8)
ongoing_mat = material('Living tips · silver green', '#dbefdd', .7, .6, True)
stem_mat = material('Mushroom stem · warm brown', '#a88f7d', .08, .86)
origin_mat = material('Origin light', '#e9ffed', 3.5, .3)
tip_mat = material('Living tip · soft fluorescent green', '#e9fff0', 5, .3)

for item in DATA['branches']:
    depth = item['depth']
    target = primary_col if depth == 0 else secondary_col if depth == 1 else fine_col
    mat = primary_mat if depth == 0 else secondary_mat if depth == 1 else fine_mat
    make_hypha(item, target, mat)

for item in DATA['companions']:
    make_hypha(item, primary_col, companion_mat)

for index, filament in enumerate(DATA['filaments']):
    make_hypha({**filament, 'name': f'Microfilament_{index:04d}', 'duration': .04}, filament_col, filament_mat, False)

for item in DATA['ongoing']:
    make_hypha(item, ongoing_col, ongoing_mat, False)

for index, item in enumerate(DATA['ongoing']):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.14)
    tip = bpy.context.object
    tip.name = f'Animated_growth_tip_{index:02d}'
    for old_collection in list(tip.users_collection):
        old_collection.objects.unlink(tip)
    ongoing_col.objects.link(tip)
    tip.data.materials.append(tip_mat)
    begin = 1 + round(item['birth'] * DATA['timelineSeconds'] * FPS)
    tip.scale = (.0001,) * 3
    tip.keyframe_insert(data_path='scale', frame=max(1, begin - 1))
    tip.scale = (1, 1, 1)
    tip.keyframe_insert(data_path='scale', frame=begin)
    for point_index, point in enumerate(item['points']):
        frame = min(FINAL_FRAME, begin + point_index * 3)
        tip.location = from_web(point)
        tip.keyframe_insert(data_path='location', frame=frame)

# Preserve the user's source GLB mesh, then make eight editable cap profiles.
before_import = set(scene.objects)
bpy.ops.import_scene.gltf(filepath=str(MODEL_PATH))
source = next((obj for obj in scene.objects if obj not in before_import and obj.type == 'MESH'), None)
if source is None:
    raise RuntimeError('The supplied GLB has no mushroom cap mesh')
for old_collection in list(source.users_collection):
    old_collection.objects.unlink(source)
source_col.objects.link(source)
source.name = 'SOURCE · 3mushroom.glb'
source.hide_render = True
source.hide_viewport = True
source.location = (0, 0, -1000)

raw = [tuple(vertex.co) for vertex in source.data.vertices]
xs = [p[0] for p in raw]
ys = [p[1] for p in raw]
zs = [p[2] for p in raw]
center_x = (min(xs) + max(xs)) * .5
center_y = (min(ys) + max(ys)) * .5
width = max(max(xs) - min(xs), max(ys) - min(ys), .001)
height = max(max(zs) - min(zs), .001)
cap_colors = ['#ff5123', '#ff6926', '#ff7c32', '#e9441d', '#ff8b3c', '#f75c26']
cap_materials = [material(f'Cap glaze · {i + 1} · {color}', color, .55, .34, True) for i, color in enumerate(cap_colors)]
cap_meshes = []
for variant in range(8):
    mesh = source.data.copy()
    mesh.name = f'Editable GLB cap profile {variant + 1}'
    wide = [.78, 1.02, 1.18, .92, 1.3, 1.06, .86, 1.23][variant]
    profile = [.9, 1.05, .76, 1.18, .84, 1.1, .95, .8][variant]
    for vertex, (x0, y0, z0) in zip(mesh.vertices, raw):
        x = (x0 - center_x) * 2 / width
        y = (y0 - center_y) * 2 / width
        z = (z0 - min(zs)) * 1.5 / height
        angle = math.atan2(y, x)
        radial = math.hypot(x, y)
        irregularity = 1 + math.sin(angle * (5 + variant % 4) + variant * 1.7) * (.025 + variant % 3 * .014) + math.cos(angle * 9 - variant * 2.1) * .016
        vertex.co = (x * wide * irregularity,
                     y * (2 - wide) * irregularity,
                     z * profile + math.sin(angle * 6 + variant) * .035 * radial)
    mesh.update()
    cap_meshes.append(mesh)

# A shared cup-like cap mesh and stem base keep the scene editable and compact.
bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=.11, radius2=.06, depth=1)
stem_source = bpy.context.object
stem_mesh = stem_source.data
stem_mesh.name = 'Reusable organic stalk'
for vertex in stem_mesh.vertices:
    vertex.co.z += .5
bpy.data.objects.remove(stem_source, do_unlink=True)
stem_mesh.materials.append(stem_mat)

for index, item in enumerate(DATA['mushrooms']):
    base = from_web(item['point'])
    size = item['size']
    stalk = item['height'] * size
    begin = 1 + round(item['birth'] * DATA['timelineSeconds'] * FPS)
    end = begin + max(2, round(item['duration'] * DATA['timelineSeconds'] * FPS))
    stem = put_object(f'Stalk_{index:03d}', stem_mesh, mushroom_col)
    stem.location = base
    stem.rotation_euler = (item['tiltX'], -item['tiltZ'], item['rotation'])
    cap = put_object(f'GLB_Cap_{index:03d}_V{item["variant"] + 1}', cap_meshes[item['variant']].copy(), mushroom_col)
    cap.data.materials.clear()
    closest = min(range(len(cap_colors)), key=lambda i: sum((a - b) ** 2 for a, b in zip(rgb(cap_colors[i]), rgb(item['color']))))
    cap.data.materials.append(cap_materials[closest])
    cap.rotation_euler = stem.rotation_euler
    for frame, growth in ((max(1, begin - 1), .00001), (begin, .00001), (end, 1)):
        stem.scale = (size * growth, size * growth, stalk * growth)
        cap.scale = (size * growth, size * growth, size * growth * (.72 + item['height'] * .12))
        cap.location = base + Vector((0, 0, stalk * growth))
        stem.keyframe_insert(data_path='scale', frame=frame)
        cap.keyframe_insert(data_path='scale', frame=frame)
        cap.keyframe_insert(data_path='location', frame=frame)

for index, origin in enumerate(DATA['origins']):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.13, location=from_web(origin['point']))
    orb = bpy.context.object
    orb.name = f'Origin_{index + 1}'
    for old_collection in list(orb.users_collection):
        old_collection.objects.unlink(orb)
    origin_col.objects.link(orb)
    orb.data.materials.append(origin_mat)
    begin = 1 + round(origin['birth'] * DATA['timelineSeconds'] * FPS)
    for frame, size in ((1, .0001), (max(1, begin - 1), .0001), (begin + 7, 1), (begin + 45, .48)):
        orb.scale = (size, size, size)
        orb.keyframe_insert(data_path='scale', frame=frame)

camera_data = bpy.data.cameras.new('Traveling camera · 66° FOV')
camera_data.type = 'PERSP'
camera_data.sensor_fit = 'VERTICAL'
camera_data.sensor_height = 24
camera_data.lens = 12 / math.tan(math.radians(33))
camera_data.clip_end = 210
camera = put_object('Camera · follows growing hypha', camera_data, lights_col)
scene.camera = camera
camera.rotation_mode = 'QUATERNION'
for item in DATA['cameraFrames']:
    eye = from_web(item['eye'])
    target = from_web(item['target'])
    camera.location = eye
    camera.rotation_quaternion = (target - eye).to_track_quat('-Z', 'Y')
    camera.keyframe_insert(data_path='location', frame=item['frame'])
    camera.keyframe_insert(data_path='rotation_quaternion', frame=item['frame'])


def area_light(name, color, power, size, location):
    lamp = bpy.data.lights.new(name, type='AREA')
    lamp.energy = power
    lamp.color = rgb(color)
    lamp.shape = 'DISK'
    lamp.size = size
    obj = put_object(name, lamp, lights_col)
    obj.location = from_web(location)
    obj.rotation_euler = (Vector(from_web(DATA['center'])) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


center = DATA['center']
area_light('Warm diffuse key', '#ffe9cf', 3600, 26, [center[0] - 8, center[1] + 12, center[2] + 10])
area_light('Cool rim', '#b2c6e4', 2200, 20, [center[0] + 12, center[1] - 2, center[2] - 8])
area_light('Mushroom ember', '#ff6034', 1800, 19, [center[0] + 2, center[1] + 4, center[2] + 16])

scene.timeline_markers.new('Start · six points awaken', frame=1)
scene.timeline_markers.new('100% · growth continues', frame=MAIN_END)
scene.timeline_markers.new('End of baked extension', frame=FINAL_FRAME)
scene.frame_set(MAIN_END + 150)
scene.render.filepath = str(OUT_PATH.with_name('mycelium-preview.png'))
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_PATH))
print(f'Saved {OUT_PATH}: {len(DATA["branches"])} animated branches, {len(DATA["mushrooms"])} editable GLB mushrooms, {len(DATA["ongoing"])} continuing paths, camera animation through frame {FINAL_FRAME}')
