// Stillhorn — 3D scenes behind the pinned chapters: Ascent, Hearth, Night.
// One canvas, three scene groups; scroll picks the scene and drives the camera inside it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Starts the scene on the page's existing elements and returns a cleanup function. */
export function initChapters() {
  // Listeners and observers are tracked so the scene can be torn down on unmount.
  const ac = new AbortController();
  const addEventListener = (type, fn, opts) => window.addEventListener(type, fn, { ...(typeof opts === 'object' ? opts : {}), signal: ac.signal });
  const observers = [];
  class IO extends window.IntersectionObserver { constructor(...a) { super(...a); observers.push(this); } }
  let raf = 0;

  const canvas = document.getElementById('gl2');
  const section = document.getElementById('chapters');
  const fade = document.getElementById('chapFade');
  const mobile = innerWidth < 760;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Helpers ---------- */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * noise(x * f, y * f); a *= .5; f *= 2.03; } return s; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  function radial(color) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(.4, color + '88'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function planks(base, n, rx, ry) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), col = new THREE.Color(base);
    for (let i = 0; i < n; i++) {
      const k = .8 + hash(i, 9) * .35;
      x.fillStyle = `rgb(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0})`;
      x.fillRect(0, i * 256 / n, 256, 256 / n);
      x.strokeStyle = 'rgba(0,0,0,.08)';
      for (let g = 0; g < 6; g++) { x.beginPath(); const y = i * 256 / n + hash(i, g) * 256 / n; x.moveTo(0, y); x.bezierCurveTo(80, y + 3, 170, y - 3, 256, y + 1); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, i * 256 / n, 256, 2);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
  }
  function flameTex() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#2a0800'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 26; i++) {
      const cx = 10 + hash(i, 3) * 108, h = 60 + hash(i, 4) * 150, w = 14 + hash(i, 5) * 20;
      const g = x.createLinearGradient(0, 256, 0, 256 - h);
      g.addColorStop(0, '#fff2b0'); g.addColorStop(.35, '#ffb03a'); g.addColorStop(.8, '#d8400c'); g.addColorStop(1, 'rgba(120,20,0,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(cx - w, 256); x.quadraticCurveTo(cx - w * .3, 256 - h * .5, cx, 256 - h); x.quadraticCurveTo(cx + w * .3, 256 - h * .5, cx + w, 256); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
  }
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...o });
  function box(g, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
  function cyl(g, rt, rb, h, mat, x, y, z, seg = 10) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }

  function auroraMesh(w, h) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h, 160, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } },
      vertexShader: `uniform float uTime; varying vec2 vUv;
        void main(){ vUv=uv; vec3 p=position;
          p.z += sin(p.x*.015+uTime*.25)*30. + sin(p.x*.04-uTime*.4)*10.;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform float uTime; uniform float uAmt; varying vec2 vUv;
        float h(float n){return fract(sin(n)*43758.5453);}
        float n1(float x){float i=floor(x),f=fract(x);return mix(h(i),h(i+1.),f*f*(3.-2.*f));}
        void main(){
          float bands = n1(vUv.x*38.+uTime*.6)*.6 + n1(vUv.x*90.-uTime)*.4;
          float fade = smoothstep(0.,.25,vUv.y)*smoothstep(1.,.35,vUv.y)*smoothstep(0.,.15,vUv.x)*smoothstep(1.,.85,vUv.x);
          vec3 col = mix(vec3(.1,1.,.6), vec3(.35,.4,1.), smoothstep(.3,1.,vUv.y));
          gl_FragColor = vec4(col, bands*fade*uAmt*.9);
        }`
    }));
  }
  function stars(n, r) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * .48;
      a.set([Math.cos(t) * Math.cos(ph) * r, Math.sin(ph) * r, Math.sin(t) * Math.cos(ph) * r], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff', size: 1.5, sizeAttenuation: false, fog: false }));
  }

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .05, 1200);
  const snowTex = radial('#ffffff');

  /* =========================================================
     01 — ASCENT: skin track up a slope into cloud
     ========================================================= */
  const ascent = (() => {
    const g = new THREE.Group();
    const hA = (x, z) => -z * .32 + (fbm(x * .05 + 3, z * .05) - .5) * 6 + Math.pow(Math.abs(x) / 40, 2) * 30;
    const tx = z => Math.sin(z * .06) * 3;

    // slope
    let geo = new THREE.PlaneGeometry(260, 260, 130, 130); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -40);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, hA(p.getX(i), p.getZ(i)));
    geo = geo.toNonIndexed(); geo.computeVertexNormals();
    const col = new Float32Array(geo.attributes.position.count * 3), c = new THREE.Color();
    for (let i = 0; i < col.length / 3; i += 3) {
      c.set('#e3ebf5').lerp(new THREE.Color('#9fb2cc'), hash(i, 7) * .35);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const slope = new THREE.Mesh(geo, std('#fff', { vertexColors: true })); slope.receiveShadow = true; g.add(slope);

    // skin track: two grooves following the curve
    [-.45, .45].forEach(off => {
      const v = [], idx = [];
      for (let z = 60, i = 0; z > -140; z -= 1, i++) {
        for (const s of [-.08, .08]) { const x = tx(z) + off + s; v.push(x, hA(x, z) + .14, z); }
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); tg.setIndex(idx); tg.computeVertexNormals();
      g.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: '#a9b8cf', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
    });

    // lone mountaineer ahead on the track
    const climber = new THREE.Group();
    const jacket = std('#d0452b'), darkM = std('#1d2433'), skin = std('#e8c3a0');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .7, 4, 8), jacket); body.position.y = 1.15; climber.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), skin); head.position.y = 1.85; climber.add(head);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(.21, 10, 6, 0, 6.3, 0, 1.6), darkM); hat.position.y = 1.88; climber.add(hat);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.5, .65, .3), std('#3b4a63')); pack.position.set(0, 1.25, .3); climber.add(pack);
    const legs = [-.13, .13].map(x => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .55, 3, 6), darkM); l.position.set(x, .45, 0); climber.add(l); return l; });
    const poles = [-.42, .42].map(x => { const pl = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.4, 4), darkM); pl.position.set(x, .75, -.1); climber.add(pl); return pl; });
    [-.13, .13].forEach(x => { const ski = new THREE.Mesh(new THREE.BoxGeometry(.1, .04, 1.9), std('#e3a83a')); ski.position.set(x, .05, -.1); climber.add(ski); });
    climber.traverse(o => o.castShadow = true);
    climber.scale.setScalar(1.1);
    g.add(climber);

    // drifting cloud banks
    const cloudMat = new THREE.SpriteMaterial({ map: radial('#ffffff'), transparent: true, opacity: .28, depthWrite: false });
    const clouds = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(cloudMat); const z = 60 - Math.random() * 200, x = (Math.random() - .5) * 120;
      s.position.set(x, hA(x * .3, z) + 3 + Math.random() * 22, z); s.scale.setScalar(25 + Math.random() * 45);
      s.userData.v = (Math.random() - .5) * 2; clouds.push(s); g.add(s);
    }

    // spindrift
    const sdN = mobile ? 1200 : 2600, sd = new Float32Array(sdN * 3);
    for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() - .5) * 60;
    const sdGeo = new THREE.BufferGeometry(); sdGeo.setAttribute('position', new THREE.BufferAttribute(sd, 3));
    const drift = new THREE.Points(sdGeo, new THREE.PointsMaterial({ size: .18, map: snowTex, transparent: true, depthWrite: false, opacity: .9 }));
    g.add(drift);

    g.add(new THREE.HemisphereLight('#dfe9ff', '#7c8cab', 1.6));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.4); sun.position.set(-30, 50, -40); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 200 });
    sun.shadow.mapSize.set(1024, 1024); g.add(sun, sun.target);

    const look = new THREE.Vector3();
    return {
      group: g, bg: '#8b9cb5', fog: new THREE.FogExp2('#8b9cb5', .014), exposure: 1,
      update(lp, t, dt, mx, my) {
        const z = lerp(34, -36, lp);
        camera.position.set(tx(z) + mx * 1.5, hA(tx(z), z) + 2.3 - my * .6, z);
        const zl = z - 12; look.set(tx(zl), hA(tx(zl), zl) + 1.4, zl);
        camera.lookAt(look);
        const zc = z - 15 - lp * 2, xc = tx(zc);
        const step = t * 3.2;
        climber.position.set(xc, hA(xc, zc) + Math.abs(Math.sin(step)) * .05, zc);
        climber.rotation.y = Math.atan2(tx(zc - 1) - xc, -1) * -1 + Math.PI;
        legs[0].rotation.x = Math.sin(step) * .35; legs[1].rotation.x = -Math.sin(step) * .35;
        poles[0].rotation.x = -Math.sin(step) * .4; poles[1].rotation.x = Math.sin(step) * .4;
        sun.position.set(camera.position.x - 30, camera.position.y + 50, camera.position.z - 40); sun.target.position.copy(climber.position);
        clouds.forEach(s => { s.position.x += s.userData.v * dt; if (Math.abs(s.position.x) > 70) s.userData.v *= -1; });
        if (!reduce) {
          const a = sdGeo.attributes.position.array;
          for (let i = 0; i < sdN; i++) { const j = i * 3; a[j] += (9 + (i % 7)) * dt; a[j + 1] -= .6 * dt + Math.sin(t * 2 + i) * .01; if (a[j] > 30) a[j] -= 60; if (a[j + 1] < -30) a[j + 1] += 60; }
          sdGeo.attributes.position.needsUpdate = true;
        }
        drift.position.copy(camera.position);
      }
    };
  })();

  /* =========================================================
     02 — HEARTH: inside the hut, by the stove
     ========================================================= */
  const hearth = (() => {
    const g = new THREE.Group();
    const wallTex = planks('#7a5238', 10, 3, 1), floorTex = planks('#5a3a26', 8, 1, 4); floorTex.rotation = Math.PI / 2;
    const wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: .9 });
    const floorM = new THREE.MeshStandardMaterial({ map: floorTex, roughness: .85 });
    const iron = new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: .45, metalness: .7 });
    const wood = std('#6b4630'), darkWood = std('#3a2518');

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorM); floor.rotation.x = -Math.PI / 2; floor.position.z = 1; floor.receiveShadow = true; g.add(floor);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), wall); back.position.set(0, 2.1, -4); back.receiveShadow = true; g.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), wall); left.rotation.y = Math.PI / 2; left.position.set(-5, 2.1, 1); left.receiveShadow = true; g.add(left);
    const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = 5; g.add(right);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std('#2c1d14')); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 4.2, 1); g.add(ceil);
    for (let x = -4; x <= 4; x += 2) box(g, .3, .3, 10, darkWood, x, 4.05, 1);

    // window with night + falling snow outside
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), new THREE.MeshBasicMaterial({ color: '#1d2f55' })); win.position.set(2, 2.3, -3.97); g.add(win);
    box(g, 2, .12, .15, darkWood, 2, 1.6, -3.92); box(g, 2, .12, .15, darkWood, 2, 3, -3.92);
    box(g, .12, 1.5, .15, darkWood, 1.04, 2.3, -3.92); box(g, .12, 1.5, .15, darkWood, 2.96, 2.3, -3.92);
    box(g, .06, 1.4, .1, darkWood, 2, 2.3, -3.9); box(g, 1.8, .06, .1, darkWood, 2, 2.3, -3.9);
    box(g, 2.2, .08, .35, wood, 2, 1.55, -3.8);
    const wsN = 160, ws = new Float32Array(wsN * 3);
    for (let i = 0; i < wsN; i++) ws.set([2 + (Math.random() - .5) * 1.7, 1.65 + Math.random() * 1.3, -3.95], i * 3);
    const wsGeo = new THREE.BufferGeometry(); wsGeo.setAttribute('position', new THREE.BufferAttribute(ws, 3));
    g.add(new THREE.Points(wsGeo, new THREE.PointsMaterial({ size: .035, color: '#e8f0ff', map: snowTex, transparent: true, depthWrite: false })));

    // wood stove
    const sx = -2, sz = -2.9;
    box(g, 1.3, 1.1, 1, iron, sx, .75, sz);
    box(g, 1.4, .08, 1.1, iron, sx, 1.34, sz);
    [[-.55, -.4], [.55, -.4], [-.55, .4], [.55, .4]].forEach(([x, z]) => cyl(g, .05, .05, .25, iron, sx + x, .12, sz + z, 6));
    cyl(g, .14, .14, 2.9, iron, sx + .3, 2.8, sz - .15);
    const flameT = flameTex();
    const fireMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: flameT, emissiveIntensity: 3 });
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(.8, .6), fireMat); fire.position.set(sx, .72, sz + .505); g.add(fire);
    box(g, .9, .06, .03, iron, sx, 1.04, sz + .52); box(g, .9, .06, .03, iron, sx, .4, sz + .52);
    const fireLight = new THREE.PointLight('#ff8a3c', 14, 12, 1.6); fireLight.position.set(sx, .9, sz + 1); fireLight.castShadow = !mobile; g.add(fireLight);
    // log pile
    for (let i = 0; i < 7; i++) { const l = cyl(g, .1, .1, .7, std('#5b3a22'), -3.6 + (i % 4) * .22, .1 + Math.floor(i / 4) * .19, -3.3, 7); l.rotation.x = Math.PI / 2; }
    // boots drying by the stove
    [[-.85, -1.9], [-.55, -1.8]].forEach(([x, z]) => { box(g, .2, .38, .26, std('#4a3021'), x, .19, z); box(g, .2, .12, .5, std('#4a3021'), x, .06, z + .13); });

    // rug, table, fondue, candle, mugs
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, .02, 24), std('#7d2a1f')); rug.scale.z = .7; rug.position.set(-.6, .01, -1.2); rug.receiveShadow = true; g.add(rug);
    box(g, 2.2, .1, 1.2, wood, 1.9, .82, -.6);
    [[-.95, -.45], [.95, -.45], [-.95, .45], [.95, .45]].forEach(([x, z]) => box(g, .1, .8, .1, darkWood, 1.9 + x, .4, -.6 + z));
    box(g, 2, .08, .35, wood, 1.9, .45, .35);
    cyl(g, .22, .17, .2, std('#a5321f', { roughness: .4 }), 1.9, .97, -.6, 14);
    const cheese = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .02, 14), new THREE.MeshStandardMaterial({ color: '#f5d77a', emissive: '#7a5a10', emissiveIntensity: .4 })); cheese.position.set(1.9, 1.07, -.6); g.add(cheese);
    cyl(g, .05, .05, .15, std('#f2ead8'), 1.25, .94, -.35, 8);
    const candleFlame = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshStandardMaterial({ emissive: '#ffbe6a', emissiveIntensity: 8, color: '#000' }));
    candleFlame.scale.y = 1.8; candleFlame.position.set(1.25, 1.06, -.35); g.add(candleFlame);
    const candleLight = new THREE.PointLight('#ffb35e', 3, 5, 2); candleLight.position.set(1.25, 1.2, -.35); g.add(candleLight);
    [[2.5, -.9], [2.7, -.4]].forEach(([x, z]) => cyl(g, .07, .06, .14, std('#d9d2c4', { roughness: .3 }), x, .94, z, 10));

    // dust motes in the warm air
    const dN = 260, dm = new Float32Array(dN * 3);
    for (let i = 0; i < dN; i++) dm.set([(Math.random() - .5) * 8, Math.random() * 4, -3.5 + Math.random() * 6], i * 3);
    const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dm, 3));
    g.add(new THREE.Points(dGeo, new THREE.PointsMaterial({ size: .03, color: '#ffcf94', map: snowTex, transparent: true, depthWrite: false, opacity: .6, blending: THREE.AdditiveBlending })));

    g.add(new THREE.AmbientLight('#3b4a6e', .5));
    const moonIn = new THREE.SpotLight('#7f9fe0', 6, 10, .5, .8); moonIn.position.set(2, 2.4, -4.5); moonIn.target.position.set(1.5, 0, -1); g.add(moonIn, moonIn.target);

    const look = new THREE.Vector3();
    return {
      group: g, bg: '#120c0a', fog: new THREE.Fog('#120c0a', 6, 16), exposure: 1.15,
      update(lp, t, dt, mx, my) {
        const e = ease(lp);
        camera.position.set(lerp(3.4, .3, e) + mx * .4, lerp(2.5, 1.45, e) - my * .2, lerp(5.6, 1.9, e));
        look.set(lerp(-.2, -1.7, e), lerp(1.1, .85, e), lerp(-1.8, -2.6, e));
        camera.lookAt(look);
        const f = .85 + Math.sin(t * 9) * .08 + Math.sin(t * 23) * .05 + (noise(t * 4, 1) - .5) * .25;
        fireLight.intensity = 14 * f; fireMat.emissiveIntensity = 3 * f;
        flameT.offset.x = t * .05; flameT.offset.y = Math.sin(t * 3) * .02;
        candleLight.intensity = 3 * (.9 + Math.sin(t * 13) * .1); candleFlame.scale.x = 1 + Math.sin(t * 17) * .1;
        if (!reduce) {
          const a = wsGeo.attributes.position.array;
          for (let i = 0; i < wsN; i++) { const j = i * 3; a[j + 1] -= (.25 + (i % 5) * .05) * dt; a[j] += Math.sin(t + i) * .002; if (a[j + 1] < 1.65) a[j + 1] = 2.95; }
          wsGeo.attributes.position.needsUpdate = true;
          const d = dGeo.attributes.position.array;
          for (let i = 0; i < dN; i++) { const j = i * 3; d[j + 1] += .05 * dt; d[j] += Math.sin(t * .5 + i) * .001; if (d[j + 1] > 4) d[j + 1] = 0; }
          dGeo.attributes.position.needsUpdate = true;
        }
      }
    };
  })();

  /* =========================================================
     03 — NIGHT: the terrace, telescope and aurora
     ========================================================= */
  const night = (() => {
    const g = new THREE.Group();
    const deckM = new THREE.MeshStandardMaterial({ map: planks('#5b4434', 12, 1, 3), roughness: .9 });
    const snowM = std('#e9f0fa'), darkWood = std('#2e2119'), brass = new THREE.MeshStandardMaterial({ color: '#c99a4a', metalness: .85, roughness: .3 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(12, .2, 8), deckM); deck.position.set(0, -.1, .5); deck.receiveShadow = true; g.add(deck);
    for (let x = -5.5; x <= 5.6; x += 1.5) { box(g, .14, 1.1, .14, darkWood, x, .55, -3.3); }
    box(g, 11.4, .1, .16, darkWood, 0, 1.1, -3.3); box(g, 11.4, .07, .1, darkWood, 0, .6, -3.3);
    box(g, 11.4, .1, .26, snowM, 0, 1.2, -3.3);
    [[-4.5, 3], [4.8, 2.5], [-5.4, -2.6], [5.2, -2.7]].forEach(([x, z]) => { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), snowM); d.scale.set(1.2, .35, .9); d.position.set(x, 0, z); g.add(d); });

    // telescope on a tripod
    const tel = new THREE.Group(); tel.position.set(-1.4, 0, -1.4);
    [0, 2.1, 4.2].forEach(a => { const l = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, 1.5, 6), darkWood); l.position.set(Math.cos(a) * .32, .7, Math.sin(a) * .32); l.rotation.set(Math.sin(a) * .22, 0, -Math.cos(a) * .22); tel.add(l); });
    const tube = new THREE.Group(); tube.position.y = 1.42; tube.rotation.x = .85; tel.add(tube);
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 1.5, 16), brass); t1.rotation.x = Math.PI / 2; tube.add(t1);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.085, 16), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#7fe0ff', emissiveIntensity: 1.2 })); lens.position.z = -.76; lens.rotation.y = Math.PI; tube.add(lens);
    tel.traverse(o => o.castShadow = true);
    tel.rotation.y = .3;
    g.add(tel);

    // mugs of glühwein with steam on the rail
    const steamMat = new THREE.SpriteMaterial({ map: radial('#ffffff'), transparent: true, opacity: .25, depthWrite: false });
    const steams = [];
    [[1, -3.3], [1.35, -3.28]].forEach(([x, z], i) => {
      cyl(g, .07, .06, .15, std('#b33a2a', { roughness: .4 }), x, 1.33, z, 12);
      for (let k = 0; k < 5; k++) { const s = new THREE.Sprite(steamMat); s.userData = { x, z, o: k / 5 + i * .1 }; g.add(s); steams.push(s); }
    });

    // lantern
    cyl(g, .05, .05, 1.4, darkWood, 3.6, .7, -2.6, 6);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb35c', emissiveIntensity: 6 })); lamp.position.set(3.6, 1.5, -2.6); g.add(lamp);
    const lampLight = new THREE.PointLight('#ff9e4d', 10, 9, 2); lampLight.position.set(3.6, 1.5, -2.4); lampLight.castShadow = !mobile; g.add(lampLight);

    // ring of distant peaks
    const peakM = std('#1d2a44'), capM = std('#c7d4e8');
    for (let i = 0; i < 26; i++) {
      const a = Math.PI + (i / 25) * Math.PI + (hash(i, 2) - .5) * .1, r = 230 + hash(i, 3) * 120, h = 30 + hash(i, 4) * 45, w = 40 + hash(i, 5) * 45;
      const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6, 3), peakM); m.position.set(Math.cos(a) * r, h / 2 - 18, Math.sin(a) * r); m.scale.set(1 + hash(i, 7), 1, .6 + hash(i, 8) * .6); m.rotation.y = hash(i, 6) * 3; g.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * .3, h * .3, 6), capM); cap.position.set(m.position.x, m.position.y + h * .351, m.position.z); cap.rotation.y = m.rotation.y; cap.scale.copy(m.scale); g.add(cap);
    }
    g.add(stars(2000, 600));
    const aur = auroraMesh(700, 220); aur.position.set(0, 140, -230); aur.rotation.x = .45; g.add(aur);

    g.add(new THREE.HemisphereLight('#4d6bb0', '#0a0f1c', .9));
    const moon = new THREE.DirectionalLight('#9ec4ff', .9); moon.position.set(20, 40, -30); g.add(moon);
    const auroraFill = new THREE.DirectionalLight('#3cffb0', .35); auroraFill.position.set(0, 60, -100); g.add(auroraFill);

    const look = new THREE.Vector3();
    return {
      group: g, bg: '#060b18', fog: new THREE.FogExp2('#060b18', .0025), exposure: 1.3,
      update(lp, t, dt, mx, my) {
        const e = ease(lp);
        camera.position.set(lerp(2.8, .6, e) + mx * .5, lerp(1.6, 1.25, e) - my * .2, lerp(4.2, 2.6, e));
        look.set(lerp(-1.2, -.5, e), lerp(1.1, 60, e * e), lerp(-1.6, -120, e));
        camera.lookAt(look);
        aur.material.uniforms.uTime.value = t;
        steams.forEach(s => {
          const l = (t * .25 + s.userData.o) % 1;
          s.position.set(s.userData.x + Math.sin(l * 5 + s.userData.o * 9) * .08 * l, 1.45 + l * .7, s.userData.z);
          s.scale.setScalar(.12 + l * .35); s.material.opacity = .25;
        });
        lampLight.intensity = 10 * (.92 + Math.sin(t * 7) * .05);
      }
    };
  })();

  /* ---------- Switching + render ---------- */
  const chapters = [ascent, hearth, night];
  chapters.forEach(c => { c.group.visible = false; scene.add(c.group); });
  let shown = -1;
  function show(i) {
    chapters.forEach((c, k) => c.group.visible = k === i);
    scene.background = new THREE.Color(chapters[i].bg); scene.fog = chapters[i].fog;
    renderer.toneMappingExposure = chapters[i].exposure;
    shown = i;
  }
  show(0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .7, .6, .85));
  composer.addPass(new OutputPass());
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  let mx = 0, my = 0, cmx = 0, cmy = 0, visible = false, fadeAmt = 0;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
  new IO(([e]) => visible = e.isIntersecting).observe(section);

  const lps = [0, 0, 0];
  const clock = new THREE.Clock();
  function frame() {
    raf = requestAnimationFrame(frame);
    const raw = clock.getDelta();
    if (!visible) return;
    const dt = Math.min(raw, .05), t = clock.elapsedTime;
    const r = section.getBoundingClientRect();
    const prog = Math.min(.999, Math.max(0, -r.top / (r.height - innerHeight)));
    const idx = Math.floor(prog * 3), local = prog * 3 - idx;

    // fade to night, swap scene at full black, fade back in
    if (idx !== shown) { fadeAmt = Math.min(1, fadeAmt + Math.min(raw, .1) * 5); if (fadeAmt >= 1) show(idx); }
    else fadeAmt = Math.max(0, fadeAmt - Math.min(raw, .1) * 4);
    fade.style.opacity = fadeAmt;
    const k = reduce ? 1 : 1 - Math.exp(-Math.min(raw, .5) * 3.5);
    lps[shown] += ((shown === idx ? local : shown < idx ? 1 : 0) - lps[shown]) * k;
    cmx += (mx - cmx) * k * .7; cmy += (my - cmy) * k * .7;
    chapters[shown].update(lps[shown], t, dt, cmx, cmy);
    composer.render();
  }
  frame();
  document.body.classList.add('gl2-ok');


  return () => {
    cancelAnimationFrame(raf);
    ac.abort();
    observers.forEach(o => o.disconnect());
    scene.traverse(o => {
      o.geometry?.dispose();
      [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); });
    });
    composer.dispose();
    renderer.dispose();
    document.body.classList.remove('gl2-ok');
  };
}
