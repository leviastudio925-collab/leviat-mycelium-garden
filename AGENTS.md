# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Visual direction retained from user feedback

- Growth starts from six well-separated luminous points that awaken over the first several seconds, then extend concurrently into a three-dimensional, mycelium-like network. Keep the opening camera wide enough to show their spacing before it follows a branch. Avoid a single dominant trunk or one overall growth direction.
- The camera follows a seeded, connected sequence of random forks, then looks into the interwoven center as the space matures. Keep camera transitions smooth.
- New branches must extend continuously, especially at the start; never reveal them by whole tube segments.
- The current visual theme is a mycelium network: fine pale filaments against a near-black environment. It spreads rapidly first; red-orange mushrooms appear later in varied sizes and clusters, based on the user's charred-ground and cup-mushroom reference image.
- Use the supplied `public/models/3mushroom.glb` as the visible mushroom cap source. Keep deterministic shape variants, sizes, tilt and color so the user can change the model later without rewriting the growth sequence.
- Retain `src/flowers.js` as unused prior art, but do not render flowers in the current scene.
- Current UI should show only a quiet timeline at the bottom. `/mycelium/start` starts a fresh run over the local OSC UDP-to-WebSocket bridge. Space toggles growth playback, including after 100%; R restarts.
- Keep the mycelium network airy rather than overcrowded. Interweave a few broad textured paths with increasingly slender branches and fine hyphae.
- The user has only the 640 × 360 reference video and supplied still images, with no original 3D project or textures. Continue improving the interactive reconstruction from those references; do not describe it as pixel-identical.
- Keep the center rich in short, fine branches of varied radii. WASD should steer a visible branch from the current followed path; manual growth must not reset or advance the automatic timeline.
- At 100% on the timeline, the network must keep extending while the timeline stays at 100%. Keep several wandering growth tips active with a clear hierarchy: thick primary paths, thinner secondary forks, finest hyphae. The camera should gradually follow an active tip while looking back into the existing network; the walkers should turn gently inward before leaving the interwoven space. Space pauses or resumes growth; WASD remains available while playing. Do not reset at 100% unless R or OSC starts a new run.
- Keep the public GitHub repository and Cloudflare Worker deployment current. The user wants future updates to the mushroom GLB and growth parameters through the authenticated backend API backed by Cloudflare KV. Never commit the admin token; retain the simple timeline-only UI.
