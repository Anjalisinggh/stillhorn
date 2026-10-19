# stillhorn

A little winter world, made for no one. A just-for-fun 3D scroll animation built with Three.js:
mountains, a tiny cabin with the lights on, falling snow, a fire indoors and an aurora overhead.

## Run it

It uses ES modules, so serve the folder rather than opening the file directly:

```bash
npx http-server -p 5173
```

Then open http://localhost:5173.

## Files

- `index.html` — page, styles and text
- `world.js` — the opening 3D fly-in (peaks, cabin, snow, aurora)
- `chapters.js` — the three 3D chapter scenes (uphill, indoors, outside)
- `FLOW_PROMPTS.md` — optional Google Flow video prompts; drop clips into `videos/`
