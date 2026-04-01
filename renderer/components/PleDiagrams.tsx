"use client";
import React, { useMemo, useState, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PLE DIAGRAMS — PLE4Win-stijl resultaatdiagrammen langs de leidingas
   
   Toont:
   - INTFOR: Interne krachten (F-AX, F-LAT, M-BEN, M-TORS)
   - SOILREA: Bodemreacties (R-AX, R-LAT, R-AX/F%, R-LAT/RP%)
   - CSTRMAX: Spanningen per element (MISES-M, SHOOP-M, TRESCA-M)
   - DISPLAC: Verplaatsingen (U-X, U-Y, U-Z)
   
   Layout: gestapelde diagrammen zoals PLE4Win's result graphs,
   met gedeelde X-as (afstand langs leiding) en ident-labels.
   ═══════════════════════════════════════════════════════════════════════════ */

interface NodeData {
  id?: string; x: number; y: number; z?: number;
}
interface ElementData {
  n1: number; n2: number;
}
interface IntforRow {
  elem: number; fAx: number; fLat: number; phiLat: number;
  mTors: number; mBen: number; phiMb: number;
}
interface SoilreaRow {
  elem: number; rAx: number; rLat: number; phiLat: number;
  rTors: number; rAxF: number; rLatRP: number; rTRVT: number;
}
interface CstrmaxRow {
  elementIndex: number; vm?: number; sh?: number;
}
interface DisplRow {
  nodeId: string; ux: number; uy: number; uz: number;
}

interface Props {
  nodes: NodeData[];
  elements: ElementData[];
  intfor?: IntforRow[];
  soilrea?: SoilreaRow[];
  cstrmax?: CstrmaxRow[];
  displac?: DisplRow[];
  css: {
    bg: string; text: string; muted: string; dim: string;
    border: string; accent: string; green: string; yellow: string;
    red: string; mono: string;
  };
}

/* ─── Cumulative distance along pipeline ─── */
function cumDist(nodes: NodeData[], elements: ElementData[]): number[] {
  const d = new Array(nodes.length).fill(0);
  const visited = new Set<number>([elements[0]?.n1 ?? 0]);
  for (const el of elements) {
    const a = nodes[el.n1], b = nodes[el.n2];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!visited.has(el.n2)) {
      d[el.n2] = d[el.n1] + len;
      visited.add(el.n2);
    }
  }
  return d;
}

