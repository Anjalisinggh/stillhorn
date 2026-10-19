# Stillhorn — Google Flow video prompts

Generate each clip in Google Flow (labs.google/flow), download as MP4, and save it in the `videos/` folder
with the exact filename shown. The page picks each one up automatically; until a file exists, the
drawn/CSS fallback is shown instead.

**Settings for all clips:** 16:9 landscape, 8 seconds, no people facing camera, no text, no music needed
(videos play muted). Ask for a *seamless loop* — slow, continuous motion loops best.

**Shared style line** (paste at the end of every prompt so the clips match the page's 3D world):
> Stylized 3D animated render, Blender / Octane look, low-poly faceted snow and rock with soft
> subsurface glow, miniature diorama feel, volumetric fog, cold moonlit blue palette with warm amber
> window light and gentle bloom, smooth slow cinematic camera move, seamless loop, no text, no logos.

---

## 1. Hero — no video needed
The hero is now a live, interactive Three.js 3D scene (`world.js`): scrolling flies the camera over the
peaks down to the cabin and up to the aurora. The clips below fill the film chapters and cards, styled to match it.

## 2. `ascent.mp4` — Chapter 01, The Ascent
Slow forward tracking shot following ski-touring tracks up a steep snowy slope into thick drifting cloud,
blue-hour light, wind lifting fine spindrift off the ridge, the faint silhouette of a lone mountaineer far
ahead, the hut's warm light barely visible at the top through the fog.

## 3. `hearth.mp4` — Chapter 02, The Hearth
Close, intimate interior of an old larch-wood mountain hut at night: a cast-iron wood stove with dancing
flames in the foreground, wool socks and leather boots drying beside it, a bubbling fondue pot on a rough
wooden table, frost patterns on a small window with snow falling outside. Slow push-in, shallow depth of field.

## 4. `summit.mp4` — Chapter 03, The Night
Time-lapse style wide shot from the hut's snowy terrace: green and teal aurora gently rippling over a jagged
mountain ridge, the Milky Way overhead, stars slowly rotating, the hut's warm window light spilling onto
the snow in the foreground.

## 5. Card clips (optional — 3:4 portrait if Flow allows, otherwise 16:9 is fine)
- `card-cabin.mp4` — Cozy attic bedroom under sloped wooden eaves, sheepskin throws, a small window framing a snowy peak at sunrise, dust motes in the light.
- `card-sauna.mp4` — Outdoor cedar sauna barrel in deep snow at dusk, steam rising from the chimney and door, warm light inside.
- `card-ski.mp4` — A skier carving first tracks through untouched powder at dawn, snow spraying in golden backlight, slow motion.
- `card-stars.mp4` — A brass telescope on a snowy wooden terrace under a starry sky, two steaming mugs of mulled wine on the railing.

---

### Tips
- If a clip doesn't loop cleanly, use Flow's *Extend* to add a few seconds, or crossfade the start/end in any editor.
- Keep files small for the web: export at 1080p; optionally compress with
  `ffmpeg -i in.mp4 -vcodec libx264 -crf 26 -preset slow -an out.mp4` (`-an` strips audio).
- For a still poster frame (shown while a video loads), you can also generate a matching image in Flow.
