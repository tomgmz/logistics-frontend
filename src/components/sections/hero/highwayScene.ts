import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Hero background: a divided expressway at night seen from the cab. Traffic is
 * drawn as long-exposure light trails (cyan headlights coming, warm tail
 * lights going), street lights and lane markings stream past, the road winds.
 *
 * Interaction: the camera leans toward the pointer; pressing and holding
 * (mouse or finger) accelerates: trails stretch and the view widens.
 *
 * Everything moves in the vertex shaders from one `uTravel` distance, so the
 * CPU work per frame is a handful of uniforms. Pauses off screen / in a hidden
 * tab; reduced motion = one still frame, no interaction.
 */

export type HighwayOptions = {
  container: HTMLElement;
  eventTarget: HTMLElement;
  reducedMotion: boolean;
  onAccelerate?: () => void; // first time the visitor holds to accelerate
};

const L = 420; // visible road length
const WRAP = L * 100; // 42000: divisible by 14 and 7 (dashes, studs)
const W = 26; // total width: two 11-wide roadways and a 4-wide median
const AMP = new THREE.Vector2(26, 5);

// The road's bend, shared by every shader (GLSL) and the camera (JS).
const BEND_GLSL = /* glsl */ `
uniform float uTime;
uniform float uLen;
uniform vec2  uAmp;
vec3 bend(float z) {
  float p = clamp(-z / uLen, 0.0, 1.0);
  float k = p * p;
  return vec3((sin(p * 3.0 + uTime * 0.21) * 0.5 + sin(p * 1.4 - uTime * 0.13)) * uAmp.x * k,
              sin(p * 2.6 + uTime * 0.17) * uAmp.y * k,
              0.0);
}`;
function bendJS(z: number, t: number) {
  const p = Math.min(1, Math.max(0, -z / L));
  const k = p * p;
  return {
    x: (Math.sin(p * 3 + t * 0.21) * 0.5 + Math.sin(p * 1.4 - t * 0.13)) * AMP.x * k,
    y: Math.sin(p * 2.6 + t * 0.17) * AMP.y * k,
  };
}

// Lane centres: each roadway runs from |x| = 2 to 12.9, three lanes wide.
const LANES_AWAY = [-3.85, -7.5, -11.1]; // our roadway (left)
const LANES_ONCOMING = [3.85, 7.5, 11.1]; // oncoming (right)

