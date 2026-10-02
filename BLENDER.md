# Blender version of the mycelium scene

Open [`exports/mycelium-garden.blend`](exports/mycelium-garden.blend) in Blender 5.2 or newer. The saved frame is shortly after the web timeline reaches 100%; press Home and then Space to watch from the first colony origin.

The scene contains editable collections for primary paths, secondary forks, fine hyphae, floating filaments, red mushrooms, eight continuing growth paths, origin lights, and the animated camera. The mushroom caps are editable copies of the supplied `public/models/3mushroom.glb`; the untouched source mesh remains in collection `09 · Supplied model source`.

The Blender timeline has three markers:

- Frame 1: six origins begin to appear.
- Frame 1621: the web progress display would reach 100%; the hyphae continue extending.
- Frame 2521: end of the 30-second baked continuation.

This is a deterministic, finite animation of the website's procedural scene. Mouse orbit, WASD steering, OSC button input, and infinite growth remain web-only interactions. The Blender paths, cap shapes, materials, lights, and camera keyframes can be edited directly. The accompanying [`exports/mycelium-scene.json`](exports/mycelium-scene.json) stores the sampled scene data used to build the `.blend` file.

To rebuild after changing the website's procedural source or GLB, from this project directory run:

```powershell
node scripts/export-blender-data.mjs
& 'F:\steam\steamapps\common\Blender\blender.exe' --background --python scripts/build-blender-scene.py -- exports/mycelium-scene.json exports/mycelium-garden.blend
```

The Blender executable path above is this workstation's current Steam installation. Use another Blender executable path if it moves.
