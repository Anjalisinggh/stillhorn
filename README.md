# stillhorn

A little winter world, made for no one. A just-for-fun 3D scroll animation built with Next.js and Three.js:
mountains, a tiny cabin with the lights on, falling snow, a fire indoors and an aurora overhead.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Structure

- `app/` — layout (fonts, Vercel Analytics), page and global styles
- `components/Stillhorn.tsx` — page markup and scroll effects
- `lib/scenes/world.js` — the opening 3D fly-in (peaks, cabin, snow, aurora)
- `lib/scenes/chapters.js` — the three 3D chapter scenes (uphill, indoors, outside)
- `public/videos/` — optional Google Flow clips (see `FLOW_PROMPTS.md`); each plays over its 3D scene if present
