"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════════
   PLE 3D VIEWER — PLE4Win-stijl 3D Pipeline Visualisatie
   
   Features:
   - Configuration mode: grijze pipeline met correcte diameter
   - Result mode: heatmap kleuring op basis van output data
   - Rechter paneel met togglebare overlays (PLE4Win-stijl)
   - View cube voor snelle oriëntatie
   - Value histogram met kleurenbalk
   - Element klik → details panel
   - Copy to clipboard / Export
   - Orthographic / Perspective toggle
   - Displaced pipeline overlay met magnification factor
   - Ground Level / Water Level ribbons
   - Node/Element numbers
   - Idents labels
   - Constraints iconen (eindpunten, steunpunten, T-stukken)
   - Bend indicators
   ═══════════════════════════════════════════════════════════════════════════ */

type NodeData = {
  id?: string; x: number; y: number; z?: number;
  bendR?: number; D0?: number; DPE?: number; etyp?: string;
};
type ElementData = {
  n1: number; n2: number; d?: number; t?: number;
  dc?: number; dpe?: number; type?: string; R?: number; bendR?: number;
};
type FemNodeResult = {
  nodeId: string;
  uc: number; ucRing: number; ucVM: number;
  sh: number; sl: number; vm: number;
  sb: number; Fx: number; My: number; Mz: number;
  ux: number; uy: number; uz: number;
};

type PleDisplacement = {
  nodeId: string;
  ux: number; uy: number; uz: number;
};
type SoilWizardData = {
  nodeId: string; nodeIndex: number;
  KLH: number; KLS: number; KLT: number;
  RVS: number; RVT: number; RH: number;
  F: number; UF: number; sigmaK: number; H_cover: number;
};
type Props = {
  D: number; t: number; matName: string; Pi: number; dT: number;
  sh: number; vm: number; unity: number;
  nodes?: NodeData[]; elements?: ElementData[];
  endpoints?: Record<string, { cond: string; state: string }>;
  connects?: { id1: string; id2: string; name: string; teeRef: string }[];
  supports?: { id: string; type: string }[];
  tees?: Record<string, any>;
  SMYS?: number;
  femResults?: FemNodeResult[];
  pleDisplacements?: PleDisplacement[];
  coverMap?: Record<string, number>;
  waterMap?: Record<string, number>;
  soilWizardResults?: SoilWizardData[];
};

function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return w < 768;
}

function getNodePos(n: NodeData): THREE.Vector3 { return new THREE.Vector3(n.x / 1000, (n.z || 0) / 1000, n.y / 1000); }

// PLE4Win gradient: blauw(laag) → cyaan → groen → geel → oranje → rood(hoog)
const PLE_GRADIENT = [
  { t: 0.00, r: 0, g: 0, b: 255 },     // blauw
  { t: 0.20, r: 0, g: 180, b: 255 },    // cyaan
  { t: 0.40, r: 0, g: 220, b: 100 },    // groen
  { t: 0.60, r: 200, g: 220, b: 0 },    // geel-groen
  { t: 0.75, r: 255, g: 180, b: 0 },    // oranje
  { t: 0.90, r: 255, g: 80, b: 0 },     // donker oranje
  { t: 1.00, r: 255, g: 0, b: 0 },      // rood
];

function getGradientColor(t: number): THREE.Color {
  const tc = Math.max(0, Math.min(1, t));
  for (let i = 0; i < PLE_GRADIENT.length - 1; i++) {
    if (tc <= PLE_GRADIENT[i + 1].t) {
      const f = (tc - PLE_GRADIENT[i].t) / (PLE_GRADIENT[i + 1].t - PLE_GRADIENT[i].t);
      return new THREE.Color(
        (PLE_GRADIENT[i].r + (PLE_GRADIENT[i + 1].r - PLE_GRADIENT[i].r) * f) / 255,
        (PLE_GRADIENT[i].g + (PLE_GRADIENT[i + 1].g - PLE_GRADIENT[i].g) * f) / 255,
        (PLE_GRADIENT[i].b + (PLE_GRADIENT[i + 1].b - PLE_GRADIENT[i].b) * f) / 255,
      );
    }
  }
  return new THREE.Color(1, 0, 0);
}

function getGradientHex(t: number): number { return getGradientColor(t).getHex(); }

// ── CSS constanten ──
const F = "'JetBrains Mono','Fira Code','Courier New',monospace";
const panelBg = "rgba(10,14,26,0.95)";
const panelBorder = "#1e293b";
const accentBlue = "#3498db";
const textDim = "#64748b";
const textMuted = "#94a3b8";
const textBright = "#e2e8f0";

// ── Checkbox component ──
function Chk({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, fontFamily: F, color: checked ? (color || textBright) : textDim, userSelect: "none" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: color || accentBlue, width: 12, height: 12 }} />
      {label}
    </label>
  );
}

