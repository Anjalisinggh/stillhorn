'use client';

import { useEffect } from 'react';

const captions = [
  { from: 0.2, to: 0.42, side: '', eyebrow: 'Somewhere up there', title: 'Mountains, mostly.', text: 'A ring of low-poly peaks, a lot of snow, and one small light down in the valley.' },
  { from: 0.5, to: 0.72, side: 'right', eyebrow: 'The cabin', title: 'Someone left the lights on.', text: 'Nobody lives here. The chimney smokes anyway, because it looks nice.' },
  { from: 0.86, to: 1.01, side: '', eyebrow: 'Look up', title: 'And then, the aurora.', text: 'The best part. Stay here as long as you like.' },
];

const chapters = [
  { label: 'Uphill', fallback: 'fb-ascent', video: '/videos/ascent.mp4', title: 'Into the cloud.', text: "A tiny skier, a long slope, and fog that never quite clears. They're not going anywhere in particular." },
  { label: 'Indoors', fallback: 'fb-hearth', video: '/videos/hearth.mp4', title: 'A fire, for no reason.', text: 'A crackling stove, a candle, a pot of fondue nobody will eat. Snow keeps falling past the window.' },
  { label: 'Outside', fallback: 'fb-summit', video: '/videos/summit.mp4', title: 'Under the lights.', text: 'Two mugs going cold on the railing, a telescope pointed up, and the sky doing its thing.' },
];

const stats = [
  { count: 6000, label: 'Snowflakes' },
  { count: 1, label: 'Tiny cabin' },
  { count: 0, label: 'Things for sale' },
];

const Peak = ({ className, strokeWidth }: { className?: string; strokeWidth: number }) => (
  <svg className={className} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
    <path d="M4 32 L16 12 L22 21 L27 15 L36 32 Z" />
    {className === 'loader-mark' && <path d="M20 32v-6h5v6" />}
  </svg>
);