/* ─── Generic axis-aligned diagram (SVG) ─── */
function AxisDiagram({
  title, unit, data, xPositions, maxDist,
  color, fillColor, css, height = 130,
  showZeroLine = true, invertY = false,
}: {
  title: string; unit: string;
  data: { x: number; y: number }[];
  xPositions?: number[];
  maxDist: number;
  color: string; fillColor: string;
  css: Props["css"]; height?: number;
  showZeroLine?: boolean; invertY?: boolean;
}) {
  const W = 1000, H = height;
  const margin = { left: 70, right: 20, top: 24, bottom: 20 };
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  if (data.length === 0) return null;

  let minY = 0, maxY = 0;
  for (const p of data) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Ensure some range
  if (maxY - minY < 1e-6) { minY -= 1; maxY += 1; }
  // Symmetric around zero if values cross zero
  if (minY < 0 && maxY > 0) {
    const absMax = Math.max(Math.abs(minY), Math.abs(maxY));
    minY = -absMax; maxY = absMax;
  }
  const pad = (maxY - minY) * 0.1;
  minY -= pad; maxY += pad;

  const tx = (d: number) => margin.left + (d / maxDist) * iW;
  const ty = (v: number) => {
    const norm = (v - minY) / (maxY - minY);
    return invertY
      ? margin.top + norm * iH
      : margin.top + (1 - norm) * iH;
  };

  // Build path
  const pts = data.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`);
  const linePath = `M${pts.join("L")}`;

  // Fill area (to zero line)
  const zeroY = ty(0);
  const fillPath = `M${tx(data[0].x).toFixed(1)},${zeroY.toFixed(1)}L${pts.join("L")}L${tx(data[data.length - 1].x).toFixed(1)},${zeroY.toFixed(1)}Z`;

  // Y-axis ticks
  const nTicks = 5;
  const yStep = (maxY - minY) / nTicks;
  const yTicks: number[] = [];
  for (let i = 0; i <= nTicks; i++) yTicks.push(minY + i * yStep);

  // Format value
  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    if (abs >= 1) return v.toFixed(1);
    if (abs >= 0.01) return v.toFixed(2);
    return v.toFixed(3);
  };

  // Find max/min point for annotation
  let maxPt = data[0], minPt = data[0];
  for (const p of data) {
    if (p.y > maxPt.y) maxPt = p;
    if (p.y < minPt.y) minPt = p;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Background */}
      <rect width={W} height={H} fill="rgba(10,15,26,0.5)" rx={4} />

      {/* Title */}
      <text x={margin.left} y={14} fill={css.text} fontSize={11}
        fontFamily={css.mono} fontWeight={600}>
        {title}
        <tspan fill={css.dim} fontWeight={400}> [{unit}]</tspan>
      </text>

      {/* Grid */}
      {yTicks.map((v, i) => (
        <g key={`yt-${i}`}>
          <line x1={margin.left} y1={ty(v)} x2={W - margin.right} y2={ty(v)}
            stroke={css.border} strokeWidth={0.3} strokeDasharray={v === 0 ? "none" : "2,2"} />
          <text x={margin.left - 6} y={ty(v) + 3} textAnchor="end"
            fill={css.dim} fontSize={8} fontFamily={css.mono}>
            {fmt(v)}
          </text>
        </g>
      ))}

      {/* Zero line */}
      {showZeroLine && minY < 0 && maxY > 0 && (
        <line x1={margin.left} y1={zeroY} x2={W - margin.right} y2={zeroY}
          stroke={css.muted} strokeWidth={0.8} />
      )}

      {/* Fill area */}
      <path d={fillPath} fill={fillColor} />

      {/* Data line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />

      {/* Max/Min annotations */}
      {Math.abs(maxPt.y) > 1e-3 && (
        <g>
          <circle cx={tx(maxPt.x)} cy={ty(maxPt.y)} r={3} fill={color} />
          <text x={tx(maxPt.x)} y={ty(maxPt.y) - 8} textAnchor="middle"
            fill={color} fontSize={8} fontFamily={css.mono} fontWeight={600}>
            {fmt(maxPt.y)}
          </text>
        </g>
      )}
      {Math.abs(minPt.y) > 1e-3 && minPt !== maxPt && (
        <g>
          <circle cx={tx(minPt.x)} cy={ty(minPt.y)} r={3} fill={color} />
          <text x={tx(minPt.x)} y={ty(minPt.y) + 14} textAnchor="middle"
            fill={color} fontSize={8} fontFamily={css.mono} fontWeight={600}>
            {fmt(minPt.y)}
          </text>
        </g>
      )}

      {/* Clip frame */}
      <rect x={margin.left} y={margin.top} width={iW} height={iH}
        fill="none" stroke={css.border} strokeWidth={0.5} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

type DiagramSet = "intfor" | "soilrea" | "stress" | "displac";

export default function PleDiagrams({ nodes, elements, intfor, soilrea, cstrmax, displac, css }: Props) {
  const [activeSet, setActiveSet] = useState<DiagramSet>("intfor");

  const dist = useMemo(() => cumDist(nodes, elements), [nodes, elements]);
  const maxD = useMemo(() => Math.max(...dist, 1), [dist]);

  // Element midpoint distances
  const elemMidDist = useMemo(() =>
    elements.map(el => (dist[el.n1] + dist[el.n2]) / 2),
    [elements, dist]
  );

  // ─── INTFOR diagrams ───
  const intforDiagrams = useMemo(() => {
    if (!intfor?.length) return null;
    const mk = (field: keyof IntforRow) =>
      intfor.map((r, i) => ({ x: elemMidDist[r.elem] ?? elemMidDist[i] ?? 0, y: r[field] as number }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y))
        .sort((a, b) => a.x - b.x);
    return {
      fAx:  mk("fAx"),
      fLat: mk("fLat"),
      mBen: mk("mBen"),
      mTors: mk("mTors"),
    };
  }, [intfor, elemMidDist]);

  // ─── SOILREA diagrams ───
  const soilreaDiagrams = useMemo(() => {
    if (!soilrea?.length) return null;
    const mk = (field: keyof SoilreaRow) =>
      soilrea.map((r, i) => ({ x: elemMidDist[r.elem] ?? elemMidDist[i] ?? 0, y: r[field] as number }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y))
        .sort((a, b) => a.x - b.x);
    return {
      rAx:    mk("rAx"),
      rLat:   mk("rLat"),
      rAxF:   mk("rAxF"),
      rLatRP: mk("rLatRP"),
    };
  }, [soilrea, elemMidDist]);

  // ─── CSTRMAX diagrams ───
  const stressDiagrams = useMemo(() => {
    if (!cstrmax?.length) return null;
    return {
      vm: cstrmax.map((r, i) => ({
        x: elemMidDist[r.elementIndex] ?? elemMidDist[i] ?? 0,
        y: r.vm || 0,
      })).filter(p => p.y > 0).sort((a, b) => a.x - b.x),
      sh: cstrmax.map((r, i) => ({
        x: elemMidDist[r.elementIndex] ?? elemMidDist[i] ?? 0,
        y: r.sh || 0,
      })).filter(p => Math.abs(p.y) > 0).sort((a, b) => a.x - b.x),
    };
  }, [cstrmax, elemMidDist]);

  // ─── DISPLAC diagrams ───
  const displacDiagrams = useMemo(() => {
    if (!displac?.length) return null;
    const nodeMap = new Map<string, number>();
    nodes.forEach((n, i) => { if (n.id) nodeMap.set(n.id, i); });
    const mk = (field: "ux" | "uy" | "uz") =>
      displac.map(r => {
        const idx = nodeMap.get(r.nodeId);
        if (idx === undefined) return null;
        return { x: dist[idx], y: r[field] };
      }).filter((p): p is { x: number; y: number } => p !== null && !isNaN(p.x))
        .sort((a, b) => a.x - b.x);
    return { ux: mk("ux"), uy: mk("uy"), uz: mk("uz") };
  }, [displac, nodes, dist]);

  const hasIntfor = intfor && intfor.length > 0;
  const hasSoilrea = soilrea && soilrea.length > 0;
  const hasStress = cstrmax && cstrmax.length > 0;
  const hasDisplac = displac && displac.length > 0;
  const hasAny = hasIntfor || hasSoilrea || hasStress || hasDisplac;

  if (!hasAny) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: css.muted, fontFamily: css.mono, fontSize: 12,
        border: `1px dashed ${css.border}`, borderRadius: 8, margin: "16px 0" }}>
        Geen PLE4Win resultaatdata beschikbaar — importeer een Excel met INTFOR/SOILREA/CSTRMAX/DISPLAC sheets
      </div>
    );
  }

  const tabBtn = (id: DiagramSet, label: string, available: boolean) => (
    <button
      key={id}
      disabled={!available}
      onClick={() => setActiveSet(id)}
      style={{
        padding: "5px 12px", fontSize: 10, fontFamily: css.mono,
        background: activeSet === id ? "rgba(59,130,246,0.15)" : "transparent",
        border: `1px solid ${activeSet === id ? css.accent : available ? css.border : "transparent"}`,
        borderRadius: 5, cursor: available ? "pointer" : "default",
        color: !available ? css.dim : activeSet === id ? css.accent : css.muted,
        fontWeight: activeSet === id ? 700 : 400,
        opacity: available ? 1 : 0.4,
      }}>
      {label}
    </button>
  );

  return (
    <div style={{ margin: "8px 0" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 10px", flexWrap: "wrap",
        background: "rgba(15,23,42,0.5)", borderRadius: "8px 8px 0 0",
        border: `1px solid ${css.border}`, borderBottom: "none",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: css.muted, fontFamily: css.mono, fontWeight: 700, marginRight: 8 }}>
          DIAGRAMMEN
        </span>
        <div style={{ width: 1, height: 16, background: css.border }} />
        {tabBtn("intfor", "Interne krachten", !!hasIntfor)}
        {tabBtn("soilrea", "Bodemreacties", !!hasSoilrea)}
        {tabBtn("stress", "Spanningen", !!hasStress)}
        {tabBtn("displac", "Verplaatsingen", !!hasDisplac)}
      </div>

      {/* Diagram area */}
      <div style={{
        border: `1px solid ${css.border}`, borderRadius: "0 0 8px 8px",
        background: "#0a0f1a", padding: "8px 0",
      }}>
        {/* ─── INTFOR ─── */}
        {activeSet === "intfor" && intforDiagrams && (<>
          <AxisDiagram title="Axiaalkracht (F-AX)" unit="N" data={intforDiagrams.fAx}
            maxDist={maxD} color="#3b82f6" fillColor="rgba(59,130,246,0.08)" css={css} />
          <AxisDiagram title="Dwarskracht (F-LAT)" unit="N" data={intforDiagrams.fLat}
            maxDist={maxD} color="#f59e0b" fillColor="rgba(245,158,11,0.08)" css={css} />
          <AxisDiagram title="Buigmoment (M-BEN)" unit="N·mm" data={intforDiagrams.mBen}
            maxDist={maxD} color="#ef4444" fillColor="rgba(239,68,68,0.08)" css={css} />
          <AxisDiagram title="Torsie (M-TORS)" unit="N·mm" data={intforDiagrams.mTors}
            maxDist={maxD} color="#8b5cf6" fillColor="rgba(139,92,246,0.08)" css={css} />
        </>)}

        {/* ─── SOILREA ─── */}
        {activeSet === "soilrea" && soilreaDiagrams && (<>
          <AxisDiagram title="Wrijvingsreactie (R-AX)" unit="N/mm" data={soilreaDiagrams.rAx}
            maxDist={maxD} color="#22c55e" fillColor="rgba(34,197,94,0.08)" css={css} />
          <AxisDiagram title="Laterale reactie (R-LAT)" unit="N/mm" data={soilreaDiagrams.rLat}
            maxDist={maxD} color="#06b6d4" fillColor="rgba(6,182,212,0.08)" css={css} />
          <AxisDiagram title="Benutting wrijving (R-AX/F)" unit="%" data={soilreaDiagrams.rAxF}
            maxDist={maxD} color="#f97316" fillColor="rgba(249,115,22,0.08)" css={css} />
          <AxisDiagram title="Benutting lateraal (R-LAT/RP)" unit="%" data={soilreaDiagrams.rLatRP}
            maxDist={maxD} color="#ec4899" fillColor="rgba(236,72,153,0.08)" css={css} />
        </>)}

        {/* ─── STRESS ─── */}
        {activeSet === "stress" && stressDiagrams && (<>
          <AxisDiagram title="Von Mises (MISES-M)" unit="MPa" data={stressDiagrams.vm}
            maxDist={maxD} color="#ef4444" fillColor="rgba(239,68,68,0.1)" css={css} height={160} />
          <AxisDiagram title="Hoopspanning (SHOOP-M)" unit="MPa" data={stressDiagrams.sh}
            maxDist={maxD} color="#3b82f6" fillColor="rgba(59,130,246,0.1)" css={css} height={160} />
        </>)}

        {/* ─── DISPLAC ─── */}
        {activeSet === "displac" && displacDiagrams && (<>
          <AxisDiagram title="Verplaatsing X (U-X)" unit="mm" data={displacDiagrams.ux}
            maxDist={maxD} color="#3b82f6" fillColor="rgba(59,130,246,0.08)" css={css} />
          <AxisDiagram title="Verplaatsing Y (U-Y)" unit="mm" data={displacDiagrams.uy}
            maxDist={maxD} color="#22c55e" fillColor="rgba(34,197,94,0.08)" css={css} />
          <AxisDiagram title="Verplaatsing Z (U-Z)" unit="mm" data={displacDiagrams.uz}
            maxDist={maxD} color="#ef4444" fillColor="rgba(239,68,68,0.08)" css={css} />
        </>)}

        {/* X-axis label */}
        <div style={{
          textAlign: "center", padding: "4px 0 2px",
          fontSize: 9, fontFamily: css.mono, color: css.dim,
        }}>
          Afstand langs leiding-as [mm]
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex", gap: 16, padding: "5px 10px", marginTop: 3,
        fontSize: 8, fontFamily: css.mono, color: css.dim, flexWrap: "wrap",
      }}>
        {hasIntfor && <span>INTFOR: {intfor!.length} elementen</span>}
        {hasSoilrea && <span>SOILREA: {soilrea!.length} elementen</span>}
        {hasStress && <span>CSTRMAX: {cstrmax!.length} elementen</span>}
        {hasDisplac && <span>DISPLAC: {displac!.length} knopen</span>}
      </div>
    </div>
  );
}
