/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// ── Asset URLs ─────────────────────────────────────────────────────────────
const IMG_AIRSPEED         = "https://www.figma.com/api/mcp/asset/150e7b45-2f77-4deb-8da2-cb4d7540c490";
const IMG_SHOPEE           = "https://www.figma.com/api/mcp/asset/6794ce15-04bf-40bd-afd4-dd8cab8992b6";
const IMG_LAZADA           = "https://www.figma.com/api/mcp/asset/158a5192-6f5b-4cbb-85fb-b0fa241e5c25";
const IMG_SHEIN            = "https://www.figma.com/api/mcp/asset/5a91dbc5-4eca-4506-9b9a-7154879d3b66";
const IMG_TEMU             = "https://www.figma.com/api/mcp/asset/466235da-bb99-4b82-af44-543b11c40f84";
const IMG_CARGO_TRUCK      = "https://www.figma.com/api/mcp/asset/cfdf7e2c-767e-4e5e-be9c-a41e3b771c9f";
const IMG_L300_VAN         = "https://www.figma.com/api/mcp/asset/3bf08461-8cbc-421d-8199-7df46bede4d2";
const IMG_SERVICE_CARGO    = "https://www.figma.com/api/mcp/asset/f9c326e2-679a-4e4a-a6bf-27e4fdcd3572";
const IMG_SERVICE_DELIVERY = "https://www.figma.com/api/mcp/asset/5028c799-f61d-4b23-9340-1ab24574bf46";
const IMG_SERVICE_TRACKING = "https://www.figma.com/api/mcp/asset/596c746d-315b-4659-b666-9b853ffc6032";
const IMG_METRICS_BG       = "https://www.figma.com/api/mcp/asset/792d0ff9-e769-4b59-9df6-813aad2a761c";

// ── Static data ────────────────────────────────────────────────────────────
const BRAND_LOGOS = [
  { src: IMG_AIRSPEED, alt: "Airspeed", h: 32 },
  { src: IMG_SHOPEE,   alt: "Shopee",   h: 52 },
  { src: IMG_LAZADA,   alt: "Lazada",   h: 40 },
  { src: IMG_SHEIN,    alt: "Shein",    h: 36 },
  { src: IMG_TEMU,     alt: "Temu",     h: 56 },
];

const CAROUSEL_WORDS = [
  { text: "PERFORMANCE", color: "#4df9ed" },
  { text: "EFFICIENCY",  color: "#3af626" },
  { text: "FAST",        color: "#8a38f5" },
  { text: "MOVING",      color: "#f62626" },
  { text: "CARGO",       color: "#ffea00" },
  { text: "GOODS",       color: "#ff7a30" },
];

const SERVICES = [
  { image: IMG_SERVICE_CARGO,    title: "Nationwide cargo movement" },
  { image: IMG_SERVICE_DELIVERY, title: "Smart delivery scheduling" },
  { image: IMG_SERVICE_TRACKING, title: "Real-time delivery visibility" },
  { image: IMG_SERVICE_DELIVERY, title: "Complete delivery records" },
];

const METRICS = [
  { value: "90",   suffix: "%",    label: "On-time delivery rate",    decimal: false },
  { value: "24",   suffix: "/7",   label: "Live tracking available",  decimal: false },
  { value: "500",  suffix: "K+",   label: "Shipments managed",        decimal: false },
  { value: "4.9",  suffix: "/5",   label: "Client rating",            decimal: true  },
  { value: "15",   suffix: " min", label: "Avg. support response",    decimal: false },
  { value: "99.5", suffix: "%",    label: "Transaction success rate", decimal: true  },
];

const FAQS = [
  { q: "How do I book a delivery?",             a: "You can book a delivery through our platform by selecting your pickup and drop-off locations, choosing a vehicle type, and confirming your order. Booking takes under 2 minutes." },
  { q: "Can I track my shipment in real-time?", a: "Yes! Our platform provides 24/7 live tracking for all active shipments so you always know where your cargo is, down to the minute." },
  { q: "What areas do you cover?",              a: "We operate nationwide, covering major cities and provincial areas across the Philippines with our extensive fleet." },
  { q: "How do I become a partner?",            a: "Click 'Be Our Partner' and fill out the contact form. Our team will reach out within 15 minutes during business hours." },
];