export default function Ple3DViewer({
  D, t, matName, Pi, dT, sh, vm, unity,
  nodes, elements, endpoints, connects, supports, tees, SMYS = 235,
  femResults, pleDisplacements, coverMap, waterMap, soilWizardResults,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pipeGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const orbitRef = useRef<any>(null);
  const animFrameRef = useRef<any>(null);
  const highlightRef = useRef<THREE.Mesh | null>(null);
  const mob = useIsMobile();

  // ── State: view controls ──
  const [viewMode, setViewMode] = useState("3d");
  const [isOrtho, setIsOrtho] = useState(false);
  const [pipeScale, setPipeScale] = useState(8);
  const cameraInitRef = useRef(false);
  const prevNodeCountRef = useRef(0);

  // ── State: display mode ──
  const [colorMode, setColorMode] = useState<"config" | "result">("config");
  const [resultData, setResultData] = useState<"vm" | "uc" | "sh" | "sl" | "sb" | "ux" | "uy" | "uz" | "Fx" | "M">("vm");

  // ── State: show toggles (PLE4Win-stijl rechter paneel) ──
  const [showDisplaced, setShowDisplaced] = useState(false);
  const [deformScale, setDeformScale] = useState(50);
  const [hideOuter, setHideOuter] = useState(false);
  const [showNodeNums, setShowNodeNums] = useState(false);
  const [showElemNums, setShowElemNums] = useState(false);
  const [showGroundLevel, setShowGroundLevel] = useState(false);
  const [showWaterLevel, setShowWaterLevel] = useState(false);
  const [showPolygonPts, setShowPolygonPts] = useState(false);
  const [showBendIndicators, setShowBendIndicators] = useState(false);
  const [showIdents, setShowIdents] = useState(false);
  const [showConstraints, setShowConstraints] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [showElasticElements, setShowElasticElements] = useState(false);
  const [showCasing, setShowCasing] = useState(false);
  const [showSoilZones, setShowSoilZones] = useState(false);

  // ── State: element info ──
  const [selectedInfo, setSelectedInfo] = useState<any>(null);

  // ── State: histogram ──
  const [histMin, setHistMin] = useState(0);
  const [histMax, setHistMax] = useState(1);

  const dispFallback = useMemo<FemNodeResult[] | null>(() => {
    if (femResults && femResults.length > 0) return null;
    if (!pleDisplacements || pleDisplacements.length === 0) return null;
    return pleDisplacements.map(d => ({
      nodeId: d.nodeId,
      ux: d.ux, uy: d.uy, uz: d.uz,
      uc: 0, ucRing: 0, ucVM: 0,
      sh: 0, sl: 0, vm: 0, sb: 0,
      Fx: 0, My: 0, Mz: 0,
    }));
  }, [femResults, pleDisplacements]);

  const teeIdSet = useMemo(() => new Set(connects?.map(c => c.id1) || []), [connects]);
  const endpointIdSet = useMemo(() => new Set(Object.keys(endpoints || {})), [endpoints]);
  const supportIdSet = useMemo(() => new Set(supports?.map((s: any) => s.refIdent || s.id) || []), [supports]);

  // Soil Wizard: per-node lookup + min/max voor kleurschaal
  const soilWizMap = useMemo(() => {
    const m = new Map<string, SoilWizardData>();
    if (!soilWizardResults?.length) return { map: m, minKLH: 0, maxKLH: 1 };
    let minK = Infinity, maxK = -Infinity;
    for (const r of soilWizardResults) {
      m.set(r.nodeId, r);
      if (r.KLH < minK) minK = r.KLH;
      if (r.KLH > maxK) maxK = r.KLH;
    }
    if (minK === maxK) { minK = 0; maxK = Math.max(maxK, 1); }
    return { map: m, minKLH: minK, maxKLH: maxK };
  }, [soilWizardResults]);

  // Result data labels
  const resultLabels: Record<string, string> = {
    vm: "σvm (Von Mises)", uc: "UC (Unity Check)", sh: "σh (Hoopspanning)", sl: "σl (Langsspanning)",
    sb: "σb (Buigspanning)", ux: "ux (mm)", uy: "uy (mm)", uz: "uz (mm)", Fx: "Fx (kN)", M: "|M| (kNm)",
  };
  const resultUnits: Record<string, string> = {
    vm: "MPa", uc: "[-]", sh: "MPa", sl: "MPa", sb: "MPa",
    ux: "mm", uy: "mm", uz: "mm", Fx: "kN", M: "kNm",
  };

  useEffect(() => {
    const count = nodes?.length || 0;
    if (count !== prevNodeCountRef.current) { cameraInitRef.current = false; prevNodeCountRef.current = count; }
  }, [nodes]);

  const animateCamera = useCallback((targetPos: THREE.Vector3, targetRad?: number, duration = 600) => {
    const o = orbitRef.current;
    if (!o) return;
    const startTgt = o.tgt.clone();
    const startRad = o.rad;
    const endRad = targetRad ?? o.rad;
    const startTime = performance.now();
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const e = ease(progress);
      o.tgt.lerpVectors(startTgt, targetPos, e);
      o.rad = startRad + (endRad - startRad) * e;
      o.updCam();
      if (progress < 1) animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  // ── Helper: get value from FEM result ──
  const getNodeValue = useCallback((nr: FemNodeResult | undefined): number => {
    if (!nr) return 0;
    switch (resultData) {
      case "vm": return nr.vm;
      case "uc": return nr.uc;
      case "sh": return nr.sh;
      case "sl": return nr.sl;
      case "sb": return nr.sb;
      case "ux": return Math.abs(nr.ux);
      case "uy": return Math.abs(nr.uy);
      case "uz": return Math.abs(nr.uz);
      case "Fx": return Math.abs(nr.Fx);
      case "M": return Math.sqrt((nr.My || 0) ** 2 + (nr.Mz || 0) ** 2);
      default: return nr.vm;
    }
  }, [resultData]);

  // ── Berekend: min/max van resultaten ──
  const { minVal, maxVal } = useMemo(() => {
    let mn = Infinity, mx = 0;
    if (femResults && femResults.length > 0) {
      femResults.forEach(r => { const v = getNodeValue(r); if (v < mn) mn = v; if (v > mx) mx = v; });
    }
    if (!Number.isFinite(mn) || mn === mx) { mn = 0; mx = 1; }
    return { minVal: mn, maxVal: mx };
  }, [femResults, getNodeValue]);

  useEffect(() => { setHistMin(minVal); setHistMax(maxVal); }, [minVal, maxVal]);

  // ═══ THREE.JS SCENE SETUP ═══
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const scene = new THREE.Scene();
    // PLE4Win-stijl: lichtblauwe hemel achtergrond
    scene.background = new THREE.Color(0x87CEEB);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.01, 1000000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    // PLE4Win-stijl verlichting: helder, realistisch
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.0);
    dl.position.set(200, 300, 200); dl.castShadow = true; scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x8899bb, 0.4);
    dl2.position.set(-150, 100, -100); scene.add(dl2);
    const dl3 = new THREE.DirectionalLight(0xffeedd, 0.3);
    dl3.position.set(0, -50, 200); scene.add(dl3);
    const pg = new THREE.Group();
    scene.add(pg);
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    pipeGroupRef.current = pg;

    // ── Orbit controls (custom) ──
    let isD = false, isPan = false, pX = 0, pY = 0;
    let orbTh = Math.PI * 0.35, orbPh = 0.2, orbRad = 16;
    const orbTgt = new THREE.Vector3(0, 0, 0);
    const updCam = () => {
      camera.position.set(
        orbTgt.x + orbRad * Math.sin(orbPh) * Math.cos(orbTh),
        orbTgt.y + orbRad * Math.cos(orbPh),
        orbTgt.z + orbRad * Math.sin(orbPh) * Math.sin(orbTh)
      );
      camera.lookAt(orbTgt);
    };
    orbitRef.current = {
      get th() { return orbTh; }, set th(v: number) { orbTh = v; },
      get ph() { return orbPh; }, set ph(v: number) { orbPh = v; },
      get rad() { return orbRad; }, set rad(v: number) { orbRad = v; },
      tgt: orbTgt, updCam, center: new THREE.Vector3(), maxDim: 16,
    };
    updCam();

    const onDown = (e: any) => { isD = true; const ev = e.touches ? e.touches[0] : e; pX = ev.clientX; pY = ev.clientY; isPan = e.button === 2 || e.button === 1; };
    const onMove = (e: any) => {
      if (!isD) return; const ev = e.touches ? e.touches[0] : e; if (!ev) return;
      const dx = ev.clientX - pX, dy = ev.clientY - pY;
      if (isPan) {
        const cr = new THREE.Vector3(); const cu = new THREE.Vector3();
        cr.setFromMatrixColumn(camera.matrixWorld, 0); cu.setFromMatrixColumn(camera.matrixWorld, 1);
        const s = orbRad * 0.0015;
        orbTgt.add(cr.multiplyScalar(-dx * s)); orbTgt.add(cu.clone().multiplyScalar(dy * s));
      } else {
        orbTh -= dx * 0.005;
        orbPh = Math.max(0.05, Math.min(Math.PI - 0.05, orbPh - dy * 0.005));
      }
      pX = ev.clientX; pY = ev.clientY; updCam();
    };
    const onUp = () => { isD = false; isPan = false; };
    const onWheel = (e: WheelEvent) => { orbRad = Math.max(0.05, orbRad * (e.deltaY > 0 ? 1.12 : 0.88)); updCam(); };
    const onDblClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(pg.children, false);
      if (intersects.length > 0) {
        const hit = intersects[0]; const obj = hit.object as THREE.Mesh;
        if (highlightRef.current) (highlightRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05;
        if (obj.material && (obj.material as any).emissiveIntensity !== undefined) {
          (obj.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xffffff);
          (obj.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
          highlightRef.current = obj;
          setTimeout(() => { if (highlightRef.current === obj) (obj.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05; }, 3000);
        }
        const ud = obj.userData;
        if (ud.nodeId1 || ud.nodeId2 || ud.elementIndex !== undefined) {
          setSelectedInfo({
            elemNr: ud.elementIndex !== undefined ? ud.elementIndex + 1 : undefined,
            id1: ud.nodeId1, id2: ud.nodeId2,
            d: ud.d, t: ud.t, type: ud.type, uc: ud.uc,
            R: ud.R, len: ud.len,
          });
        }
        animateCamera(hit.point.clone(), Math.max(orbRad * 0.35, 2), 500);
      }
    };
    let lastRC = 0;
    const onRD = (e: PointerEvent) => {
      if (e.button === 2) { const now = Date.now(); if (now - lastRC < 400) { e.preventDefault(); const o = orbitRef.current; if (o?.center) { animateCamera(o.center, o.maxDim * 1.4, 600); setSelectedInfo(null); } } lastRC = now; }
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onUp);
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
    renderer.domElement.addEventListener("dblclick", onDblClick);
    renderer.domElement.addEventListener("pointerdown", onRD);
    renderer.domElement.addEventListener("touchstart", onDown, { passive: true });
    renderer.domElement.addEventListener("touchmove", onMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onUp);

    let raf: number;
    const anim = () => { raf = requestAnimationFrame(anim); renderer.render(scene, camera); };
    anim();
    const onResize = () => { if (!el) return; camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
  }, [D, animateCamera]);

  // ═══ BUILD PIPE MESHES ═══
  useEffect(() => {
    const pg = pipeGroupRef.current;
    if (!pg) return;
    while (pg.children.length) pg.remove(pg.children[0]);
    const scale = pipeScale;

    if (nodes && nodes.length > 1) {
      const pts: THREE.Vector3[] = [];
      const useEls: ElementData[] = elements && elements.length > 0
        ? elements : nodes.slice(0, -1).map((_, i) => ({ n1: i, n2: i + 1 }));

      const nodeResultMap = new Map<string, FemNodeResult>();
      const resultSource = (femResults && femResults.length > 0) ? femResults : (dispFallback || []);
      if (resultSource && resultSource.length > 0) resultSource.forEach(r => nodeResultMap.set(r.nodeId, r));

      useEls.forEach((elm, ei) => {
        const n1 = nodes[elm.n1]; const n2 = nodes[elm.n2];
        if (!n1 || !n2) return;
        const p1 = getNodePos(n1); const p2 = getNodePos(n2);
        pts.push(p1, p2);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        if (len <= 0.0001) return;
        const elD = elm.d || D;
        // PLE4Win: correcte diameter per segment — elD/2 in meters, × scale
        const pipeRadius = (elD / 2000) * scale;
        const rCapped = Math.min(pipeRadius, len * 0.4);

        // Kleur
        let color: number;
        let elUC = unity;
        if (colorMode === "config") {
          // PLE4Win config: lichtgrijs metallic
          color = 0xaab0b8;
        } else {
          const nr1 = nodeResultMap.get(n1.id || "");
          const nr2 = nodeResultMap.get(n2.id || "");
          elUC = Math.max(nr1?.uc || 0, nr2?.uc || 0);
          const v1 = getNodeValue(nr1); const v2 = getNodeValue(nr2);
          const elVal = Math.max(v1, v2);
          const range = (histMax - histMin) || 1;
          color = getGradientHex((elVal - histMin) / range);
        }

        const pipeMat = new THREE.MeshStandardMaterial({
          color, metalness: colorMode === "config" ? 0.7 : 0.5,
          roughness: colorMode === "config" ? 0.25 : 0.2,
          emissive: new THREE.Color(color).multiplyScalar(colorMode === "config" ? 0.02 : 0.1),
        });

        // Bocht of recht
        const bR = (elm.R || elm.bendR || n1.bendR || n2.bendR || 0) as number;
        const isTightBend = elm.type === "bend" && bR > 0 && (bR / elD) < 15;

        if (isTightBend) {
          const prevNode = elm.n1 > 0 ? nodes[elm.n1 - 1] : null;
          const nextNode = elm.n2 < nodes.length - 1 ? nodes[elm.n2 + 1] : null;
          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          let cp = mid.clone();
          if (prevNode && nextNode) {
            const pPrev = getNodePos(prevNode); const pNext = getNodePos(nextNode);
            const dirIn = new THREE.Vector3().subVectors(p1, pPrev).normalize();
            const dirOut = new THREE.Vector3().subVectors(pNext, p2).normalize();
            const bisector = new THREE.Vector3().addVectors(dirIn, dirOut).normalize();
            cp = mid.clone().add(bisector.multiplyScalar(-Math.min(len * 0.25, (bR / 1000) * 0.3)));
          }
          const curve = new THREE.CatmullRomCurve3([p1, cp, p2], false, "catmullrom", 0.5);
          const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, rCapped, 16, false), pipeMat);
          mesh.castShadow = true;
          mesh.userData = { elementIndex: ei, nodeId1: n1.id, nodeId2: n2.id, d: elD, t: elm.t || t, type: elm.type, uc: elUC, R: bR, len: len * 1000 };
          pg.add(mesh);
          if (showCasing && !hideOuter) {
            const dpe = elm.dpe || elm.dc || elD * 1.6;
            pg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, (dpe / 2000) * scale, 8, false),
              new THREE.MeshStandardMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.12, side: THREE.DoubleSide })));
          }
        } else {
          const geo = new THREE.CylinderGeometry(rCapped, rCapped, len, 24, 1);
          const mesh = new THREE.Mesh(geo, pipeMat);
          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          mesh.position.copy(mid);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
          mesh.castShadow = true;
          mesh.userData = { elementIndex: ei, nodeId1: n1.id, nodeId2: n2.id, d: elD, t: elm.t || t, type: elm.type, uc: elUC, R: bR, len: len * 1000 };
          pg.add(mesh);
          if (showCasing && !hideOuter) {
            const dpe = elm.dpe || elm.dc || elD * 1.6;
            const rc = (dpe / 2000) * scale;
            const cMesh = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc, len, 12, 1, true),
              new THREE.MeshStandardMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
            cMesh.position.copy(mid);
            cMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            pg.add(cMesh);
          }
        }
      });

      // ── Displaced pipeline overlay ──
      if (showDisplaced && resultSource && resultSource.length > 0) {
        const dS = deformScale;
        useEls.forEach((elm) => {
          const n1 = nodes[elm.n1]; const n2 = nodes[elm.n2]; if (!n1 || !n2) return;
          const r1 = nodeResultMap.get(n1.id || ""); const r2 = nodeResultMap.get(n2.id || "");
          const dp1 = new THREE.Vector3((n1.x + (r1?.ux || 0) * dS) / 1000, ((n1.z || 0) + (r1?.uz || 0) * dS) / 1000, (n1.y + (r1?.uy || 0) * dS) / 1000);
          const dp2 = new THREE.Vector3((n2.x + (r2?.ux || 0) * dS) / 1000, ((n2.z || 0) + (r2?.uz || 0) * dS) / 1000, (n2.y + (r2?.uy || 0) * dS) / 1000);
          const dDir = new THREE.Vector3().subVectors(dp2, dp1); const dLen = dDir.length();
          if (dLen <= 0.0001) return;
          const elDiam = elm.d || D;
          const r = Math.min((elDiam / 2000) * scale, dLen * 0.4);
          const elUC = Math.max(r1?.uc || 0, r2?.uc || 0);
          const range = (histMax - histMin) || 1;
          const v = Math.max(getNodeValue(r1), getNodeValue(r2));
          const dColor = colorMode === "result" ? getGradientHex((v - histMin) / range) : 0x3498db;
          const dMat = new THREE.MeshStandardMaterial({ color: dColor, metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.75, emissive: new THREE.Color(dColor).multiplyScalar(0.15) });
          const dMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dLen, 12), dMat);
          dMesh.position.copy(new THREE.Vector3().addVectors(dp1, dp2).multiplyScalar(0.5));
          dMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dDir.normalize());
          pg.add(dMesh);
        });
        // Maak origineel doorzichtig
        pg.children.forEach((child: any) => {
          if (child.userData?.elementIndex !== undefined && child.material && !child.material.transparent) {
            child.material.transparent = true; child.material.opacity = 0.2;
          }
        });
      }

      // ── Node sphere caps (vul gaten tussen segmenten) ──
      // PLE4Win: de buis ziet er continu uit doordat elk knooppunt een bol heeft
      nodes.forEach((n, ni) => {
        const pos = getNodePos(n);
        const connEl = useEls.find(e => e.n1 === ni || e.n2 === ni);
        if (!connEl) return;
        const elDiam = connEl.d || D;
        const r = (elDiam / 2000) * scale;
        const capR = Math.min(r, 2); // cap niet groter dan 2m visueel

        let capColor: number;
        if (colorMode === "config") {
          capColor = 0xaab0b8;
        } else {
          const nr = nodeResultMap.get(n.id || "");
          const v = getNodeValue(nr);
          const range = (histMax - histMin) || 1;
          capColor = getGradientHex((v - histMin) / range);
        }

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(capR, 12, 12),
          new THREE.MeshStandardMaterial({
            color: capColor, metalness: colorMode === "config" ? 0.7 : 0.5,
            roughness: colorMode === "config" ? 0.25 : 0.2,
          })
        );
        cap.position.copy(pos);
        pg.add(cap);
      });

      // ── Constraints: T-stukken, eindpunten, steunpunten ──
      nodes.forEach((n, ni) => {
        const pos = getNodePos(n);
        const id = n.id || "";
        const connEl = useEls.find(e => e.n1 === ni || e.n2 === ni);
        const elDiam = connEl?.d || n.D0 || D;
        const baseR = (elDiam / 2000) * scale;

        // T-stukken — subtiel gouden ringetje, alleen als Connections aan
        if (teeIdSet.has(id) && showConnections) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(baseR * 1.05, baseR * 0.06, 6, 20),
            new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7, roughness: 0.25 })
          );
          ring.position.copy(pos);
          pg.add(ring);
        }

        // Eindpunten — GEEN blokjes meer. Alleen kleine rode bol als Constraints aan
        if (endpointIdSet.has(id) && showConstraints) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(baseR * 0.2, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.5, roughness: 0.3 })
          );
          dot.position.copy(pos);
          dot.userData = { nodeId1: id, type: "endpoint", cond: endpoints?.[id]?.cond };
          pg.add(dot);
        }

        // Steunpunten — kleine rode bol
        if (supportIdSet.has(id) && showConstraints) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(baseR * 0.2, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.5, roughness: 0.3 })
          );
          dot.position.copy(pos);
          dot.userData = { nodeId1: id, type: "support" };
          pg.add(dot);
        }

        // Polygon points
        if (showPolygonPts) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(baseR * 0.12, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x27ae60 })
          );
          dot.position.copy(pos);
          pg.add(dot);
        }
      });

      // ── Node labels (Idents / Node numbers) ──
      if (showIdents || showNodeNums) {
        nodes.forEach((n, ni) => {
          const id = n.id || "";
          if (!id && !showNodeNums) return;
          // Skip ADIDENT nodes als alleen idents getoond worden (te druk)
          if (showIdents && !showNodeNums && (n as any)._isAdident) return;
          const pos = getNodePos(n);
          const connEl = useEls.find(e => e.n1 === ni || e.n2 === ni);
          const elDiam = connEl?.d || n.D0 || D;
          const baseR = (elDiam / 2000) * scale;
          let label = "";
          if (showNodeNums && showIdents && id) label = `${ni + 1}:${id}`;
          else if (showNodeNums) label = `${ni + 1}`;
          else if (id) label = id;

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const textW = ctx.measureText(label).width;
          canvas.width = 200; canvas.height = 32;
          ctx.clearRect(0, 0, 200, 32);
          ctx.fillStyle = showNodeNums ? "rgba(234,179,8,0.85)" : "rgba(30,41,59,0.8)";
          ctx.roundRect(2, 2, 196, 28, 4);
          ctx.fill();
          ctx.font = "bold 18px monospace";
          ctx.fillStyle = showNodeNums ? "#1a1a2e" : "#e2e8f0";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(label, 100, 16);

          const tex = new THREE.CanvasTexture(canvas);
          tex.minFilter = THREE.LinearFilter;
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
          sprite.position.copy(pos);
          sprite.position.y += baseR * 2;
          const ls = Math.max(baseR * 3, 0.5);
          sprite.scale.set(ls, ls * 0.16, 1);
          pg.add(sprite);
        });
      }

      // ── Bend indicators — subtiele dunne ring op bocht-knooppunten ──
      if (showBendIndicators) {
        const bendNodesSeen = new Set<number>();
        useEls.forEach((elm) => {
          if (elm.type !== "bend") return;
          [elm.n1, elm.n2].forEach(ni => {
            if (bendNodesSeen.has(ni)) return;
            const n = nodes[ni];
            if (!n?.bendR || n.bendR <= 0) return;
            bendNodesSeen.add(ni);
            const pos = getNodePos(n);
            const elForNode = useEls.find(e => e.n1 === ni || e.n2 === ni);
            const elDiam = elForNode?.d || D;
            const baseR = (elDiam / 2000) * scale;
            // Dunne ring, nauwelijks zichtbaar tenzij ingezoomd
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(baseR * 1.08, baseR * 0.04, 6, 16),
              new THREE.MeshStandardMaterial({ color: 0xf39c12, metalness: 0.5, roughness: 0.3 })
            );
            ring.position.copy(pos);
            pg.add(ring);
          });
        });
      }

      // ── Element numbers (groene labels op midden van elk element) ──
      if (showElemNums) {
        useEls.forEach((elm, ei) => {
          const n1 = nodes[elm.n1]; const n2 = nodes[elm.n2];
          if (!n1 || !n2) return;
          const p1 = getNodePos(n1); const p2 = getNodePos(n2);
          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          const elDiam = elm.d || D;
          const baseR = (elDiam / 2000) * scale;
          const label = `${ei + 1}`;

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          canvas.width = 120; canvas.height = 28;
          ctx.clearRect(0, 0, 120, 28);
          ctx.fillStyle = "rgba(34,197,94,0.85)";
          ctx.roundRect(2, 2, 116, 24, 3);
          ctx.fill();
          ctx.font = "bold 16px monospace";
          ctx.fillStyle = "#0a2e0a";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(label, 60, 14);

          const tex = new THREE.CanvasTexture(canvas);
          tex.minFilter = THREE.LinearFilter;
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
          sprite.position.copy(mid);
          sprite.position.y -= baseR * 1.5;
          const ls = Math.max(baseR * 2, 0.3);
          sprite.scale.set(ls, ls * 0.23, 1);
          pg.add(sprite);
        });
      }

      // ── Ground Level ribbon (groen, op werkelijke G-LEVEL hoogte) ──
      // G-LEVEL is een ABSOLUTE Z-coördinaat (mm, relatief t.o.v. origin)
      // Net als node.z: in de scene is Y = Z/1000
      if (showGroundLevel && nodes.length > 2) {
        useEls.forEach((elm) => {
          const n1 = nodes[elm.n1]; const n2 = nodes[elm.n2];
          if (!n1 || !n2) return;
          const p1 = getNodePos(n1); const p2 = getNodePos(n2);
          // G-LEVEL als absolute Y in scene (niet als offset!)
          const glY1 = (coverMap?.[n1.id || ""] ?? 500) / 1000;
          const glY2 = (coverMap?.[n2.id || ""] ?? 500) / 1000;
          const g1 = new THREE.Vector3(p1.x, glY1, p1.z);
          const g2 = new THREE.Vector3(p2.x, glY2, p2.z);
          const segGeo = new THREE.BufferGeometry().setFromPoints([g1, g2]);
          pg.add(new THREE.Line(segGeo, new THREE.LineBasicMaterial({ color: 0x2ecc71 })));
          const verts = new Float32Array([
            g1.x, g1.y, g1.z, g2.x, g2.y, g2.z, p1.x, p1.y, p1.z,
            g2.x, g2.y, g2.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z,
          ]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
          geo.computeVertexNormals();
          pg.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.15, side: THREE.DoubleSide })));
        });
      }

      // ── Water Level ribbon (blauw, op werkelijke W-LEVEL hoogte) ──
      // W-LEVEL is ook een ABSOLUTE Z-coördinaat (mm, relatief t.o.v. origin)
      if (showWaterLevel && nodes.length > 2) {
        useEls.forEach((elm) => {
          const n1 = nodes[elm.n1]; const n2 = nodes[elm.n2];
          if (!n1 || !n2) return;
          const p1 = getNodePos(n1); const p2 = getNodePos(n2);
          const wlY1 = (waterMap?.[n1.id || ""] ?? 0) / 1000;
          const wlY2 = (waterMap?.[n2.id || ""] ?? 0) / 1000;
          const w1 = new THREE.Vector3(p1.x, wlY1, p1.z);
          const w2 = new THREE.Vector3(p2.x, wlY2, p2.z);
          const segGeo = new THREE.BufferGeometry().setFromPoints([w1, w2]);
          pg.add(new THREE.Line(segGeo, new THREE.LineBasicMaterial({ color: 0x3498db })));
          const verts = new Float32Array([
            w1.x, w1.y, w1.z, w2.x, w2.y, w2.z, p1.x, p1.y, p1.z,
            w2.x, w2.y, w2.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z,
          ]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
          geo.computeVertexNormals();
          pg.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.12, side: THREE.DoubleSide })));
        });
      }

      // ── Soil Wizard zones (per-segment gekleurde grondband) ──
      // Toont de horizontale grondveerstijfheid (KLH) als kleurgecodeerde band
      // onder de pipeline, op de G-LEVEL hoogte
      if (showSoilZones && soilWizardResults?.length && nodes.length > 2) {
        const { map: swMap, minKLH, maxKLH } = soilWizMap;
        // Kleurpalet: zacht (lage stijfheid) → stevig (hoge stijfheid)
        // Veen/klei (laag) = warm bruin → Zand = goud → Grind (hoog) = koel grijs-blauw
        const soilColor = (klh: number): number => {
          const t = Math.max(0, Math.min(1, (klh - minKLH) / (maxKLH - minKLH || 1)));
          // bruin(0) → oker(0.3) → goud(0.5) → olijf(0.7) → steenblauw(1.0)
          const colors = [
            { t: 0.0, r: 139, g: 90, b: 43 },   // bruin (veen/zachte klei)
            { t: 0.3, r: 180, g: 140, b: 60 },   // oker
            { t: 0.5, r: 210, g: 180, b: 60 },   // goud (zand)
            { t: 0.7, r: 160, g: 170, b: 100 },  // olijf
            { t: 1.0, r: 120, g: 140, b: 160 },  // steenblauw (grind)
          ];
          for (let i = 0; i < colors.length - 1; i++) {
            if (t <= colors[i + 1].t) {
              const f = (t - colors[i].t) / (colors[i + 1].t - colors[i].t);
              const r = Math.round(colors[i].r + (colors[i + 1].r - colors[i].r) * f);
              const g = Math.round(colors[i].g + (colors[i + 1].g - colors[i].g) * f);
              const b = Math.round(colors[i].b + (colors[i + 1].b - colors[i].b) * f);
              return (r << 16) | (g << 8) | b;
            }
          }
          return 0x788c9c;
        };

        useEls.forEach((elm) => {
          const n1 = nodes[elm.n1]; const n2 = nodes[elm.n2];
          if (!n1 || !n2) return;
          const sw1 = swMap.get(n1.id || ""); const sw2 = swMap.get(n2.id || "");
          if (!sw1 && !sw2) return;
          const klh = ((sw1?.KLH || 0) + (sw2?.KLH || 0)) / (sw1 && sw2 ? 2 : 1);
          const p1 = getNodePos(n1); const p2 = getNodePos(n2);
          // Band op G-LEVEL hoogte, breedte = DPE scaled
          const cover1 = (coverMap?.[n1.id || ""] ?? (sw1?.H_cover || 500)) / 1000;
          const cover2 = (coverMap?.[n2.id || ""] ?? (sw2?.H_cover || 500)) / 1000;
          const elDiam = elm.d || elm.dpe || D;
          const bandW = (elDiam / 1000) * scale * 0.8; // breedte van de band

          // Bereken richting loodrecht op het element (horizontaal vlak)
          const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
          const up = new THREE.Vector3(0, 1, 0);
          const perp = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(bandW / 2);

          // Vier hoekpunten van de band (op G-LEVEL hoogte)
          const g1 = new THREE.Vector3(p1.x, cover1, p1.z);
          const g2 = new THREE.Vector3(p2.x, cover2, p2.z);
          const v1a = g1.clone().add(perp);
          const v1b = g1.clone().sub(perp);
          const v2a = g2.clone().add(perp);
          const v2b = g2.clone().sub(perp);

          const verts = new Float32Array([
            v1a.x, v1a.y, v1a.z, v2a.x, v2a.y, v2a.z, v1b.x, v1b.y, v1b.z,
            v2a.x, v2a.y, v2a.z, v2b.x, v2b.y, v2b.z, v1b.x, v1b.y, v1b.z,
          ]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
          geo.computeVertexNormals();
          const col = soilColor(klh);
          pg.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
          })));
          // Rand-lijn
          const edgeGeo = new THREE.BufferGeometry().setFromPoints([v1a, v2a, v2b, v1b, v1a]);
          pg.add(new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 })));
        });
      }

      // ── Elastic Elements (highlight bochten met hoge R/D) ──
      if (showElasticElements) {
        useEls.forEach((elm) => {
          const bR = elm.R || elm.bendR || nodes[elm.n1]?.bendR || 0;
          const elDiam = elm.d || D;
          if (!bR || (bR / elDiam) < 15) return; // alleen elastische bochten (R/D >= 15)
          const p1 = getNodePos(nodes[elm.n1]); const p2 = getNodePos(nodes[elm.n2]);
          const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          const baseR = (elDiam / 2000) * scale;
          // Gele ring om elastische bocht-elementen
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(baseR * 1.6, baseR * 0.08, 6, 20),
            new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xe74c3c, emissiveIntensity: 0.3, transparent: true, opacity: 0.5 })
          );
          ring.position.copy(mid);
          pg.add(ring);
        });
      }

      // ── Hide outer pipeline: maak buizen + bolkappen onzichtbaar ──
      if (hideOuter) {
        pg.children.forEach((child: any) => {
          if (child instanceof THREE.Mesh && !child.userData?.type) {
            child.visible = false;
          }
        });
      }
      if (pts.length) {
        const box = new THREE.Box3().setFromPoints(pts);
        const sz = new THREE.Vector3(); const ct = new THREE.Vector3();
        box.getSize(sz); box.getCenter(ct);
        const gs = Math.max(sz.x, sz.z) * 2;
        // PLE4Win-stijl: subtiel grid op een licht grondvlak
        const gridH = new THREE.GridHelper(gs, 50, 0x8899aa, 0xaabbcc);
        gridH.position.set(ct.x, box.min.y - 0.5, ct.z); pg.add(gridH);
        const gMesh = new THREE.Mesh(new THREE.PlaneGeometry(gs * 2, gs * 2),
          new THREE.MeshStandardMaterial({ color: 0x95a5a6, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
        gMesh.rotation.x = -Math.PI / 2; gMesh.position.set(ct.x, box.min.y - 0.3, ct.z); pg.add(gMesh);
      }
      pg.add(new THREE.AxesHelper(15));

      // Camera setup
      if (pts.length && orbitRef.current) {
        const box = new THREE.Box3().setFromPoints(pts);
        const center = new THREE.Vector3(); const size = new THREE.Vector3();
        box.getCenter(center); box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fov = (cameraRef.current!.fov * Math.PI) / 180;
        const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;
        const o = orbitRef.current;
        o.center.copy(center); o.maxDim = maxDim;
        if (!cameraInitRef.current) {
          o.tgt.copy(center); o.rad = dist;
          // Voor platte modellen (weinig hoogteverschil): kijk van schuin boven
          const hs = Math.max(size.x, size.z, 0.1);
          const vs = Math.max(size.y, 0.001);
          const flatness = vs / hs;
          // Bij plat model: bijna van boven (ph ~0.3), bij verticaal model: meer van opzij
          o.ph = flatness < 0.05 ? 0.25 : 0.15 + (Math.PI / 3 - 0.15) * Math.min(flatness / 0.3, 1.0);
          // Kijkrichting: langs de langste horizontale as
          o.th = size.z > size.x ? Math.PI * 0.35 : Math.PI / 4;
          cameraInitRef.current = true;
        }
        cameraRef.current!.near = Math.max(0.001, dist * 0.0001);
        cameraRef.current!.far = dist * 50;
        cameraRef.current!.updateProjectionMatrix();
        o.updCam();
      }
      return;
    }
    pg.add(new THREE.AxesHelper(2));
    pg.add(new THREE.GridHelper(200, 100, 0x8899aa, 0xaabbcc));
  }, [nodes, elements, D, t, pipeScale, colorMode, resultData, showCasing, hideOuter, showDisplaced, deformScale,
      showConstraints, showConnections, showIdents, showNodeNums, showElemNums, showBendIndicators,
      showGroundLevel, showWaterLevel, showPolygonPts, showElasticElements, showSoilZones,
      unity, teeIdSet, endpointIdSet, supportIdSet, endpoints, femResults, dispFallback, histMin, histMax, getNodeValue, coverMap, waterMap, soilWizardResults, soilWizMap]);

  // ── View presets ──
  const setView = (v: string) => {
    setViewMode(v);
    const o = orbitRef.current; if (!o) return;
    const target = o.tgt.clone(); const currentRad = o.rad;
    if (v === "3d") { o.th = Math.PI * 0.35; o.ph = 0.2; }
    if (v === "top") { o.th = 0; o.ph = 0.01; }
    if (v === "side") { o.th = Math.PI / 2; o.ph = Math.PI / 2; }
    if (v === "front") { o.th = 0; o.ph = Math.PI / 2; }
    animateCamera(target, currentRad, 500);
    setSelectedInfo(null);
  };

  // ── Copy to clipboard ──
  const copyToClipboard = useCallback(async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      const canvas = renderer.domElement;
      const dataUrl = canvas.toDataURL("image/png");
      const api = (window as any).electronAPI;
      if (api?.copyImageToClipboard) {
        api.copyImageToClipboard(dataUrl);
        alert("3D view gekopieerd naar clipboard");
      } else {
        // Fallback: browser API
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          alert("3D view gekopieerd naar clipboard");
        }
      }
    } catch { alert("Kopiëren mislukt — gebruik Export"); }
  }, []);

  // ── Export as PNG ──
  const exportPNG = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const link = document.createElement("a");
    link.download = `PLE_3D_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  }, []);

  // ── Histogram gradient bar (canvas) ──
  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = histCanvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const w = c.width, h = c.height;
    for (let y = 0; y < h; y++) {
      const t = 1 - y / h;
      const col = getGradientColor(t);
      ctx.fillStyle = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
      ctx.fillRect(0, y, w, 1);
    }
  }, []);

  // ═══ RENDER UI ═══
  return (
    <div style={{ position: "relative", width: "100%", height: mob ? "55vh" : "calc(100vh - 180px)", borderRadius: 12, overflow: "hidden", border: `1px solid ${panelBorder}`, display: "flex" }}>
      {/* ── 3D Canvas ── */}
      <div ref={mountRef} style={{ flex: 1, height: "100%" }} />

      {/* ═══ RIGHT PANEL — PLE4Win-stijl ═══ */}
      <div style={{
        width: mob ? 160 : 180, height: "100%", background: panelBg,
        borderLeft: `1px solid ${panelBorder}`, overflowY: "auto", overflowX: "hidden",
        padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8,
        fontSize: 10, fontFamily: F,
      }}>
        {/* Info header */}
        <div style={{ fontSize: 10, color: accentBlue, fontWeight: 700, borderBottom: `1px solid ${panelBorder}`, paddingBottom: 4 }}>
          Pipeline graphical representation
        </div>

        {/* Element details (als geselecteerd) */}
        {selectedInfo && (
          <div style={{ background: "rgba(52,152,219,0.08)", border: `1px solid rgba(52,152,219,0.2)`, borderRadius: 6, padding: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: accentBlue, fontWeight: 600 }}>Element details</span>
              <button onClick={() => setSelectedInfo(null)} style={{ background: "none", border: "none", color: textDim, cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
            </div>
            {selectedInfo.elemNr && <div style={{ color: textMuted }}>Element nr: <span style={{ color: textBright }}>{selectedInfo.elemNr}</span></div>}
            {selectedInfo.len && <div style={{ color: textMuted }}>Element length: <span style={{ color: textBright }}>{selectedInfo.len.toFixed(2)} mm</span></div>}
            {selectedInfo.t && <div style={{ color: textMuted }}>Wall thickness: <span style={{ color: textBright }}>{selectedInfo.t} mm</span></div>}
            {selectedInfo.type && <div style={{ color: textMuted }}>Type: <span style={{ color: textBright, textTransform: "capitalize" }}>{selectedInfo.type}</span></div>}
            {selectedInfo.d && <div style={{ color: textMuted }}>Diameter: <span style={{ color: textBright }}>{selectedInfo.d} mm</span></div>}
            {selectedInfo.R > 0 && <div style={{ color: textMuted }}>Bend radius: <span style={{ color: textBright }}>{selectedInfo.R} mm</span></div>}
            {selectedInfo.uc !== undefined && <div style={{ color: textMuted }}>UC: <span style={{ color: selectedInfo.uc > 1 ? "#ef4444" : selectedInfo.uc > 0.85 ? "#eab308" : "#22c55e", fontWeight: 600 }}>{selectedInfo.uc.toFixed(3)}</span></div>}
            {soilWizardResults && soilWizardResults.length > 0 && (() => {
              const sw = soilWizMap.map.get(selectedInfo.id1 || "") || soilWizMap.map.get(selectedInfo.id2 || "");
              if (!sw) return null;
              return (
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: "#d4a44a", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Soil Wizard</div>
                  <div style={{ color: textMuted }}>KLH: <span style={{ color: textBright }}>{sw.KLH.toFixed(0)} kN/m²</span></div>
                  <div style={{ color: textMuted }}>KLS: <span style={{ color: textBright }}>{sw.KLS.toFixed(0)} kN/m²</span> KLT: <span style={{ color: textBright }}>{sw.KLT.toFixed(0)} kN/m²</span></div>
                  <div style={{ color: textMuted }}>RH: <span style={{ color: textBright }}>{sw.RH.toFixed(1)} kN/m</span></div>
                  <div style={{ color: textMuted }}>RVS: <span style={{ color: textBright }}>{sw.RVS.toFixed(1)}</span> RVT: <span style={{ color: textBright }}>{sw.RVT.toFixed(1)} kN/m</span></div>
                  <div style={{ color: textMuted }}>Dekking: <span style={{ color: textBright }}>{sw.H_cover.toFixed(0)} mm</span></div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Colour settings (result mode) */}
        {colorMode === "result" && (
          <div style={{ borderBottom: `1px solid ${panelBorder}`, paddingBottom: 6 }}>
            <div style={{ color: textDim, fontSize: 9, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Colour settings</div>
            <div style={{ fontSize: 9, color: textMuted, marginBottom: 4 }}>Data: <span style={{ color: textBright, fontWeight: 600 }}>{resultLabels[resultData]}</span></div>
            <select value={resultData} onChange={e => setResultData(e.target.value as any)} style={{
              width: "100%", padding: "3px 4px", background: "#0f172a", border: `1px solid ${panelBorder}`,
              borderRadius: 4, color: textBright, fontSize: 9, fontFamily: F, marginBottom: 6,
            }}>
              {Object.entries(resultLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>

            {/* Value histogram gradient bar */}
            <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
              <canvas ref={histCanvasRef} width={24} height={120} style={{ borderRadius: 3, border: `1px solid ${panelBorder}` }} />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 8, color: textMuted }}>
                <span>{histMax.toFixed(2)}</span>
                <span>{((histMax + histMin) / 2).toFixed(2)}</span>
                <span>{histMin.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4, fontSize: 8 }}>
              <span style={{ color: textDim }}>Min:</span>
              <input type="number" value={histMin} onChange={e => setHistMin(Number(e.target.value))} style={{ width: 50, background: "#0f172a", border: `1px solid ${panelBorder}`, borderRadius: 3, color: textBright, fontSize: 8, fontFamily: F, padding: "1px 3px" }} />
              <span style={{ color: textDim }}>Max:</span>
              <input type="number" value={histMax} onChange={e => setHistMax(Number(e.target.value))} style={{ width: 50, background: "#0f172a", border: `1px solid ${panelBorder}`, borderRadius: 3, color: textBright, fontSize: 8, fontFamily: F, padding: "1px 3px" }} />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button onClick={() => { setHistMin(minVal); setHistMax(maxVal); }} style={{ flex: 1, padding: "2px 4px", background: "rgba(52,152,219,0.1)", border: `1px solid rgba(52,152,219,0.2)`, borderRadius: 3, color: accentBlue, fontSize: 8, fontFamily: F, cursor: "pointer" }}>Reset</button>
            </div>
          </div>
        )}

        {/* ── Show toggles ── */}
        <div style={{ borderBottom: `1px solid ${panelBorder}`, paddingBottom: 6 }}>
          <div style={{ color: textDim, fontSize: 9, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Show</div>

          {femResults && femResults.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Chk checked={showDisplaced} onChange={setShowDisplaced} label="Displaced pipeline" color="#e74c3c" />
              {showDisplaced && (
                <div style={{ marginLeft: 18, marginTop: 2, display: "flex", alignItems: "center", gap: 4, fontSize: 8 }}>
                  <span style={{ color: textDim }}>factor:</span>
                  <input type="number" value={deformScale} onChange={e => setDeformScale(Number(e.target.value))}
                    style={{ width: 40, background: "#0f172a", border: `1px solid ${panelBorder}`, borderRadius: 3, color: "#e74c3c", fontSize: 8, fontFamily: F, padding: "1px 3px" }} />
                </div>
              )}
            </div>
          )}
          <Chk checked={hideOuter} onChange={setHideOuter} label="Hide outer pipeline" />
          <div style={{ height: 4 }} />
          <Chk checked={showNodeNums} onChange={setShowNodeNums} label="Node numbers" color="#eab308" />
          <Chk checked={showElemNums} onChange={setShowElemNums} label="Element numbers" color="#22c55e" />
          <div style={{ height: 4 }} />
          <Chk checked={showGroundLevel} onChange={setShowGroundLevel} label="Ground Level" />
          <Chk checked={showWaterLevel} onChange={setShowWaterLevel} label="Water Level" />
          {soilWizardResults && soilWizardResults.length > 0 && (
            <Chk checked={showSoilZones} onChange={setShowSoilZones} label="Soil Zones (KLH)" color="#d4a44a" />
          )}
          {showSoilZones && soilWizardResults && soilWizardResults.length > 0 && (
            <div style={{ marginLeft: 18, marginTop: 2, marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8 }}>
                <div style={{ width: 80, height: 8, borderRadius: 2, background: "linear-gradient(to right, #8b5a2b, #b48c3c, #d2b43c, #a0aa64, #788ca0)", border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: 80, fontSize: 7, color: textDim, marginTop: 1 }}>
                <span>{soilWizMap.minKLH.toFixed(0)}</span>
                <span style={{ color: textMuted }}>kN/m²</span>
                <span>{soilWizMap.maxKLH.toFixed(0)}</span>
              </div>
            </div>
          )}
          <Chk checked={showPolygonPts} onChange={setShowPolygonPts} label="Polygon Points" />
          <Chk checked={showBendIndicators} onChange={setShowBendIndicators} label="Bend Indicators" />
          <Chk checked={showIdents} onChange={setShowIdents} label="Idents" />
          <Chk checked={showConstraints} onChange={setShowConstraints} label="Constraints" />
          <Chk checked={showConnections} onChange={setShowConnections} label="Connections" />
          <Chk checked={showElasticElements} onChange={setShowElasticElements} label="Elastic Elements" />
          <Chk checked={showCasing} onChange={setShowCasing} label="PE mantel" color="#2c3e50" />
          <div style={{ height: 4 }} />
          <Chk checked={isOrtho} onChange={setIsOrtho} label="Orthographic projection" />
        </div>

        {/* ── Pipe scale ── */}
        <div>
          <div style={{ color: textDim, fontSize: 8, marginBottom: 2 }}>Schaal {pipeScale}×</div>
          <input type="range" min={1} max={30} value={pipeScale} onChange={e => setPipeScale(Number(e.target.value))} style={{ width: "100%", accentColor: accentBlue }} />
        </div>

        {/* ── Buttons ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${panelBorder}` }}>
          {[
            { label: "Save", action: exportPNG },
            { label: "Print", action: () => window.print() },
            { label: "Clipboard", action: copyToClipboard },
            { label: "Export", action: exportPNG },
          ].map(b => (
            <button key={b.label} onClick={b.action} style={{
              padding: "4px 8px", background: "rgba(52,152,219,0.08)",
              border: `1px solid rgba(52,152,219,0.2)`, borderRadius: 4,
              color: accentBlue, fontSize: 9, fontFamily: F, cursor: "pointer",
              textAlign: "left",
            }}>{b.label}</button>
          ))}
        </div>
      </div>

      {/* ═══ VIEW BUTTONS — compact, rechtsboven ═══ */}
      <div style={{
        position: "absolute", top: 8, right: mob ? 188 : 228, zIndex: 10,
        display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end",
      }}>
        <div style={{ display: "flex", gap: 2 }}>
          {[
            { l: "3D", v: "3d" }, { l: "Top", v: "top" }, { l: "Side", v: "side" }, { l: "Front", v: "front" },
          ].map(b => (
            <button key={b.v} onClick={() => setView(b.v)} style={{
              padding: "4px 8px", background: viewMode === b.v ? "rgba(52,152,219,0.25)" : "rgba(255,255,255,0.85)",
              border: `1px solid ${viewMode === b.v ? accentBlue : "#bbb"}`, borderRadius: 4,
              color: viewMode === b.v ? accentBlue : "#555",
              fontSize: 9, fontWeight: 600, fontFamily: F, cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }}>{b.l}</button>
          ))}
        </div>
        <button onClick={() => setColorMode(colorMode === "config" ? "result" : "config")} style={{
          padding: "3px 10px", background: colorMode === "result" ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.85)",
          border: `1px solid ${colorMode === "result" ? "#eab308" : "#bbb"}`, borderRadius: 4,
          color: colorMode === "result" ? "#b8860b" : "#555", fontSize: 9, fontFamily: F, cursor: "pointer",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}>{colorMode === "config" ? "Config" : "Result"}</button>
      </div>

      {/* ═══ HUD top-left ═══ */}
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto", padding: "5px 12px", background: "rgba(255,255,255,0.9)", border: "1px solid #ccd", borderRadius: 6, backdropFilter: "blur(8px)", fontFamily: F, fontSize: 10, display: "flex", gap: 10, alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>
          <span style={{ color: "#1a1a2e", fontWeight: 600 }}>Ø{D}×{t}mm</span>
          <span style={{ color: "#ccc" }}>|</span>
          <span style={{ color: "#555" }}>{nodes?.length || 0} nodes</span>
          <span style={{ color: "#ccc" }}>|</span>
          <span style={{ color: "#555" }}>{matName}</span>
          <span style={{ color: "#ccc" }}>|</span>
          <span style={{ color: unity < 0.85 ? "#22c55e" : unity < 1 ? "#eab308" : "#ef4444", fontWeight: 600 }}>UC={unity.toFixed(3)}</span>
        </div>
      </div>

      {/* ═══ Controls hint bottom ═══ */}
      <div style={{ position: "absolute", bottom: 6, left: 8, zIndex: 10, fontSize: 8, color: "#5a6a7a", fontFamily: F, background: "rgba(255,255,255,0.7)", padding: "2px 8px", borderRadius: 4 }}>
        Slepen = draaien · Rechts = pannen · Scroll = zoom · 2×klik = focus · Rechts 2× = reset
      </div>

      {/* Material info bottom-right */}
      <div style={{ position: "absolute", bottom: 6, right: mob ? 188 : 228, zIndex: 10, fontSize: 8, color: "#5a6a7a", fontFamily: F, background: "rgba(255,255,255,0.7)", padding: "2px 8px", borderRadius: 4 }}>
        {matName} | Pi={Pi}bar | ΔT={dT}°C | σvm={vm.toFixed(1)}MPa
      </div>
    </div>
  );
}
