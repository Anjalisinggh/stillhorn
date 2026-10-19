// Stillhorn — scroll-driven Three.js world: peaks, pines, a lit cabin, snowfall and an aurora.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Starts the scene on the page's existing elements and returns a cleanup function. */
export function initWorld() {
  // Listeners and observers are tracked so the scene can be torn down on unmount.
  const ac = new AbortController();
  const addEventListener = (type, fn, opts) => window.addEventListener(type, fn, { ...(typeof opts === 'object' ? opts : {}), signal: ac.signal });
  const observers = [];
  class IO extends window.IntersectionObserver { constructor(...a) { super(...a); observers.push(this); } }
  let raf = 0;

  const canvas = document.getElementById('gl');
  const section = document.getElementById('top');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = innerWidth < 760;

  /* ---------- Noise ---------- */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o = 5) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * noise(x * f, y * f); a *= .5; f *= 2.03; } return s; }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Cabin sits on a flat shelf at the origin; peaks rise in a ring around it, tallest to the north (-z).
  function height(x, z) {
    const d = Math.hypot(x, z);
    const hills = (fbm(x * .02, z * .02) - .5) * 14 * smooth(8, 40, d);
    const ridge = Math.pow(1 - Math.abs(fbm(x * .008 + 7, z * .008 + 3) * 2 - 1), 2.2);
    const north = 1 + smooth(0, -200, z) * .7;
    const mountains = smooth(60, 190, d) * (ridge * 150 + fbm(x * .03, z * .03) * 30) * north;
    return hills + mountains;
  }

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const NIGHT = new THREE.Color('#0a1324');
  scene.background = NIGHT;
  scene.fog = new THREE.FogExp2(NIGHT, .0042);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 1500);

  /* ---------- Light ---------- */
  scene.add(new THREE.HemisphereLight('#7891c0', '#1a2438', 1.4));
  const moonLight = new THREE.DirectionalLight('#c4d4ff', 2.4);
  moonLight.position.set(-120, 160, -80);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  Object.assign(moonLight.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 500 });
  moonLight.shadow.bias = -.0008;
  scene.add(moonLight);

  /* ---------- Terrain ---------- */
  {
    const size = 700, seg = mobile ? 140 : 180;
    let g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
    g = g.toNonIndexed();
    g.computeVertexNormals();
    const n = g.attributes.normal, pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const snow = new THREE.Color('#e6eef8'), shade = new THREE.Color('#a9bbd4'), rock = new THREE.Color('#3b4862');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      if (ny < .62 && y > 6) c.copy(rock).lerp(shade, hash(i, 1) * .25);
      else c.copy(shade).lerp(snow, smooth(.6, .95, ny) * (.7 + hash(i, 2) * .3));
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .95 }));
    m.receiveShadow = true;
    scene.add(m);
  }

  /* ---------- Pines (instanced) ---------- */
  {
    const parts = [], caps = [];
    [[0, 1.6, 2.2], [1.3, 1.25, 1.9], [2.5, .9, 1.6]].forEach(([y, r, h]) => {
      parts.push(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2 + .5, 0));
      caps.push(new THREE.ConeGeometry(r * .62, h * .45, 7).translate(0, y + h * .78 + .5, 0));
    });
    parts.push(new THREE.CylinderGeometry(.18, .25, 1, 5).translate(0, .5, 0));
    const tree = mergeGeometries(parts), cap = mergeGeometries(caps);
    const count = mobile ? 500 : 1100;
    const trees = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ color: '#16302f', flatShading: true, roughness: 1 }), count);
    const snowCaps = new THREE.InstancedMesh(cap, new THREE.MeshStandardMaterial({ color: '#dfe8f4', flatShading: true, roughness: 1 }), count);
    trees.castShadow = snowCaps.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 20) {
      const a = Math.random() * Math.PI * 2, d = 9 + Math.pow(Math.random(), .7) * 150;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = height(x, z);
      const slope = Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y);
      if (y > 45 || slope > 1.4 || (Math.abs(x) < 7 && z > -4 && z < 30)) continue; // keep the cabin view clear
      const k = .7 + Math.random() * .9;
      m.compose(v.set(x, y - .3, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * 6.28), s.set(k, k * (.9 + Math.random() * .4), k));
      trees.setMatrixAt(placed, m); snowCaps.setMatrixAt(placed, m); placed++;
    }
    trees.count = snowCaps.count = placed;
    scene.add(trees, snowCaps);
  }

  /* ---------- Cabin ---------- */
  const cabin = new THREE.Group();
  {
    const wood = new THREE.MeshStandardMaterial({ color: '#4a3226', roughness: .9, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a1e18', roughness: 1 });
    const snowM = new THREE.MeshStandardMaterial({ color: '#eef4fb', roughness: .8, flatShading: true });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: '#ffa04a', emissiveIntensity: 5 });
    const add = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; cabin.add(o); return o; };

    add(new THREE.BoxGeometry(6, 3.2, 4.6), wood, 0, 1.6, 0);
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(6.08, .08, 4.68), dark, 0, .3 + i * .5, 0);
    // gable roof: a 3-sided prism
    const roof = new THREE.CylinderGeometry(3.25, 3.25, 7, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
    const r = add(roof, snowM, 0, 4.15, 0); r.scale.set(1, .62, 1.05);
    add(new THREE.BoxGeometry(.7, 2, .7), dark, 1.8, 5.2, -.6);
    add(new THREE.BoxGeometry(.8, .2, .8), snowM, 1.8, 6.25, -.6);
    // porch + door + windows (front faces +z, toward the camera)
    add(new THREE.BoxGeometry(7, .25, 1.8), wood, 0, .12, 3.1);
    const win = (x, y, w, h) => add(new THREE.PlaneGeometry(w, h), glow, x, y, 2.31);
    win(-1.9, 1.9, 1, .9); win(1.9, 1.9, 1, .9); win(0, 1.2, .9, 1.9);
    // side window
    const sw = add(new THREE.PlaneGeometry(1, .9), glow, 3.01, 1.9, 0); sw.rotation.y = Math.PI / 2;
    // snow drifts
    [[-3.4, 2.2, 1.4], [3.6, 1.5, 1.1], [-2.5, -2.8, 1.6], [3, -2.4, 1.3]].forEach(([x, z, k]) => {
      const d = add(new THREE.SphereGeometry(1, 8, 6), snowM, x, -.2, z); d.scale.set(k * 1.3, k * .5, k);
    });
    // lantern post
    add(new THREE.CylinderGeometry(.06, .06, 1.6, 6), dark, 2.6, .8, 4.2);
    add(new THREE.SphereGeometry(.18, 10, 8), glow, 2.6, 1.7, 4.2);

    const warm = new THREE.PointLight('#ff9c45', 60, 28, 2);
    warm.position.set(0, 2, 4.5);
    cabin.add(warm);
    const lantern = new THREE.PointLight('#ffb066', 12, 10, 2);
    lantern.position.set(2.6, 1.8, 4.2);
    cabin.add(lantern);

    cabin.position.set(0, height(0, 0) + .05, 0);
    cabin.rotation.y = .25;
    scene.add(cabin);
  }

  /* ---------- Moon + stars ---------- */
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff3dc' }));
  moon.position.set(-260, 230, -520);
  scene.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('#fff2d6'), transparent: true, opacity: .45, depthWrite: false, fog: false }));
  halo.scale.set(150, 150, 1); halo.position.copy(moon.position);
  scene.add(halo);
  moon.material.fog = false;

  {
    const n = 2500, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * .45;
      const r = 900;
      a.set([Math.cos(t) * Math.cos(ph) * r, Math.sin(ph) * r + 40, Math.sin(t) * Math.cos(ph) * r], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: .85 })));
  }

  /* ---------- Aurora ---------- */
  const aurora = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 300, 160, 1),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: .25 } },
      vertexShader: `uniform float uTime; varying vec2 vUv;
        void main(){ vUv=uv; vec3 p=position;
          p.z += sin(p.x*.012+uTime*.25)*40. + sin(p.x*.031-uTime*.4)*14.;
          p.y += sin(p.x*.02+uTime*.3)*8.;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform float uTime; uniform float uAmt; varying vec2 vUv;
        float h(float n){return fract(sin(n)*43758.5453);}
        float n1(float x){float i=floor(x),f=fract(x);return mix(h(i),h(i+1.),f*f*(3.-2.*f));}
        void main(){
          float bands = n1(vUv.x*38.+uTime*.6)*.6 + n1(vUv.x*90.-uTime)*.4;
          float fade = smoothstep(0.,.25,vUv.y)*smoothstep(1.,.35,vUv.y)*smoothstep(0.,.15,vUv.x)*smoothstep(1.,.85,vUv.x);
          vec3 col = mix(vec3(.1,1.,.6), vec3(.35,.4,1.), smoothstep(.3,1.,vUv.y));
          gl_FragColor = vec4(col, bands*fade*uAmt*.95);
        }`
    })
  );
  aurora.position.set(0, 280, -190); aurora.rotation.x = .55;
  scene.add(aurora);

  /* ---------- Snowfall ---------- */
  const SNOW_BOX = 70;
  const snowGeo = new THREE.BufferGeometry();
  const snowCount = mobile ? 2500 : 6000;
  {
    const a = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount * 3; i++) a[i] = (Math.random() - .5) * SNOW_BOX * 2;
    snowGeo.setAttribute('position', new THREE.BufferAttribute(a, 3));
  }
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: .32, map: radial('#ffffff'), transparent: true, depthWrite: false, opacity: .9 }));
  scene.add(snow);
  const snowSpeed = new Float32Array(snowCount).map(() => 2 + Math.random() * 3);

  /* ---------- Chimney smoke ---------- */
  const smokeN = 40, smokeGeo = new THREE.BufferGeometry(), smokeLife = new Float32Array(smokeN).map(() => Math.random());
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(smokeN * 3), 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 2.4, map: radial('#cfd8e6'), transparent: true, opacity: .22, depthWrite: false }));
  scene.add(smoke);
  const chimney = new THREE.Vector3(1.8, 6.4, -.6).applyEuler(new THREE.Euler(0, .25, 0)).add(cabin.position);

  function radial(color) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(.4, color + '88'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /* ---------- Camera path (scroll) ---------- */
  const camPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-40, 150, 330),
    new THREE.Vector3(70, 95, 210),
    new THREE.Vector3(55, 40, 95),
    new THREE.Vector3(18, 12, 34),
    new THREE.Vector3(7, 4.5, 17),
    new THREE.Vector3(-16, 6, 30),
  ]);
  const lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 60, -120),
    new THREE.Vector3(0, 30, -40),
    new THREE.Vector3(0, 8, 0),
    new THREE.Vector3(0, 3, 0),
    new THREE.Vector3(0, 3.5, 0),
    new THREE.Vector3(0, 420, -170),
  ]);

  /* ---------- Post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .75, .7, .82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  /* ---------- Overlay text driven by progress ---------- */
  const title = document.getElementById('worldTitle');
  const caps = [...document.querySelectorAll('.w-cap')];
  const bar = document.getElementById('worldBar');
  const hint = document.querySelector('.scroll-hint');

  let mx = 0, my = 0, cmx = 0, cmy = 0, prog = 0;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });

  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  let visible = true;
  new IO(([e]) => visible = e.isIntersecting).observe(section);

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const raw = clock.getDelta(), dt = Math.min(raw, .05), t = clock.elapsedTime;

    const r = section.getBoundingClientRect();
    const target = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    prog += (target - prog) * (reduce ? 1 : 1 - Math.exp(-Math.min(raw, .5) * 3.5));

    const k = 1 - Math.exp(-Math.min(raw, .5) * 2.5); cmx += (mx - cmx) * k; cmy += (my - cmy) * k;
    camPath.getPoint(prog, camPos); lookPath.getPoint(prog, look);
    const sway = 1 - prog * .6;
    camera.position.set(camPos.x + cmx * 6 * sway, camPos.y - cmy * 3 * sway, camPos.z);
    camera.lookAt(look);

    // overlay
    title.style.opacity = 1 - smooth(.02, .14, prog);
    title.style.transform = `translate3d(0, ${-prog * 300}px, 0) scale(${1 + prog * .6})`;
    hint.style.opacity = 1 - smooth(0, .05, prog);
    caps.forEach(c => { const a = +c.dataset.from, b = +c.dataset.to; c.classList.toggle('on', prog > a && prog < b); });
    bar.style.transform = `scaleX(${prog})`;

    // aurora grows as the camera tilts up
    aurora.material.uniforms.uTime.value = t;
    aurora.material.uniforms.uAmt.value = .25 + smooth(.7, .97, prog) * 1.1;

    // snow follows the camera
    if (!reduce) {
      const sp = snowGeo.attributes.position.array, wind = Math.sin(t * .3) * .8 + cmx * 3;
      for (let i = 0; i < snowCount; i++) {
        const j = i * 3;
        sp[j + 1] -= snowSpeed[i] * dt;
        sp[j] += (wind + Math.sin(t + i) * .3) * dt;
        if (sp[j + 1] < -SNOW_BOX) sp[j + 1] += SNOW_BOX * 2;
        if (sp[j] > SNOW_BOX) sp[j] -= SNOW_BOX * 2; else if (sp[j] < -SNOW_BOX) sp[j] += SNOW_BOX * 2;
      }
      snowGeo.attributes.position.needsUpdate = true;

      const pp = smokeGeo.attributes.position.array;
      for (let i = 0; i < smokeN; i++) {
        smokeLife[i] += dt * .18;
        if (smokeLife[i] > 1) smokeLife[i] -= 1;
        const l = smokeLife[i];
        pp.set([chimney.x + Math.sin(l * 6 + i) * l * 1.2 + l * 3, chimney.y + l * 12, chimney.z + Math.cos(l * 5 + i) * l], i * 3);
      }
      smokeGeo.attributes.position.needsUpdate = true;
    }
    snow.position.copy(camera.position);

    composer.render();
  }

  frame();
  window.dispatchEvent(new Event('world-ready'));


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
  };
}