export function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createHighway(opts: HighwayOptions): { dispose: () => void } {
  const { container, eventTarget } = opts;
  let reduced = opts.reducedMotion;
  const narrow = () => container.clientWidth < 640;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  // #0a0a0a, given in linear so the bloom path (linear target + sRGB output) lands on the page colour.
  renderer.setClearColor(new THREE.Color().setRGB(0.003, 0.003, 0.003, THREE.LinearSRGBColorSpace), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

  const shared = {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uLen: { value: L },
    uAmp: { value: AMP },
    uTrail: { value: 1 },
  };
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  // ---- sky ----------------------------------------------------------------------
  // Drawn as geometry, not left to the clear colour: the bloom pass lifts an
  // empty background to grey. Near-black with a faint teal haze at the horizon.
  const skyGeo = keep(new THREE.PlaneGeometry(2, 2));
  const skyMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uLinear: { value: lowPower ? 0 : 1 }, uHorizon: { value: 0.5 } },
      depthWrite: false,
      depthTest: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uLinear, uHorizon;
        varying vec2 vUv;
        void main() {
          float d = abs(vUv.y - uHorizon);
          vec3 col = mix(vec3(0.02, 0.03, 0.04), vec3(0.03, 0.045, 0.06), smoothstep(0.9, 0.3, vUv.y));
          col += vec3(0.02, 0.15, 0.16) * exp(-d * d * 45.0);
          gl_FragColor = vec4(uLinear > 0.5 ? pow(col, vec3(2.2)) : col, 1.0);
        }`,
    }),
  );
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- road ---------------------------------------------------------------------
  const roadGeo = keep(new THREE.PlaneGeometry(W, L, 1, 240));
  roadGeo.rotateX(-Math.PI / 2);
  roadGeo.translate(0, 0, -L / 2);
  const roadMat = keep(
    new THREE.ShaderMaterial({
      // Colours below are written in sRGB; the bloom path renders in linear
      // and converts on output, so convert them first there (uLinear = 1).
      uniforms: { ...shared, uW: { value: W }, uLinear: { value: lowPower ? 0 : 1 } },
      vertexShader: /* glsl */ `
        ${BEND_GLSL}
        varying vec2 vXZ;
        void main() {
          vec3 p = position;
          vXZ = p.xz;
          p += bend(p.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTravel, uLen, uLinear;
        varying vec2 vXZ;
        float band(float x, float c, float w) { return 1.0 - smoothstep(w, w + 0.06, abs(x - c)); }
        void main() {
          float x = vXZ.x;
          float z = vXZ.y;
          float s = z + uTravel;                       // scrolls toward the camera as we drive
          float dash = step(fract(s / 14.0), 0.42);
          vec3 asphalt = vec3(0.04, 0.06, 0.075);
          vec3 median  = vec3(0.025, 0.04, 0.05);
          vec3 col = abs(x) < 2.0 ? median : asphalt;
          float lines = 0.0;
          // lane separators (dashed)
          lines += dash * (band(x, -5.67, 0.07) + band(x, -9.33, 0.07) + band(x, 5.67, 0.07) + band(x, 9.33, 0.07));
          // edge lines (solid)
          lines += band(x, -2.0, 0.06) + band(x, 2.0, 0.06) + band(x, -12.9, 0.06) + band(x, 12.9, 0.06);
          col = mix(col, vec3(0.5, 0.78, 0.8), clamp(lines, 0.0, 1.0) * 0.2);
          // reflective studs on the median, every 7 units
          float stud = band(x, -2.35, 0.05) * step(fract(s / 7.0), 0.06);
          col += vec3(0.3, 0.98, 0.93) * stud * 0.6;
          // distance haze
          float d = clamp(-z / uLen, 0.0, 1.0);
          col = mix(col, vec3(0.04, 0.12, 0.13), smoothstep(0.2, 0.9, d));
          gl_FragColor = vec4(uLinear > 0.5 ? pow(col, vec3(2.2)) : col, 1.0);
        }`,
    }),
  );
  scene.add(new THREE.Mesh(roadGeo, roadMat));

  // ---- light trails ---------------------------------------------------------------
  // A capsule-ish cylinder along +z from 0..1; instances place, size and move it.
  const base = keep(new THREE.CylinderGeometry(1, 1, 1, 8, 1, false));
  base.rotateX(Math.PI / 2);
  base.translate(0, 0, 0.5);

  const lightVert = /* glsl */ `
    ${BEND_GLSL}
    uniform float uTravel, uTrail, uDir, uMirror;
    attribute vec3 aOffset;   // x, y, z0
    attribute vec3 aMetrics;  // radius, length, relative speed
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlong;
    varying float vFade;
    void main() {
      vec3 p = position;
      float len = aMetrics.y * uTrail;
      p.xy *= aMetrics.x;
      vAlong = p.z;                                 // 0 at the lamp, 1 at the end of its trail
      float zc = mod(aOffset.z + uTravel * aMetrics.z, uLen);
      float zh = uDir > 0.0 ? -zc : -uLen + zc;     // away: recedes; oncoming / roadside: approaches
      float z = zh + (uDir > 0.0 ? p.z * len : -p.z * len);
      vec3 w = vec3(aOffset.x + p.x, aOffset.y + p.y, z);
      if (uMirror > 0.5) { w.y = -w.y * 0.6; w.x += p.x * 0.8; }   // reflection: flipped, softened, a little wider
      w += bend(z);
      vColor = aColor;
      vFade = smoothstep(uLen, uLen * 0.55, -zh) * smoothstep(0.0, 18.0, -zh);
      if (uMirror > 0.5) vFade *= smoothstep(14.0, 70.0, -zh);   // reflections only in the distance
      gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
    }`;
  const lightFrag = /* glsl */ `
    uniform float uGain;
    varying vec3 vColor;
    varying float vAlong;
    varying float vFade;
    void main() {
      float a = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.6) * vFade;
      gl_FragColor = vec4(vColor * a * uGain, a);
    }`;

  type Group = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial };
  const groups: Group[] = [];

  function lights(
    count: number,
    dir: 1 | -1,
    place: (i: number) => { x: number; y: number; r: number; len: number; speed: number; color: THREE.Color; pair: number },
    gain: number,
  ) {
    const geo = keep(new THREE.InstancedBufferGeometry());
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const off: number[] = [], met: number[] = [], col: number[] = [];
    for (let i = 0; i < count; i++) {
      const c = place(i);
      const z0 = Math.random() * L;
      const xs = c.pair ? [-c.pair, c.pair] : [0];
      for (const dx of xs) {
        off.push(c.x + dx, c.y, z0);
        // Speeds on a 0.01 grid, so every light repeats within WRAP (see frame()).
        met.push(c.r, c.len, Math.round(c.speed * 100) / 100);
        col.push(c.color.r, c.color.g, c.color.b);
      }
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(off), 3));
    geo.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(met), 3));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(col), 3));
    geo.instanceCount = off.length / 3;
    const make = (mirror: boolean) => {
      const mat = keep(
        new THREE.ShaderMaterial({
          uniforms: { ...shared, uDir: { value: dir }, uGain: { value: mirror ? gain * 0.16 : gain }, uMirror: { value: mirror ? 1 : 0 } },
          vertexShader: lightVert,
          fragmentShader: lightFrag,
          transparent: true,
          depthWrite: false,
          // The reflection sits under the road surface; draw it over the road.
          depthTest: !mirror,
          blending: THREE.AdditiveBlending,
        }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = mirror ? 1 : 2;
      scene.add(mesh);
      groups.push({ mesh, mat });
    };
    make(true);
    make(false);
  }

  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const TAIL = [new THREE.Color('#F62626'), new THREE.Color('#FF7A30'), new THREE.Color('#ff3b2f')];
  const HEAD = [new THREE.Color('#4DF9ED'), new THREE.Color('#dffcff'), new THREE.Color('#4DF9ED')];
  const gain = lowPower ? 1.6 : 1.15;
  const scaleCount = narrow() ? 0.6 : 1;

  // Our direction: tail lights pulling away.
  lights(Math.round(44 * scaleCount), 1, () => ({
    x: pick(LANES_AWAY), y: 1.0, r: 0.13 + Math.random() * 0.05, len: 10 + Math.random() * 14,
    speed: 0.12 + Math.random() * 0.35, color: pick(TAIL), pair: 0.78,
  }), gain);
  // Oncoming: headlights.
  lights(Math.round(56 * scaleCount), -1, () => ({
    x: pick(LANES_ONCOMING), y: 0.9, r: 0.12 + Math.random() * 0.05, len: 14 + Math.random() * 20,
    speed: 1.6 + Math.random() * 0.9, color: pick(HEAD), pair: 0.78,
  }), gain);
  // Street lights over both edges and the median: stationary, so they pass at our speed.
  const poles = [-14.2, 14.2, -0.6];
  lights(Math.round(60 * scaleCount), -1, (i) => ({
    x: poles[i % 3], y: 9 + Math.random() * 0.4, r: 0.1, len: 3.2, speed: 1, color: new THREE.Color('#7ff5ec'), pair: 0,
  }), gain * 0.55);

  // ---- post: bloom ---------------------------------------------------------------
  const useBloom = !lowPower;
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (useBloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.22, 0.5);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---- layout ---------------------------------------------------------------------
  let w = 1, h = 1, shift = 0;
  function resize() {
    const r = container.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, narrow() ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(dpr);
    composer?.setSize(w, h);
    bloom?.resolution.set(Math.round((w * dpr) / 2), Math.round((h * dpr) / 2));
    camera.aspect = w / h;
    // Desktop: vanishing point right of centre, so the copy sits over dark road.
    shift = w >= 1024 ? 0.16 : w >= 640 ? 0.1 : 0;
    camera.setViewOffset(w, h, -shift * w, 0, w, h);
    camera.updateProjectionMatrix();
  }
  resize();

  // ---- interaction -------------------------------------------------------------------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let holding = false;
  let told = false;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = eventTarget.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element | null)?.closest('a, button, input, textarea, nav')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holding = true;
    if (!told) { told = true; opts.onAccelerate?.(); }
  };
  const onUp = () => { holding = false; };
  const onLeave = () => { holding = false; pointer.tx = 0; pointer.ty = 0; };

  // ---- frame -------------------------------------------------------------------------
  const BASE = 42, FAST = 175;
  let speed = BASE;
  let time = 0, travel = 600;
  const look = new THREE.Vector3();

  function frame(dt: number) {
    time += dt;
    speed += ((holding ? FAST : BASE) - speed) * Math.min(1, dt * (holding ? 1.6 : 1.1));
    travel += speed * dt;
    const k = (speed - BASE) / (FAST - BASE); // 0..1 acceleration

    shared.uTime.value = time;
    // The shaders get the distance wrapped, or float precision makes the trails
    // jitter after a few hours. WRAP = 100 road lengths: a multiple of L (and so of
    // every light's loop, speeds being on a 0.01 grid) and of the 14 / 7 unit
    // lane-dash and stud spacing, so the wrap is invisible.
    shared.uTravel.value = travel % WRAP;
    shared.uTrail.value = 1 + k * 1.6;

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.2);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.2);

    const camX = -4.6 + pointer.x * 2.2;
    const camY = 5.2 - pointer.y * 1.2 + k * -0.6;
    camera.position.set(camX, camY, 4);
    const ahead = -70;
    const b = bendJS(ahead, time);
    look.set(-2 + b.x * 0.9 + pointer.x * 6, 1.4 + b.y, ahead);
    camera.lookAt(look);
    // Slight roll into the bend.
    const b2 = bendJS(-40, time);
    camera.rotateZ(-b2.x * 0.004);

    const fov = 58 + k * 26;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (bloom) bloom.strength = 0.75 + k * 0.4;

    const hz = new THREE.Vector3(look.x, look.y, -L * 0.9).project(camera);
    skyMat.uniforms.uHorizon.value = (hz.y + 1) / 2;

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  // ---- lifecycle ---------------------------------------------------------------------
  let raf = 0, last = 0, visible = true;
  const loop = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    frame(dt);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (raf || reduced || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const still = () => frame(0);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); if (reduced) still(); }) : null;
  ro?.observe(container);
  const onResize = () => { resize(); if (reduced) still(); };
  if (!ro) window.addEventListener('resize', onResize);
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); else stop(); })
    : null;
  io?.observe(container);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onReduce = () => {
    reduced = mq.matches;
    holding = false;
    if (reduced) { stop(); still(); } else start();
  };
  if (mq.addEventListener) mq.addEventListener('change', onReduce);
  else mq.addListener(onReduce);

  eventTarget.addEventListener('pointermove', onMove);
  eventTarget.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  eventTarget.addEventListener('pointercancel', onUp);
  eventTarget.addEventListener('pointerleave', onLeave);
  const onLost = (e: Event) => { e.preventDefault(); stop(); };
  renderer.domElement.addEventListener('webglcontextlost', onLost);

  still();
  start();

  return {
    dispose() {
      stop();
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      if (mq.removeEventListener) mq.removeEventListener('change', onReduce);
      else mq.removeListener(onReduce);
      eventTarget.removeEventListener('pointermove', onMove);
      eventTarget.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      eventTarget.removeEventListener('pointercancel', onUp);
      eventTarget.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      groups.forEach((g) => scene.remove(g.mesh));
      disposables.forEach((d) => d.dispose());
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