// ── Global CSS ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Aboreto&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: #0a0a0a; overflow-x: hidden; }
  input, textarea { font-family: 'Aboreto', serif; }
  input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.3); }

  @keyframes heroFadeUp {
    from { opacity: 0; transform: translateY(40px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .hero-tag   { animation: heroFadeUp 0.7s ease 0.3s both; }
  .hero-h1    { animation: heroFadeUp 0.7s ease 0.55s both; }
  .hero-body  { animation: heroFadeUp 0.7s ease 0.8s both; }
  .hero-btns  { animation: heroFadeUp 0.7s ease 1.0s both; }
  .hero-stats { animation: heroFadeUp 0.7s ease 1.2s both; }

  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
  .eyebrow-dot { animation: blink 2s infinite; }
  .tc-dot      { animation: blink 1.8s infinite; }

  @keyframes shine {
    from { background-position: 0% center; }
    to   { background-position: 200% center; }
  }
  .shine-text {
    background: linear-gradient(135deg, #4df9ed 0%, #a5f3fc 50%, #4df9ed 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: shine 4s linear infinite;
  }

  @keyframes wordSlideUp {
    0%   { opacity: 0; transform: translateY(100%); }
    12%  { opacity: 1; transform: translateY(0); }
    80%  { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-100%); }
  }

  @keyframes marquee        { from{transform:translateX(0)}    to{transform:translateX(-50%)} }
  @keyframes marqueeReverse { from{transform:translateX(-50%)} to{transform:translateX(0)}    }
  .marquee-fwd { animation: marquee        22s linear infinite; }
  .marquee-rev { animation: marqueeReverse 22s linear infinite; }

  .reveal         { opacity:0; transform:translateY(48px); transition:opacity .75s ease,transform .75s ease; }
  .reveal.visible { opacity:1; transform:translateY(0); }
  .reveal-left          { opacity:0; transform:translateX(-60px); transition:opacity .75s ease,transform .75s ease; }
  .reveal-left.visible  { opacity:1; transform:translateX(0); }
  .reveal-right         { opacity:0; transform:translateX(60px);  transition:opacity .75s ease,transform .75s ease; }
  .reveal-right.visible { opacity:1; transform:translateX(0); }

  .delay-1 { transition-delay:.10s; }
  .delay-2 { transition-delay:.20s; }
  .delay-3 { transition-delay:.32s; }
  .delay-4 { transition-delay:.46s; }

  .metric-card { transition:transform .25s ease,box-shadow .25s ease; }
  .metric-card:hover { transform:translateY(-6px) scale(1.02); box-shadow:0 12px 32px rgba(0,0,0,.4) !important; }

  .svc-card { transition:transform .28s ease,box-shadow .28s ease; cursor:default; }
  .svc-card:hover { transform:translateY(-8px); box-shadow:0 20px 40px rgba(0,0,0,.5); }
  .svc-card .svc-img img { transition:transform .45s ease; }
  .svc-card:hover .svc-img img { transform:scale(1.06); }

  .btn-press { transition:transform .12s ease,opacity .15s ease; }
  .btn-press:active { transform:scale(.96); }

  .faq-chevron { transition:transform .3s ease; display:inline-block; }
  .faq-chevron.open { transform:rotate(45deg); }
  .faq-answer { overflow:hidden; max-height:0; opacity:0; transition:max-height .38s ease,opacity .28s ease; }
  .faq-answer.open { max-height:200px; opacity:1; }

  .nav-link { position:relative; }
  .nav-link::after { content:''; position:absolute; left:0; bottom:-3px; width:0; height:1px; background:#4df9ed; transition:width .25s ease; }
  .nav-link:hover::after { width:100%; }

  .tc-bar { height:3px; border-radius:2px; background:linear-gradient(90deg,#2563eb,#60a5fa); position:relative; transition:width .8s ease; }
  .tc-bar::after { content:''; position:absolute; right:-1px; top:-3.5px; width:10px; height:10px; border-radius:50%; background:#60a5fa; box-shadow:0 0 10px rgba(37,99,235,.6); }
`;

// ── Hooks ──────────────────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function useCountUp(target: number, duration = 1800, run = false, decimal = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!run) return;
    const steps = 60, inc = target / steps; let cur = 0;
    const id = setInterval(() => {
      cur += inc;
      if (cur >= target) { setCount(target); clearInterval(id); }
      else setCount(decimal ? Math.round(cur * 10) / 10 : Math.floor(cur));
    }, duration / steps);
    return () => clearInterval(id);
  }, [run, target, duration, decimal]);
  return count;
}

function Reveal({ children, className = "reveal", style = {} }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const { ref, visible } = useInView();
  return <div ref={ref} className={`${className}${visible ? " visible" : ""}`} style={style}>{children}</div>;
}

// ── Navbar ─────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 6%", height:70, background: scrolled ? "rgba(10,10,10,0.96)" : "rgba(10,10,10,0.4)", backdropFilter:"blur(14px)", borderBottom:"1px solid rgba(255,255,255,0.06)", transition:"background .35s ease" }}>
      <span style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:20, letterSpacing:"0.04em" }}>
        LOGIS<span style={{ color:"#4df9ed" }}>TICS</span>
      </span>
      <div style={{ display:"flex", gap:40 }}>
        {["Services","Partners","Metrics","FAQs"].map((item) => (
          <a key={item} href={`#${item.toLowerCase()}`} className="nav-link"
            style={{ fontFamily:"'Aboreto',serif", color:"rgba(255,255,255,0.6)", fontSize:14, textDecoration:"none", letterSpacing:"0.08em", transition:"color .2s" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#fff")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)")}>
            {item}
          </a>
        ))}
      </div>
      <button className="btn-press" style={{ fontFamily:"'Aboreto',serif", background:"#fff", color:"#0a0a0a", border:"none", borderRadius:10, padding:"10px 24px", fontSize:14, cursor:"pointer", letterSpacing:"0.06em" }}>
        Sign In
      </button>
    </nav>
  );
}

// ── Three.js Hero ──────────────────────────────────────────────────────────
function HeroSection() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.onload = initScene;
    document.head.appendChild(script);
    return () => {
      cleanupRef.current?.();
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  function initScene() {
    const T = (window as any).THREE;
    if (!T || !canvasRef.current || !sectionRef.current) return;
    const canvas = canvasRef.current, heroEl = sectionRef.current;
    let rafId: number;

    const renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a0a, 1);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new T.Scene();
    scene.fog = new T.FogExp2(0x0a0a0a, 0.017);
    const camera = new T.PerspectiveCamera(42, 1, 0.1, 500);
    camera.position.set(4, 28, -6); camera.lookAt(4, 0, -20);

    function setSize() {
      const w = heroEl.offsetWidth, h = heroEl.offsetHeight;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    setSize(); window.addEventListener("resize", setSize);

    // Lights
    scene.add(new T.AmbientLight(0x222222, 1.5));
    const sun = new T.DirectionalLight(0xffffff, 2.0);
    sun.position.set(20, 35, 20); sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    Object.assign(sun.shadow.camera, { left:-30, right:30, top:30, bottom:-30, near:0.1, far:120 });
    sun.shadow.bias = -0.0005; scene.add(sun);
    const fill = new T.DirectionalLight(0x111111, 0.8); fill.position.set(-15, 10, -10); scene.add(fill);
    const destPtLight = new T.PointLight(0x22c55e, 8, 12); destPtLight.position.set(14, 5, 26); scene.add(destPtLight);
    const truckPtLight = new T.PointLight(0x3b82f6, 4, 8); scene.add(truckPtLight);

    // Ground
    const gnd = new T.Mesh(new T.PlaneGeometry(120,120), new T.MeshStandardMaterial({ color:0x0a0a0a, roughness:1, metalness:0 }));
    gnd.rotation.x = -Math.PI/2; gnd.receiveShadow = true; scene.add(gnd);

    // Material / geometry helpers
    function M(col: number, rough = 0.7, metal = 0.1, emCol?: number, emInt = 1) {
      const m = new T.MeshStandardMaterial({ color:col, roughness:rough, metalness:metal });
      if (emCol !== undefined) { m.emissive = new T.Color(emCol); m.emissiveIntensity = emInt; }
      return m;
    }
    function B(p: any, w: number, h: number, d: number, mat: any, x=0, y=0, z=0, rx?: number, ry?: number, rz?: number) {
      const mesh = new T.Mesh(new T.BoxGeometry(w,h,d), mat);
      mesh.position.set(x,y,z);
      if (rx) mesh.rotation.x = rx; if (ry) mesh.rotation.y = ry; if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true; mesh.receiveShadow = true; p.add(mesh); return mesh;
    }
    function CYL(p: any, rt: number, rb: number, h: number, segs: number, mat: any, x=0, y=0, z=0, rx?: number, rz?: number) {
      const mesh = new T.Mesh(new T.CylinderGeometry(rt,rb,h,segs), mat);
      mesh.position.set(x,y,z);
      if (rx) mesh.rotation.x = rx; if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true; p.add(mesh); return mesh;
    }

    // Wheel builder
    function buildWheel(px: number, pz: number, parent: any, dual?: number) {
      const mRubber = M(0x0e1520,0.95,0), mRim = M(0x2a4060,0.3,0.75), mChrome = M(0xb0c4d8,0.2,0.9);
      function one(ox: number) {
        const wg = new T.Group();
        const tire = new T.Mesh(new T.TorusGeometry(0.38,0.145,14,30), mRubber);
        tire.rotation.y = Math.PI/2; wg.add(tire);
        CYL(wg,0.3,0.3,0.14,16,mRim,0,0,0,0,Math.PI/2);
        CYL(wg,0.11,0.11,0.16,10,mChrome,0,0,0,0,Math.PI/2);
        for (let s=0; s<6; s++) {
          const sa = (s/6)*Math.PI*2;
          const sp = new T.Mesh(new T.BoxGeometry(0.12,0.04,0.16), mRim);
          sp.position.set(0, Math.cos(sa)*0.19, Math.sin(sa)*0.19); wg.add(sp);
        }
        for (let lu=0; lu<8; lu++) {
          const la = (lu/8)*Math.PI*2;
          const lg = new T.Mesh(new T.CylinderGeometry(0.028,0.028,0.07,6), mChrome);
          lg.rotation.z = Math.PI/2; lg.position.set(0.09, Math.cos(la)*0.2, Math.sin(la)*0.2); wg.add(lg);
        }
        wg.position.set(ox, 0.38, 0); wg.castShadow = true; return wg;
      }
      const w1 = one(px); w1.position.z = pz; parent.add(w1);
      if (dual) { const w2 = one(px + (px < 0 ? -dual : dual)); w2.position.z = pz; parent.add(w2); }
    }

    // Build truck
    const root = new T.Group();
    const mCab = M(0x1b1b1b,0.4,0.35), mCabL = M(0x222222,0.4,0.3), mChr = M(0xb0c4d8,0.2,0.9);
    const mDk = M(0x080f1a,0.9,0.05);
    const mGl = M(0x446688,0.1,0.5,0x2266aa,0.5); mGl.transparent = true; mGl.opacity = 0.72;
    const mEx = M(0x8899aa,0.25,0.85), mRoofL = M(0xffaa00,0.2,0.1,0xffaa00,4);
    const mAmb = M(0xffcc44,0.2,0.1,0xffcc44,4), mRed = M(0xff2200,0.2,0.1,0xff2200,3);
    const mGrille = M(0x0e1e2e,0.7,0.5), mStr = M(0x2563eb,0.5,0.1,0x2563eb,0.5), mWh = M(0xeef6ff,0.6,0.05);
    const mTrl = M(0x1b1b1b,0.6,0.12);

    const cab = new T.Group(); root.add(cab);
    B(cab,2.1,1.65,2.3,mCab,0,1.02,-0.85); B(cab,2.0,0.6,1.15,mCabL,0,2.12,0.42);
    const fb = new T.Mesh(new T.BoxGeometry(2.05,0.55,1.55),mCabL); fb.position.set(0,1.88,-1.05); cab.add(fb);
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(new Float32Array([-1.025,1.95,-1.8,1.025,1.95,-1.8,1.025,2.35,-1.0,-1.025,1.95,-1.8,1.025,2.35,-1.0,-1.025,2.35,-1.0,-1.025,2.35,-1.0,1.025,2.35,-1.0,1.025,2.38,0.0,-1.025,2.35,-1.0,1.025,2.38,0.0,-1.025,2.38,0.0]),3));
    sg.computeVertexNormals(); cab.add(new T.Mesh(sg,mCabL));
    B(cab,2.1,1.55,0.06,mCabL,0,0.97,-2.02);
    const wsg = new T.BufferGeometry();
    wsg.setAttribute("position", new T.BufferAttribute(new Float32Array([-0.88,1.82,-2.0,0.88,1.82,-2.0,0.88,2.72,-1.5,-0.88,1.82,-2.0,0.88,2.72,-1.5,-0.88,2.72,-1.5]),3));
    wsg.computeVertexNormals(); cab.add(new T.Mesh(wsg,mGl));
    B(cab,0.05,0.52,0.82,mGl,-1.06,2.08,-1.4); B(cab,0.05,0.52,0.82,mGl,1.06,2.08,-1.4);
    B(cab,0.05,0.44,0.65,mGl,-1.06,1.18,-1.45); B(cab,0.05,0.44,0.65,mGl,1.06,1.18,-1.45);
    B(cab,0.07,0.85,0.07,mChr,-0.95,2.22,-1.98); B(cab,0.07,0.85,0.07,mChr,0.95,2.22,-1.98);
    B(cab,2.25,0.24,0.2,mChr,0,0.14,-2.03); B(cab,2.05,0.1,0.12,mChr,0,0.38,-2.04);
    B(cab,0.3,0.1,0.22,mChr,-0.72,0.06,-2.1); B(cab,0.3,0.1,0.22,mChr,0.72,0.06,-2.1);
    B(cab,1.8,0.12,0.08,mDk,0,0.06,-2.02); B(cab,1.55,0.72,0.05,mGrille,0,0.68,-2.04);
    for (let gi=0; gi<6; gi++) B(cab,1.53,0.035,0.04,mChr,0,0.34+gi*0.115,-2.04);
    for (let gv=-2; gv<=2; gv++) B(cab,0.035,0.7,0.04,mChr,gv*0.31,0.68,-2.04);
    B(cab,0.4,0.12,0.04,mChr,0,0.94,-2.04);
    const mHead = M(0xffffff,0.1,0.2,0xffeedd,6);
    B(cab,0.48,0.24,0.06,mHead,-0.74,0.98,-2.03); B(cab,0.48,0.24,0.06,mHead,0.74,0.98,-2.03);
    B(cab,0.55,0.3,0.04,mChr,-0.74,0.98,-2.01); B(cab,0.55,0.3,0.04,mChr,0.74,0.98,-2.01);
    B(cab,0.26,0.14,0.05,M(0xffffff,0.1,0.1,0xffffcc,3),-0.72,0.22,-2.03);
    B(cab,0.26,0.14,0.05,M(0xffffff,0.1,0.1,0xffffcc,3),0.72,0.22,-2.03);
    B(cab,1.85,0.04,0.04,M(0xffffff,0.1,0.1,0xaaddff,5),0,1.25,-2.04);
    B(cab,0.18,0.1,0.05,mAmb,-1.02,0.9,-2.01); B(cab,0.18,0.1,0.05,mAmb,1.02,0.9,-2.01);
    function addMirror(sx: number) {
      const mg = new T.Group();
      B(mg,0.055,0.055,0.5,mChr); B(mg,0.28,0.2,0.06,M(0x151f2e,0.5,0.4),0,0,-0.26); B(mg,0.22,0.16,0.02,mGl,0,0,-0.3);
      mg.position.set(sx*1.2,2.28,-1.62); mg.rotation.z = sx*0.12; cab.add(mg);
    }
    addMirror(-1); addMirror(1);
    CYL(cab,0.055,0.05,2.4,10,mEx,-0.88,2.52,0.38); CYL(cab,0.055,0.05,2.4,10,mEx,0.88,2.52,0.38);
    CYL(cab,0.09,0.055,0.14,10,mEx,-0.88,3.62,0.38); CYL(cab,0.09,0.055,0.14,10,mEx,0.88,3.62,0.38);
    [-0.7,-0.35,0,0.35,0.7].forEach(x => B(cab,0.11,0.09,0.09,mRoofL,x,2.88,-1.92));
    CYL(cab,0.28,0.28,1.35,16,mChr,-1.14,0.44,0.28,Math.PI/2);
    CYL(cab,0.28,0.28,1.35,16,mChr, 1.14,0.44,0.28,Math.PI/2);
    B(cab,0.55,0.055,0.2,mChr,-1.14,0.12,-1.68); B(cab,0.55,0.055,0.2,mChr,1.14,0.12,-1.68);
    B(cab,0.55,0.055,0.2,mChr,-1.14,0.44,-1.8);  B(cab,0.55,0.055,0.2,mChr,1.14,0.44,-1.8);
    B(cab,0.05,0.32,2.2,mCab,-1.07,0.22,-0.88);  B(cab,0.05,0.32,2.2,mCab,1.07,0.22,-0.88);
    B(cab,1.15,0.14,0.9,mChr,0,0.86,0.82);
    B(cab,3.0,0.11,0.11,mDk,0,0.32,-1.6); buildWheel(-1.32,-1.6,cab); buildWheel(1.32,-1.6,cab);
    B(cab,3.2,0.11,0.11,mDk,0,0.32,0.55); buildWheel(-1.42,0.55,cab,0.28); buildWheel(1.42,0.55,cab,0.28);
    B(cab,3.2,0.11,0.11,mDk,0,0.32,1.05); buildWheel(-1.42,1.05,cab,0.28); buildWheel(1.42,1.05,cab,0.28);
    B(cab,0.04,0.38,0.52,M(0x111111,0.95,0),-1.17,0.3,1.35); B(cab,0.04,0.38,0.52,M(0x111111,0.95,0),1.17,0.3,1.35);

    const trl = new T.Group(); root.add(trl); trl.position.z = 1.0;
    B(trl,2.32,2.05,8.8,mTrl,0,1.825,5.2); B(trl,2.32,2.05,0.06,M(0x0c1a2c,0.6,0.1),0,1.825,0.78);
    B(trl,0.06,0.35,8.7,mStr,-1.165,2.12,5.2); B(trl,0.06,0.35,8.7,mStr,1.165,2.12,5.2);
    B(trl,2.32,0.08,8.7,mStr,0,2.86,5.2); B(trl,2.32,0.06,8.7,M(0x1d4ed8,0.5,0.1,0x1d4ed8,0.3),0,0.85,5.2);
    B(trl,0.055,0.72,3.0,mWh,-1.165,1.88,3.9); B(trl,0.055,0.72,3.0,mWh,1.165,1.88,3.9);
    [[-1.16,0.82],[-1.16,9.62],[1.16,0.82],[1.16,9.62]].forEach((c) => B(trl,0.08,2.08,0.08,mChr,c[0],1.825,c[1]));
    B(trl,2.4,0.07,8.88,mChr,0,2.88,5.2); B(trl,2.4,0.07,8.88,mChr,0,0.82,5.2);
    B(trl,1.12,2.05,0.06,M(0x0c1a2c,0.6,0.1),-0.6,1.825,9.64); B(trl,1.12,2.05,0.06,M(0x0c1a2c,0.6,0.1),0.6,1.825,9.64);
    [-0.04,0.04].forEach((hx) => [1.1,1.9,2.5].forEach((hy) => B(trl,0.06,0.08,0.06,mChr,hx,hy,9.65)));
    B(trl,0.06,0.4,0.06,mRed,-1.15,2.2,9.65); B(trl,0.06,0.4,0.06,mRed,1.15,2.2,9.65);
    B(trl,0.06,0.22,0.06,mAmb,-1.15,1.62,9.65); B(trl,0.06,0.22,0.06,mAmb,1.15,1.62,9.65);
    B(trl,0.3,0.06,0.04,M(0xff3333,0.2,0.1,0xff2200,1.5),-0.5,0.88,9.66); B(trl,0.3,0.06,0.04,M(0xff3333,0.2,0.1,0xff2200,1.5),0.5,0.88,9.66);
    B(trl,2.45,0.13,0.13,mChr,0,0.3,9.62); B(trl,0.13,0.55,0.13,mChr,-1.12,0.36,9.55); B(trl,0.13,0.55,0.13,mChr,1.12,0.36,9.55);
    B(trl,0.12,0.18,8.8,mDk,-0.88,0.74,5.2); B(trl,0.12,0.18,8.8,mDk,0.88,0.74,5.2);
    B(trl,0.05,0.44,5.6,mCab,-1.165,0.56,6.0); B(trl,0.05,0.44,5.6,mCab,1.165,0.56,6.0);
    B(trl,0.1,0.65,0.1,mDk,-0.7,0.53,1.65); B(trl,0.1,0.65,0.1,mDk,0.7,0.53,1.65); B(trl,0.65,0.08,0.32,mDk,0,0.22,1.65);
    B(trl,2.75,0.1,0.1,mDk,0,0.38,7.05); B(trl,2.75,0.1,0.1,mDk,0,0.38,8.25);
    buildWheel(-1.35,7.05,trl,0.28); buildWheel(1.35,7.05,trl,0.28);
    buildWheel(-1.35,8.25,trl,0.28); buildWheel(1.35,8.25,trl,0.28);
    B(trl,0.04,0.42,0.55,M(0x0a0a0a,0.95,0),-1.17,0.3,8.88); B(trl,0.04,0.42,0.55,M(0x0a0a0a,0.95,0),1.17,0.3,8.88);

    // Detach trailer so it can articulate independently
    const trailerObj = trl;
    root.remove(trailerObj);
    scene.add(root);
    scene.add(trailerObj);

    // Roads
    function road(x1: number, z1: number, x2: number, z2: number, w = 2.2) {
      const dx=x2-x1, dz=z2-z1, len=Math.sqrt(dx*dx+dz*dz), ang=Math.atan2(dz,dx);
      const rm = new T.Mesh(new T.BoxGeometry(len,0.055,w), new T.MeshStandardMaterial({color:0x141414,roughness:0.95,metalness:0}));
      rm.position.set((x1+x2)/2,0.028,(z1+z2)/2); rm.rotation.y=ang; rm.receiveShadow=true; scene.add(rm);
      const cl = new T.Mesh(new T.BoxGeometry(len,0.07,0.09), new T.MeshStandardMaterial({color:0x303030,roughness:0.8}));
      cl.position.set((x1+x2)/2,0.04,(z1+z2)/2); cl.rotation.y=ang; scene.add(cl);
    }
    [-18,-12,-6,0,6,12,18].forEach(z => road(-30,z,30,z));
    [-18,-12,-6,0,6,12,18].forEach(x => road(x,-30,x,30));
    road(4,-22,4,6,3.4); road(4,6,14,16,3.4); road(14,16,14,28,3.4);

    // Buildings
    const ROUTE_2D = [[4,-20],[4,0],[4,6],[9,12],[14,16],[14,26]];
    function ptSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
      const dx=bx-ax, dz=bz-az, lsq=dx*dx+dz*dz;
      if (!lsq) return Math.hypot(px-ax, pz-az);
      const t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/lsq));
      return Math.hypot(px-(ax+t*dx), pz-(az+t*dz));
    }
    function nearRoute(px: number, pz: number) {
      for (let i=0; i<ROUTE_2D.length-1; i++) {
        const a=ROUTE_2D[i], b=ROUTE_2D[i+1];
        if (ptSeg(px,pz,a[0],a[1],b[0],b[1]) < 7.5) return true;
      }
      return false;
    }
    const bCols = [0x1b1b1b,0x161616,0x131313,0x1e1e1e,0x111111];
    for (let bx=-24; bx<=24; bx+=6) {
      for (let bz=-26; bz<=26; bz+=6) {
        const cnt = Math.floor(1+Math.random()*3);
        for (let k=0; k<cnt; k++) {
          const ox=bx+(Math.random()-.5)*2.8, oz=bz+(Math.random()-.5)*2.8;
          if (nearRoute(ox,oz)) continue;
          const bw=0.7+Math.random()*2.2, bd=0.7+Math.random()*2.2, bh=0.5+Math.random()*5.5;
          const col=bCols[Math.floor(Math.random()*bCols.length)];
          const bm = new T.Mesh(new T.BoxGeometry(bw,bh,bd),M(col,0.85,0.15));
          bm.position.set(ox,bh/2,oz); bm.castShadow=true; bm.receiveShadow=true; scene.add(bm);
          const wm = new T.Mesh(new T.BoxGeometry(bw*.55,bh*.22,0.04),M(0x2244aa,0.3,0.2,0x2244aa,0.35));
          wm.position.set(ox,bh*.55,oz+bd/2+.01); scene.add(wm);
          const rm2 = new T.Mesh(new T.BoxGeometry(bw+.05,.05,bd+.05),M(0x2a2a2a,0.4,0.2,0x333333,0.4));
          rm2.position.set(ox,bh+.02,oz); scene.add(rm2);
        }
      }
    }
    [[-8,-8,1.8,1.8,9],[10,5,2.2,2.5,11],[-3,10,1.6,1.6,8],[14,-10,2,2,13],[-14,4,1.8,2.4,10],[-12,18,2,2,9],[16,20,1.8,1.8,11]]
      .filter(lb => !nearRoute(lb[0],lb[1]))
      .forEach(lb => {
        const [lx,lz,lw,ld,lh] = lb;
        const lm = new T.Mesh(new T.BoxGeometry(lw,lh,ld),M(0x1b1b1b,0.8,0.15));
        lm.position.set(lx,lh/2,lz); lm.castShadow=true; scene.add(lm);
        const lr = new T.Mesh(new T.BoxGeometry(lw+.06,.06,ld+.06),M(0x2a2a2a,0.4,0.2,0x333333,0.6));
        lr.position.set(lx,lh+.03,lz); scene.add(lr);
        const ant = new T.Mesh(new T.CylinderGeometry(0.03,0.03,1.2,6),M(0x8899aa,0.3,0.8));
        ant.position.set(lx,lh+.65,lz); scene.add(ant);
        const atop = new T.Mesh(new T.SphereGeometry(0.08,6,6),M(0xff2200,0.2,0.1,0xff2200,3));
        atop.position.set(lx,lh+1.3,lz); scene.add(atop);
      });

    // Route path
    const ROUTE = [
      new T.Vector3(4,.12,-20), new T.Vector3(4,.12,0), new T.Vector3(4,.12,6),
      new T.Vector3(9,.12,12),  new T.Vector3(14,.12,16), new T.Vector3(14,.12,26),
    ];
    const DEST = ROUTE[ROUTE.length-1].clone();
    const pathCurve = new T.CatmullRomCurve3(ROUTE, false, "catmullrom", 0.5);
    const getPos = (t: number) => pathCurve.getPoint(Math.max(0, Math.min(1, t)));

    const routeTube = new T.Mesh(new T.TubeGeometry(pathCurve,80,.07,8,false), M(0x60a5fa,0.3,0.5,0x3b82f6,1.5));
    routeTube.material.transparent=true; routeTube.material.opacity=0.55; scene.add(routeTube);
    const travelMat = M(0x93c5fd,0.2,0.6,0x60a5fa,2.8); travelMat.transparent=true; travelMat.opacity=0.9;
    const travelTube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([ROUTE[0].clone(),ROUTE[0].clone()]),2,.11,8,false), travelMat);
    scene.add(travelTube);

    const ori = new T.Mesh(new T.CylinderGeometry(0.28,0.28,.06,20), M(0x3b82f6,0.4,0.2,0x1d4ed8,2.5));
    ori.position.copy(ROUTE[0]); ori.position.y=.07; scene.add(ori);
    const oriR = new T.Mesh(new T.RingGeometry(0.38,0.52,32), new T.MeshBasicMaterial({color:0x60a5fa,side:T.DoubleSide,transparent:true,opacity:0.6}));
    oriR.rotation.x=-Math.PI/2; oriR.position.copy(ROUTE[0]); oriR.position.y=.09; scene.add(oriR);

    const pinG = new T.Group(); pinG.position.copy(DEST); scene.add(pinG);
    const pp = new T.Mesh(new T.CylinderGeometry(0.065,0.065,4,10), M(0x22c55e,0.4,0.1,0x16a34a,1.5)); pp.position.y=2; pinG.add(pp);
    const ph = new T.Mesh(new T.SphereGeometry(0.5,22,22), M(0x4ade80,0.22,0.18,0x22c55e,3)); ph.position.y=4.25; pinG.add(ph);
    const pi = new T.Mesh(new T.SphereGeometry(0.22,14,14), M(0xffffff,0.1,0.1,0xffffff,4)); pi.position.y=4.25; pinG.add(pi);

    const pr1M = new T.MeshBasicMaterial({color:0x4ade80,side:T.DoubleSide,transparent:true,opacity:0.8});
    const pr2M = new T.MeshBasicMaterial({color:0x4ade80,side:T.DoubleSide,transparent:true,opacity:0.5});
    const pr1 = new T.Mesh(new T.RingGeometry(0.5,0.72,32),pr1M); pr1.rotation.x=-Math.PI/2; pr1.position.copy(DEST); pr1.position.y=.06; scene.add(pr1);
    const pr2 = new T.Mesh(new T.RingGeometry(0.5,0.68,32),pr2M); pr2.rotation.x=-Math.PI/2; pr2.position.copy(DEST); pr2.position.y=.07; scene.add(pr2);

    const pgeo = new T.BufferGeometry();
    const pa = new Float32Array(750);
    for (let i=0; i<250; i++) { pa[i*3]=(Math.random()-.5)*60; pa[i*3+1]=Math.random()*14; pa[i*3+2]=(Math.random()-.5)*60; }
    pgeo.setAttribute("position", new T.BufferAttribute(pa,3));
    scene.add(new T.Points(pgeo, new T.PointsMaterial({color:0x333333,size:0.1,transparent:true,opacity:0.4,sizeAttenuation:true})));

    // Animation state
    let prog=0, lastT=0, camAng=0, wRot=0, fc=0, curAng=Math.PI, trlAng=Math.PI;
    const trlPos = new T.Vector3(4,0,-18.2);
    let trlInit = false;

    function updTravel(t: number) {
      const pts = [], steps = 40;
      for (let i=0; i<=steps; i++) pts.push(pathCurve.getPoint((i/steps)*Math.max(.001,t)));
      const ng = new T.TubeGeometry(new T.CatmullRomCurve3(pts),steps*2,.12,8,false);
      travelTube.geometry.dispose(); travelTube.geometry = ng;
    }
    function updUI(t: number) {
      const b=document.getElementById("tc-bar-3d"), e=document.getElementById("tc-eta-3d"), d=document.getElementById("tc-dist-3d");
      if (b) b.style.width = Math.round(t*100)+"%";
      if (e) e.textContent = Math.round((1-t)*60)+" min";
      if (d) d.textContent = ((1-t)*7.5).toFixed(1)+" km";
    }

    function animate(time: number) {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(time-lastT, 50); lastT=time; fc++;
      prog += .000022*dt;
      if (prog >= .97) { prog=0; trlInit=false; trlAng=Math.PI; }
      const pos=getPos(prog), ah=getPos(Math.min(prog+.004,.999));
      const dx=ah.x-pos.x, dz=ah.z-pos.z;
      if (dx*dx+dz*dz > .00001) {
        const ta = Math.atan2(dx,dz)+Math.PI;
        if (fc<=1) { curAng=ta; } else { let da=ta-curAng; da-=Math.round(da/(2*Math.PI))*2*Math.PI; curAng+=da*Math.min(1,dt*.006); }
      }
      root.position.copy(pos); root.position.y=0; root.rotation.y=curAng;
      const cx=pos.x+Math.sin(curAng)*.82, cz=pos.z+Math.cos(curAng)*.82;
      if (!trlInit) { trlAng=curAng; trlPos.set(cx,0,cz); trlInit=true; }
      const rx=trlPos.x+Math.sin(trlAng)*9.5, rz=trlPos.z+Math.cos(trlAng)*9.5;
      trlPos.set(cx,0,cz);
      const tdx=rx-cx, tdz=rz-cz, td=Math.sqrt(tdx*tdx+tdz*tdz);
      if (td > .01) { const nx=cx+(tdx/td)*9.5, nz=cz+(tdz/td)*9.5; trlAng=Math.atan2(nx-cx,nz-cz); }
      trailerObj.position.set(cx,0,cz); trailerObj.rotation.y=trlAng;
      wRot += dt*.0015;
      root.traverse((c: any) => { if (c.geometry?.type==="TorusGeometry") c.rotation.x=wRot; });
      trailerObj.traverse((c: any) => { if (c.geometry?.type==="TorusGeometry") c.rotation.x=wRot; });
      truckPtLight.position.copy(pos); truckPtLight.position.y=2.5;
      const tcx=4+Math.sin(camAng)*10, tcz=pos.z-18;
      camera.position.x+=(tcx-camera.position.x)*.02;
      camera.position.z+=(tcz-camera.position.z)*.02;
      camera.position.y+=(28-camera.position.y)*.02;
      camera.lookAt(pos.x,0,pos.z); camAng+=.00012;
      const p1=(time*.0009)%1, p2=(time*.0009+.42)%1;
      pr1.scale.setScalar(1+p1*5.5); pr1M.opacity=(1-p1)*.75;
      pr2.scale.setScalar(1+p2*5.5); pr2M.opacity=(1-p2)*.5;
      pinG.position.y=Math.sin(time*.0018)*.2;
      destPtLight.intensity=5+Math.sin(time*.003)*2.5;
      routeTube.material.emissiveIntensity=1+Math.sin(time*.002)*.5;
      const parr = pgeo.attributes.position.array as Float32Array;
      for (let i=0; i<250; i++) { parr[i*3+1]+=.004; if(parr[i*3+1]>14) parr[i*3+1]=0; }
      pgeo.attributes.position.needsUpdate=true;
      if (fc%4===0) updTravel(prog);
      updUI(prog);
      renderer.render(scene, camera);
    }
    animate(0);

    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", setSize);
      renderer.dispose();
    };
  }

  return (
    <section ref={sectionRef} style={{ position:"relative", width:"100%", height:"100vh", minHeight:680, overflow:"hidden", display:"flex", alignItems:"center" }}>
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", display:"block" }} />

      {/* Gradient overlay */}
      <div style={{ position:"absolute", inset:0, zIndex:5, pointerEvents:"none", background:"linear-gradient(105deg,rgba(10,10,10,.92) 0%,rgba(10,10,10,.65) 38%,rgba(10,10,10,0) 65%),linear-gradient(0deg,rgba(10,10,10,.95) 0%,transparent 22%,transparent 80%,rgba(10,10,10,.5) 100%)" }} />

      {/* Text content */}
      <div style={{ position:"relative", zIndex:10, padding:"0 7%", paddingTop:70, maxWidth:620, pointerEvents:"all" }}>
        <div className="hero-tag" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 16px", borderRadius:20, background:"rgba(37,99,235,0.12)", border:"1px solid rgba(37,99,235,0.3)", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#60a5fa", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:24 }}>
          <span className="eyebrow-dot" style={{ width:5, height:5, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 7px rgba(74,222,128,0.6)", flexShrink:0 }} />
          Live Tracking · 3D Fleet View
        </div>

        <p className="hero-tag" style={{ fontFamily:"'Aboreto',serif", color:"#818181", fontSize:"clamp(13px,1.1vw,20px)", letterSpacing:"0.12em", marginBottom:14 }}>
          Premium logistics. Industrial precision.
        </p>

        <h1 className="hero-h1" style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(44px,6.5vw,116px)", lineHeight:1.05, margin:"0 0 32px", textShadow:"0 4px 6px rgba(0,0,0,0.3)" }}>
          Minimize costs.<br /><span className="shine-text">Transport goods.</span>
        </h1>

        <p className="hero-body" style={{ fontFamily:"'Aboreto',serif", color:"rgba(255,255,255,0.8)", fontSize:"clamp(13px,1.3vw,22px)", lineHeight:1.7, maxWidth:520, margin:"0 0 40px" }}>
          Book, track, and manage deliveries in one place. Real-time updates, seamless booking, and efficient support for all your logistics needs.
        </p>

        <div className="hero-btns" style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:40 }}>
          <button className="btn-press"
            style={{ fontFamily:"'Aboreto',serif", background:"rgba(255,255,255,0.08)", color:"#fff", border:"1px solid rgba(255,255,255,0.22)", borderRadius:15, padding:"16px 32px", fontSize:"clamp(13px,1vw,18px)", cursor:"pointer", letterSpacing:"0.05em", backdropFilter:"blur(4px)", transition:"background .2s,border-color .2s" }}
            onMouseEnter={(e) => { const el=e.currentTarget as HTMLElement; el.style.background="rgba(255,255,255,0.16)"; el.style.borderColor="rgba(255,255,255,0.5)"; }}
            onMouseLeave={(e) => { const el=e.currentTarget as HTMLElement; el.style.background="rgba(255,255,255,0.08)"; el.style.borderColor="rgba(255,255,255,0.22)"; }}>
            Be our partner
          </button>
          <button className="btn-press"
            style={{ fontFamily:"'Aboreto',serif", background:"#fff", color:"#0a0a0a", border:"none", borderRadius:15, padding:"16px 32px", fontSize:"clamp(13px,1vw,18px)", cursor:"pointer", letterSpacing:"0.05em", transition:"opacity .2s" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity=".85")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity="1")}>
            sign in
          </button>
        </div>

        <div className="hero-stats" style={{ display:"flex", gap:32, alignItems:"center", flexWrap:"wrap" }}>
          {[{num:"90%",lbl:"On-time rate"},{num:"500K+",lbl:"Deliveries"},{num:"24/7",lbl:"Live tracking"}].map((s,i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column" }}>
              <span style={{ fontFamily:"'Aboreto',serif", fontSize:"clamp(20px,1.8vw,30px)", color:"#fff", letterSpacing:"-0.03em" }}>{s.num}</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.12em", marginTop:2 }}>{s.lbl}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── About ──────────────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <section style={{ background:"#1b1b1b", overflow:"hidden", display:"grid", gridTemplateColumns:"1fr 1fr", alignItems:"center", gap:"4%", padding:"100px 7%" }}>
      <Reveal className="reveal-left">
        <p style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(14px,1.4vw,26px)", lineHeight:1.75 }}>
          Discover powerful tools for fast, transparent, and reliable logistics. Manage every step with ease and confidence.
        </p>
      </Reveal>
      <Reveal className="reveal-right" style={{ position:"relative", minHeight:400 }}>
        <div style={{ position:"absolute", top:"8%", left:"22%", right:0, bottom:0, background:"#fff", borderRadius:30, boxShadow:"0 4px 4px rgba(0,0,0,0.25)" }} />
        <Image src={IMG_L300_VAN} alt="Delivery van" style={{ position:"absolute", top:"2%", right:"2%", width:"58%", height:"auto", objectFit:"contain", transform:"scaleY(-1) rotate(180deg)", zIndex:2, filter:"drop-shadow(0 8px 20px rgba(0,0,0,0.4))" }} />
        <Image src={IMG_CARGO_TRUCK} alt="Cargo truck" style={{ position:"absolute", bottom:"-8%", left:"-8%", width:"72%", height:"auto", objectFit:"contain", zIndex:3, filter:"drop-shadow(0 8px 24px rgba(0,0,0,0.5))" }} />
        <p style={{ position:"absolute", bottom:"6%", right:0, fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(22px,3.5vw,62px)", lineHeight:1.1, margin:0, zIndex:4, mixBlendMode:"difference", textShadow:"0 4px 6px rgba(0,0,0,0.3)", maxWidth:"60%", textAlign:"right" }}>
          Effortless logistics, real results
        </p>
      </Reveal>
    </section>
  );
}

// ── Brands ─────────────────────────────────────────────────────────────────
function BrandsSection() {
  return (
    <section id="partners" style={{ background:"#0a0a0a", padding:"100px 7%", overflow:"hidden" }}>
      <Reveal>
        <p style={{ fontFamily:"'Aboreto',serif", color:"#818181", fontSize:"clamp(12px,1vw,18px)", letterSpacing:"0.12em", marginBottom:16 }}>
          Move nationwide with unmatched precision
        </p>
      </Reveal>
      <div style={{ display:"flex", gap:60, alignItems:"flex-end", flexWrap:"wrap" }}>
        <Reveal className="reveal-left">
          <h2 style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(44px,6.5vw,105px)", lineHeight:1.05, textShadow:"0 4px 6px rgba(0,0,0,0.3)" }}>
            Brands<br />that<br />moves<br />with us
          </h2>
        </Reveal>
        <Reveal className="reveal-right" style={{ flex:1, minWidth:280, overflow:"hidden" }}>
          <div style={{ overflow:"hidden", marginBottom:36 }}>
            <div className="marquee-fwd" style={{ display:"flex", gap:64, width:"max-content" }}>
              {[...BRAND_LOGOS,...BRAND_LOGOS,...BRAND_LOGOS].map((l,i) => (
                <Image key={i} src={l.src} alt={l.alt} style={{ height:l.h, width:"auto", objectFit:"contain", opacity:.85, flexShrink:0 }} />
              ))}
            </div>
          </div>
          <div style={{ overflow:"hidden" }}>
            <div className="marquee-rev" style={{ display:"flex", gap:64, width:"max-content" }}>
              {[...BRAND_LOGOS,...BRAND_LOGOS,...BRAND_LOGOS].map((l,i) => (
                <Image key={i} src={l.src} alt={l.alt} style={{ height:l.h, width:"auto", objectFit:"contain", opacity:.85, flexShrink:0 }} />
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Services ───────────────────────────────────────────────────────────────
function WordCarousel() {
  const [idx, setIdx] = useState(0);
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { setIdx(p => (p+1)%CAROUSEL_WORDS.length); setK(p => p+1); }, 2000);
    return () => clearInterval(id);
  }, []);
  const w = CAROUSEL_WORDS[idx];
  return (
    <div style={{ height:"clamp(50px,6.5vw,120px)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span key={k} style={{ fontFamily:"'Aboreto',serif", fontSize:"clamp(32px,5.5vw,100px)", color:w.color, textShadow:"0 4px 6px rgba(0,0,0,0.3)", display:"block", animation:"wordSlideUp 2s ease forwards" }}>
        {w.text}
      </span>
    </div>
  );
}

function ServicesSection() {
  return (
    <section id="services" style={{ background:"#1b1b1b", padding:"100px 7%" }}>
      <Reveal>
        <p style={{ fontFamily:"'Aboreto',serif", color:"#818181", fontSize:"clamp(12px,1vw,18px)", letterSpacing:"0.12em", textAlign:"center", marginBottom:8 }}>WHAT WE DELIVER</p>
        <h2 style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(32px,5.5vw,100px)", lineHeight:1.1, textAlign:"center", textShadow:"0 4px 6px rgba(0,0,0,0.3)", margin:"0 0 4px" }}>Logistics built for</h2>
        <div style={{ textAlign:"center", marginBottom:60 }}><WordCarousel /></div>
      </Reveal>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:24 }}>
        {SERVICES.map((svc,i) => (
          <Reveal key={i} className={`reveal delay-${i+1}`}>
            <div className="svc-card" style={{ background:"#0a0a0a", borderRadius:15, overflow:"hidden" }}>
              <div className="svc-img" style={{ overflow:"hidden", borderRadius:"15px 15px 0 0" }}>
                <Image src={svc.image} alt={svc.title} width={400} height={220} unoptimized
                  style={{ width:"100%", height:220, objectFit:"cover", display:"block" }} />
              </div>
              <p style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(13px,1vw,18px)", margin:"18px 18px 22px", letterSpacing:"0.05em" }}>{svc.title}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Metrics ────────────────────────────────────────────────────────────────
function MetricCard({ value, suffix, label, decimal, run }: { value:string; suffix:string; label:string; decimal:boolean; run:boolean }) {
  const count = useCountUp(parseFloat(value), 1800, run, decimal);
  const display = decimal ? count.toFixed(1) : Math.floor(count).toString();
  return (
    <div className="metric-card" style={{ background:"#fff", borderRadius:30, boxShadow:"0 4px 8px 4px rgba(0,0,0,0.25)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 16px", gap:10 }}>
      <span style={{ fontFamily:"'Aboreto',serif", fontSize:"clamp(26px,3.5vw,68px)", color:"#1b1b1b", textShadow:"0 4px 6px rgba(0,0,0,0.18)", lineHeight:1, whiteSpace:"nowrap" }}>{display}{suffix}</span>
      <span style={{ fontFamily:"'Aboreto',serif", fontSize:"clamp(10px,0.85vw,15px)", color:"#0a0a0a", textAlign:"center", letterSpacing:"0.06em", lineHeight:1.45 }}>{label.toUpperCase()}</span>
    </div>
  );
}

function MetricsSection() {
  const { ref, visible } = useInView(0.2);
  return (
    <section id="metrics" style={{ background:"#0a0a0a", padding:"100px 7%" }}>
      <Reveal>
        <h2 style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(30px,5vw,88px)", textAlign:"center", lineHeight:1.1, textShadow:"0 4px 6px rgba(0,0,0,0.3)", margin:"0 0 18px" }}>Metrics that move your business</h2>
        <p style={{ fontFamily:"'Aboreto',serif", color:"rgba(255,255,255,0.75)", fontSize:"clamp(13px,1.1vw,20px)", textAlign:"center", margin:"0 0 60px" }}>See how our logistics solutions deliver speed, reliability, and satisfaction for every shipment.</p>
      </Reveal>
      <div ref={ref} style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:24, alignItems:"stretch" }}>
        <div style={{ borderRadius:30, overflow:"hidden", gridRow:"1/3", minHeight:380, position:"relative", opacity:visible?1:0, transform:visible?"translateX(0)":"translateX(-50px)", transition:"opacity .7s ease,transform .7s ease" }}>
          <Image src={IMG_METRICS_BG} alt="" fill unoptimized style={{ objectFit:"cover" }} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:24 }}>
          {METRICS.map((m,i) => (
            <div key={i} style={{ opacity:visible?1:0, transform:visible?"translateY(0)":"translateY(40px)", transition:`opacity .6s ease ${.08*i+.2}s,transform .6s ease ${.08*i+.2}s` }}>
              <MetricCard {...m} run={visible} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQs ───────────────────────────────────────────────────────────────────
function FAQSection() {
  const [open, setOpen] = useState<number|null>(null);
  return (
    <section id="faqs" style={{ background:"#0a0a0a", padding:"100px 7%" }}>
      <Reveal>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:24 }}>
          <div style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:40, padding:"10px 28px", fontFamily:"'Aboreto',serif", color:"#fff", fontSize:15, letterSpacing:"0.1em" }}>FAQs</div>
        </div>
        <h2 style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(24px,3.8vw,68px)", textAlign:"center", lineHeight:1.1, margin:"0 0 16px", textShadow:"0 4px 6px rgba(0,0,0,0.3)" }}>FREQUENTLY ASKED QUESTIONS</h2>
        <p style={{ fontFamily:"'Aboreto',serif", color:"#818181", fontSize:"clamp(12px,1vw,18px)", textAlign:"center", margin:"0 0 56px" }}>find quick answers to common questions about our efficient logistics</p>
      </Reveal>
      <div style={{ maxWidth:880, margin:"0 auto" }}>
        {FAQS.map((faq,i) => (
          <Reveal key={i} className={`reveal delay-${i+1}`}>
            <div style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
              <button onClick={() => setOpen(open===i?null:i)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, padding:"28px 0" }}>
                <span style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(14px,1.2vw,21px)", textAlign:"left", letterSpacing:"0.04em" }}>{faq.q}</span>
                <span className={`faq-chevron${open===i?" open":""}`} style={{ color:"#fff", fontSize:26, flexShrink:0, lineHeight:1 }}>+</span>
              </button>
              <div className={`faq-answer${open===i?" open":""}`}>
                <p style={{ fontFamily:"'Aboreto',serif", color:"rgba(255,255,255,0.55)", fontSize:"clamp(12px,1vw,17px)", lineHeight:1.75, paddingBottom:24 }}>{faq.a}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Contact ────────────────────────────────────────────────────────────────
function ContactSection() {
  return (
    <section style={{ background:"#0a0a0a", borderTop:"1px solid rgba(255,255,255,0.06)", padding:"100px 7%", textAlign:"center" }}>
      <Reveal>
        <h2 style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:"clamp(28px,5vw,86px)", lineHeight:1.1, margin:"0 0 20px", textShadow:"0 4px 6px rgba(0,0,0,0.3)" }}>Contact our logistics experts</h2>
        <p style={{ fontFamily:"'Aboreto',serif", color:"rgba(255,255,255,0.55)", fontSize:"clamp(13px,1.1vw,19px)", margin:"0 0 52px" }}>be our partner by sending us a message. Fast, direct, and reliable.</p>
        <form onSubmit={(e) => e.preventDefault()} style={{ maxWidth:720, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {["Full Name","Company"].map(ph => (
              <input key={ph} placeholder={ph}
                style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"18px 20px", color:"#fff", fontSize:15, outline:"none", transition:"border-color .2s" }}
                onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor="rgba(77,249,237,0.5)")}
                onBlur={(e)  => ((e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.1)")} />
            ))}
          </div>
          <input placeholder="Email address" type="email"
            style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"18px 20px", color:"#fff", fontSize:15, outline:"none", transition:"border-color .2s" }}
            onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor="rgba(77,249,237,0.5)")}
            onBlur={(e)  => ((e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.1)")} />
          <textarea placeholder="Your message" rows={5}
            style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"18px 20px", color:"#fff", fontSize:15, outline:"none", resize:"none", transition:"border-color .2s" }}
            onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor="rgba(77,249,237,0.5)")}
            onBlur={(e)  => ((e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.1)")} />
          <button type="submit" className="btn-press"
            style={{ fontFamily:"'Aboreto',serif", background:"#fff", color:"#0a0a0a", border:"none", borderRadius:15, padding:20, fontSize:"clamp(14px,1.1vw,20px)", cursor:"pointer", letterSpacing:"0.06em", transition:"opacity .2s" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity=".85")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity="1")}>
            Send Message
          </button>
        </form>
      </Reveal>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background:"#060606", borderTop:"1px solid rgba(255,255,255,0.05)", padding:"40px 7%", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
      <span style={{ fontFamily:"'Aboreto',serif", color:"#fff", fontSize:18, letterSpacing:"0.04em" }}>
        LOGIS<span style={{ color:"#4df9ed" }}>TICS</span>
      </span>
      <p style={{ fontFamily:"'Aboreto',serif", color:"rgba(255,255,255,0.3)", fontSize:13, margin:0, letterSpacing:"0.05em" }}>
        © {new Date().getFullYear()} Logistics Services. All rights reserved.
      </p>
    </footer>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function LogisticsLandingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <Navbar />
      <HeroSection />
      <AboutSection />
      <BrandsSection />
      <ServicesSection />
      <MetricsSection />
      <FAQSection />
      <ContactSection />
      <Footer />
    </>
  );
}