export default function Stillhorn() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    let cancelled = false;
    let worldReady = false;

    /* ---------- 3D scenes (client-only, loaded after mount) ---------- */
    const onReady = () => { worldReady = true; };
    window.addEventListener('world-ready', onReady);
    cleanups.push(() => window.removeEventListener('world-ready', onReady));
    const noGl = window.setTimeout(() => { if (!worldReady) { worldReady = true; document.body.classList.add('no-gl'); } }, 9000);
    cleanups.push(() => clearTimeout(noGl));

    import('@/lib/scenes/world').then(({ initWorld }) => { if (!cancelled) cleanups.push(initWorld()); });
    import('@/lib/scenes/chapters').then(({ initChapters }) => { if (!cancelled) cleanups.push(initChapters()); });

    /* ---------- Loader ---------- */
    const bar = document.getElementById('loadbar')!, pct = document.getElementById('loadpct')!;
    const loader = document.getElementById('loader')!;
    let p = 0;
    const tick = window.setInterval(() => {
      p = Math.min(worldReady ? 100 : 92, p + Math.random() * 14);
      bar.style.width = p + '%'; pct.textContent = Math.round(p) + '%';
      if (p >= 100) { clearInterval(tick); setTimeout(() => { loader.classList.add('done'); document.body.classList.remove('loading'); }, 350); }
    }, 120);
    cleanups.push(() => clearInterval(tick));

    /* ---------- Lazy chapter videos (only used if a file exists in public/videos) ---------- */
    const chapSec = document.getElementById('chapters')!;
    const vio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      chapSec.querySelectorAll<HTMLVideoElement>('video[data-src]').forEach(v => {
        if (v.src) return;
        v.addEventListener('error', () => v.remove(), { once: true });
        v.src = v.dataset.src!;
        v.play().catch(() => {});
      });
      vio.disconnect();
    }), { rootMargin: '200px' });
    vio.observe(chapSec);
    cleanups.push(() => vio.disconnect());

    /* ---------- Pinned chapters, nav ---------- */
    const chaps = [...chapSec.querySelectorAll('.chap')];
    const dots = [...chapSec.querySelectorAll('.chap-progress div')];
    const nav = document.getElementById('nav')!, top = document.getElementById('top')!;
    let current = 0;
    const onScroll = () => {
      const r = chapSec.getBoundingClientRect();
      const prog = Math.min(0.999, Math.max(0, -r.top / (r.height - innerHeight)));
      const i = Math.floor(prog * chaps.length);
      if (i !== current) {
        chaps[current].classList.remove('active'); dots[current].classList.remove('on');
        chaps[i].classList.add('active'); dots[i].classList.add('on');
        current = i;
      }
      nav.classList.toggle('scrolled', scrollY > top.offsetHeight - innerHeight * 1.2);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScroll));

    /* ---------- Reveal + counters ---------- */
    const rio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); rio.unobserve(e.target);
      e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(el => {
        const end = +el.dataset.count!, t0 = performance.now();
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / 1600);
          el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString();
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }), { threshold: 0.2 });
    document.querySelectorAll('.reveal').forEach(el => rio.observe(el));
    cleanups.push(() => rio.disconnect());

    return () => { cancelled = true; cleanups.forEach(fn => fn()); };
  }, []);

  return (
    <>
      <div id="loader">
        <div className="loader-inner">
          <Peak className="loader-mark" strokeWidth={1.4} />
          <div className="loader-word">Stillhorn</div>
          <div className="loader-bar"><span id="loadbar" /></div>
          <div className="loader-meta"><span>Making it snow</span><span id="loadpct">0%</span></div>
        </div>
      </div>

      <nav id="nav">
        <a className="brand" href="#top">
          <Peak strokeWidth={2} />
          <span><b>STILLHORN</b><small>A little winter world</small></span>
        </a>
        <div className="nav-links">
          <a href="#story">About</a><a href="#chapters">Scenes</a>
        </div>
      </nav>

      {/* 3D world: scroll drives the camera (lib/scenes/world.js) */}
      <section className="world" id="top">
        <div className="world-stick">
          <canvas id="gl" />
          <div className="w-title" id="worldTitle"><h1>STILLHORN</h1><p>A little winter world</p></div>
          {captions.map(c => (
            <div key={c.title} className={`w-cap ${c.side}`} data-from={c.from} data-to={c.to}>
              <span className="eyebrow">{c.eyebrow}</span><h2>{c.title}</h2><p>{c.text}</p>
            </div>
          ))}
          <div className="scroll-hint">Scroll to drift in <i /></div>
          <div className="world-bar" id="worldBar" />
        </div>
      </section>

      <section className="intro" id="story">
        <h2 className="reveal">A small, quiet place <em>made for no one.</em></h2>
        <div className="reveal">
          <p>
            Stillhorn isn&apos;t a real place, and there&apos;s nothing here to sign up for. It&apos;s just a winter scene I built
            for fun, with mountains, a cabin, falling snow and an aurora, all drawn live in your browser. Scroll slowly,
            move your mouse around, and watch it snow.
          </p>
          <div className="stats">
            {stats.map(s => (
              <div key={s.label} className="stat"><b data-count={s.count}>0</b><span>{s.label}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* Pinned chapters: 3D scenes from lib/scenes/chapters.js */}
      <section className="chapters" id="chapters">
        <div className="chap-stick">
          <canvas id="gl2" />
          <div className="chap-fade" id="chapFade" />
          {chapters.map((c, i) => (
            <div key={c.label} className={`chap${i === 0 ? ' active' : ''}`} data-i={i}>
              <div className={`fallback ${c.fallback}`} />
              <video muted loop playsInline preload="none" data-src={c.video} />
              <div className="chap-text">
                <div className="chap-num">{String(i + 1).padStart(2, '0')} — {c.label}</div>
                <h3>{c.title}</h3><p>{c.text}</p>
              </div>
            </div>
          ))}
          <div className="chap-progress">
            {chapters.map((c, i) => <div key={c.label} className={i === 0 ? 'on' : ''}><i />{c.label}</div>)}
          </div>
        </div>
      </section>

      <footer>
        <span>Stillhorn · a little winter world</span>
        <span>Made for fun · Next.js + Three.js</span>
        <span>Thanks for scrolling ✦</span>
      </footer>
    </>
  );
}
