"use client";
import React, { useMemo, useRef, useState, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PLE PIPE DRAW — Pipeline Schematic Drawing (PLE4Win Graphics Module 4.3)
   
   Replicates PLE4Win's PipeDraw facility:
   - Horizontal alignment drawing (plan view, X/Y projection)
   - Vertical alignment drawing (profile view, distance along axis vs Z)
   
   With toggleable overlays:
   - Polygon points (node markers with ident labels)
   - Bend indications (bend symbol + radius)
   - Node numbers / element numbers
   - Constraints (boundary conditions, supports)
   - Ground level (G-LEVEL) and water level (W-LEVEL)
   - Diameter changes
   - T-piece connections
   
   Props:
     nodes: Array<{ id, x, y, z, bendR?, etyp? }>
     elements: Array<{ n1, n2, d, t, type, R?, dc? }>
     boundaryConditions?: Array<{ nodeIndex, type, ... }>
     soilSprings?: Array<{ nodeIndex, ... }>
     glevel?: Array<{ nodeIndex, z }>   // ground level at nodes
     wlevel?: Array<{ nodeIndex, z }>   // water level at nodes
     projectName?: string
     css: theme object
   ═══════════════════════════════════════════════════════════════════════════ */

interface PDNode {
  id: string;
  x: number; y: number; z: number;
  bendR?: number | null;
  etyp?: string;
}

interface PDElement {
  n1: number; n2: number;
  d: number; t: number;
  type: string;
  R?: number;
  dc?: number;
}

interface BoundaryCondition {
  nodeIndex: number;
  type: string; // "fixed", "free", "infinite", "spring"
  kx?: number; ky?: number; kz?: number;
}

interface PlePipeDrawProps {
  nodes: PDNode[];
  elements: PDElement[];
  boundaryConditions?: BoundaryCondition[];
  soilSprings?: any[];
  glevel?: { nodeIndex: number; z: number }[];
  wlevel?: { nodeIndex: number; z: number }[];
  projectName?: string;
  css: {
    bg: string; text: string; muted: string; dim: string;
    border: string; accent: string; green: string; yellow: string;
    red: string; mono: string;
  };
}

/* ─── Helper: compute cumulative distance along pipeline axis ──────────── */
function computeCumulativeDistances(nodes: PDNode[], elements: PDElement[]): number[] {
  const dist: number[] = new Array(nodes.length).fill(0);
  const visited = new Set<number>();
  
  // Walk through elements in order
  if (elements.length > 0) {
    visited.add(elements[0].n1);
    for (const el of elements) {
      const n1 = nodes[el.n1];
      const n2 = nodes[el.n2];
      if (!n1 || !n2) continue;
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dz = (n2.z || 0) - (n1.z || 0);
      const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!visited.has(el.n2)) {
        dist[el.n2] = dist[el.n1] + segLen;
        visited.add(el.n2);
      }
    }
  }
  return dist;
}

/* ─── Helper: format length ─────────────────────────────────────────────── */
function fmtLen(mm: number): string {
  if (Math.abs(mm) >= 1000) return `${(mm / 1000).toFixed(1)}m`;
  return `${Math.round(mm)}`;
}

function fmtCoord(mm: number): string {
  return (mm / 1000).toFixed(2);
}

/* ─── Label collision avoidance ─────────────────────────────────────────── */
interface Rect { x: number; y: number; w: number; h: number }
function overlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PlePipeDraw({
  nodes, elements, boundaryConditions = [], soilSprings = [],
  glevel = [], wlevel = [], projectName, css
}: PlePipeDrawProps) {
  
  const planSvgRef = useRef<SVGSVGElement>(null);
  const profileSvgRef = useRef<SVGSVGElement>(null);
  
  // ─── View toggles (matching PLE4Win's PipeDraw options) ───
  const [showIdents, setShowIdents] = useState(true);
  const [showBends, setShowBends] = useState(true);
  const [showNodes, setShowNodes] = useState(true);
  const [showElements, setShowElements] = useState(false);
  const [showConstraints, setShowConstraints] = useState(true);
  const [showDiameters, setShowDiameters] = useState(true);
  const [showGroundLevel, setShowGroundLevel] = useState(true);
  const [showWaterLevel, setShowWaterLevel] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showTees, setShowTees] = useState(true);
  const [activeView, setActiveView] = useState<"plan" | "profile" | "both">("both");

  // ─── Pan/zoom state per view ───
  const [planZoom, setPlanZoom] = useState(1);
  const [planPan, setPlanPan] = useState({ x: 0, y: 0 });
  const [profileZoom, setProfileZoom] = useState(1);
  const [profilePan, setProfilePan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<null | { view: "plan" | "profile"; startX: number; startY: number; startPanX: number; startPanY: number }>(null);

  // ─── Cumulative distances for profile view ───
  const cumDist = useMemo(() => computeCumulativeDistances(nodes, elements), [nodes, elements]);

  /* ═════════════════════════════════════════════════════════════════════════
     PLAN VIEW (Horizontal Alignment) — top-down X/Y projection
     ═════════════════════════════════════════════════════════════════════════ */
  const planDrawing = useMemo(() => {
    if (!nodes || nodes.length === 0) return null;

    // Bounding box in X/Y (mm)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    
    const W = 1100, H = 500;
    const margin = 80;
    const innerW = W - 2 * margin;
    const innerH = H - 2 * margin;
    const scale = Math.min(innerW / spanX, innerH / spanY);
    
    // Transform: model coords → SVG coords
    const tx = (mx: number) => margin + (mx - minX) * scale;
    const ty = (my: number) => H - margin - (my - minY) * scale; // Y flipped: north = up

    const placed: Rect[] = [];
    const lines: React.ReactNode[] = [];
    const markers: React.ReactNode[] = [];
    const labels: React.ReactNode[] = [];

    // ─── Pipeline segments ───
    elements.forEach((el, i) => {
      const n1 = nodes[el.n1];
      const n2 = nodes[el.n2];
      if (!n1 || !n2) return;

      const x1 = tx(n1.x), y1 = ty(n1.y);
      const x2 = tx(n2.x), y2 = ty(n2.y);
      
      const isTee = el.type === "tee";
      const isBend = el.type === "bend";
      
      lines.push(
        <line key={`seg-${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={isTee ? "#4ade80" : "#cbd5e1"}
          strokeWidth={isTee ? 2.5 : 2}
          strokeLinecap="round"
        />
      );

      // Element number at midpoint
      if (showElements) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        labels.push(
          <text key={`elnum-${i}`} x={mx} y={my - 6}
            textAnchor="middle" fill="#64748b" fontSize={6}
            fontFamily={css.mono} opacity={0.7}>
            E{i + 1}
          </text>
        );
      }

      // Dimension line (element length)
      if (showDimensions) {
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dz = (n2.z || 0) - (n1.z || 0);
        const len3d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len3d > 100) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const px = x2 - x1, py = y2 - y1;
          const pLen = Math.sqrt(px * px + py * py);
          if (pLen > 20) {
            const perpX = -py / pLen;
            const perpY = px / pLen;
            const off = 12;
            const lx = mx + perpX * off;
            const ly = my + perpY * off;
            const lenStr = fmtLen(len3d);
            const tw = lenStr.length * 4.5 + 4;
            const candidate: Rect = { x: lx - tw / 2, y: ly - 5, w: tw, h: 10 };
            
            if (!placed.some(p => overlap(p, candidate))) {
              placed.push(candidate);
              // Dimension line
              const d1x = x1 + perpX * off, d1y = y1 + perpY * off;
              const d2x = x2 + perpX * off, d2y = y2 + perpY * off;
              labels.push(
                <g key={`pdim-${i}`}>
                  <line x1={x1 + perpX * 3} y1={y1 + perpY * 3}
                        x2={d1x + perpX * 2} y2={d1y + perpY * 2}
                        stroke="#475569" strokeWidth={0.3} strokeDasharray="1.5,1.5" />
                  <line x1={x2 + perpX * 3} y1={y2 + perpY * 3}
                        x2={d2x + perpX * 2} y2={d2y + perpY * 2}
                        stroke="#475569" strokeWidth={0.3} strokeDasharray="1.5,1.5" />
                  <line x1={d1x} y1={d1y} x2={d2x} y2={d2y}
                        stroke="#475569" strokeWidth={0.4} />
                  {/* Ticks */}
                  <line x1={d1x - perpX * 3} y1={d1y - perpY * 3}
                        x2={d1x + perpX * 3} y2={d1y + perpY * 3}
                        stroke="#475569" strokeWidth={0.5} />
                  <line x1={d2x - perpX * 3} y1={d2y - perpY * 3}
                        x2={d2x + perpX * 3} y2={d2y + perpY * 3}
                        stroke="#475569" strokeWidth={0.5} />
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
                        fill="#94a3b8" fontSize={6.5} fontFamily={css.mono}
                        transform={`rotate(${Math.atan2(py, px) * 180 / Math.PI}, ${lx}, ${ly})`}>
                    {lenStr}
                  </text>
                </g>
              );
            }
          }
        }
      }
    });

    // ─── Node markers and labels ───
    nodes.forEach((n, i) => {
      const sx = tx(n.x), sy = ty(n.y);
      const isBend = n.bendR && n.bendR > 0;
      const isTee = n.etyp === "tee" || n.id.startsWith("T") || n.id.startsWith("t");
      const isEndpoint = i === 0 || i === nodes.length - 1;
      
      // ─── Boundary condition symbols (PLE4Win style) ───
      if (showConstraints) {
        const bc = boundaryConditions.find(b => b.nodeIndex === i);
        if (bc) {
          if (bc.type === "fixed") {
            // Fixed: filled triangle pointing down
            markers.push(
              <g key={`bc-${i}`}>
                <polygon points={`${sx - 7},${sy + 3} ${sx + 7},${sy + 3} ${sx},${sy + 12}`}
                  fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" strokeWidth={0.8} />
                <line x1={sx - 8} y1={sy + 12} x2={sx + 8} y2={sy + 12}
                  stroke="#ef4444" strokeWidth={1} />
                {/* Ground hatch */}
                {[-6, -2, 2, 6].map(dx => (
                  <line key={dx} x1={sx + dx} y1={sy + 12} x2={sx + dx - 3} y2={sy + 15}
                    stroke="#ef4444" strokeWidth={0.5} />
                ))}
              </g>
            );
          } else if (bc.type === "free") {
            // Free end: open circle
            markers.push(
              <circle key={`bc-${i}`} cx={sx} cy={sy} r={6}
                fill="none" stroke="#3b82f6" strokeWidth={1} strokeDasharray="2,1.5" />
            );
          } else if (bc.type === "infinite") {
            // Infinite pipe: arrow pointing outward
            const prevEl = elements.find(el => el.n2 === i);
            const nextEl = elements.find(el => el.n1 === i);
            const refEl = prevEl || nextEl;
            if (refEl) {
              const other = refEl.n1 === i ? nodes[refEl.n2] : nodes[refEl.n1];
              if (other) {
                const dx = n.x - other.x;
                const dy = n.y - other.y;
                const mag = Math.sqrt(dx * dx + dy * dy);
                if (mag > 0) {
                  const ux = dx / mag, uy = dy / mag;
                  const ax = sx + tx(n.x + ux * 500) - tx(n.x);
                  const ay = sy + ty(n.y + uy * 500) - ty(n.y);
                  markers.push(
                    <g key={`bc-${i}`}>
                      <line x1={sx} y1={sy} x2={sx + (ax - sx) * 0.3} y2={sy + (ay - sy) * 0.3}
                        stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4,2"
                        markerEnd="url(#arrow-inf)" />
                      <text x={sx + (ax - sx) * 0.35} y={sy + (ay - sy) * 0.35 - 6}
                        fill="#8b5cf6" fontSize={6} fontFamily={css.mono} textAnchor="middle">∞</text>
                    </g>
                  );
                }
              }
            }
          }
        }
      }

      // ─── Bend symbol ───
      if (showBends && isBend) {
        // Small arc at bend node — PLE4Win style
        markers.push(
          <g key={`bend-${i}`}>
            <circle cx={sx} cy={sy} r={5}
              fill="none" stroke="#fbbf24" strokeWidth={1.2} />
            <circle cx={sx} cy={sy} r={1.5}
              fill="#fbbf24" />
          </g>
        );
        // Radius annotation
        if (n.bendR) {
          const rTxt = `R=${Math.round(n.bendR)}`;
          const tw = rTxt.length * 4.5 + 2;
          const ry = sy - 14;
          const candidate: Rect = { x: sx - tw / 2, y: ry - 5, w: tw, h: 10 };
          if (!placed.some(p => overlap(p, candidate))) {
            placed.push(candidate);
            labels.push(
              <text key={`bendr-${i}`} x={sx} y={ry}
                textAnchor="middle" dominantBaseline="central"
                fill="#fbbf24" fontSize={6} fontFamily={css.mono} opacity={0.85}>
                {rTxt}
              </text>
            );
          }
        }
      }

      // ─── T-piece symbol ───
      if (showTees && isTee) {
        const s = 5;
        markers.push(
          <g key={`tee-${i}`}>
            <rect x={sx - s} y={sy - s} width={s * 2} height={s * 2}
              fill="none" stroke="#4ade80" strokeWidth={1} rx={1} />
            <line x1={sx - s} y1={sy} x2={sx + s} y2={sy}
              stroke="#4ade80" strokeWidth={0.8} />
            <line x1={sx} y1={sy - s} x2={sx} y2={sy + s}
              stroke="#4ade80" strokeWidth={0.8} />
          </g>
        );
      }

      // ─── Node dot (polygon point) ───
      if (showNodes && !isBend && !isTee) {
        markers.push(
          <circle key={`ndot-${i}`} cx={sx} cy={sy}
            r={isEndpoint ? 3.5 : 2}
            fill={isEndpoint ? "#e2e8f0" : "#94a3b8"}
            stroke={isEndpoint ? "#94a3b8" : "#64748b"}
            strokeWidth={0.6} />
        );
      }

      // ─── Ident label ───
      if (showIdents) {
        const labelText = n.id;
        const tw = labelText.length * 5.5 + 4;
        const th = 11;
        
        // Try positions: above, below, right, left
        const tryPositions: [number, number][] = [
          [sx, sy - 16],    // above
          [sx + 16, sy],    // right
          [sx, sy + 16],    // below
          [sx - 16, sy],    // left
          [sx + 14, sy - 12], // upper-right
          [sx - 14, sy - 12], // upper-left
        ];
        
        let bestPos = tryPositions[0];
        for (const [px, py] of tryPositions) {
          const cand: Rect = { x: px - tw / 2, y: py - th / 2, w: tw, h: th };
          if (!placed.some(p => overlap(p, cand))) {
            bestPos = [px, py];
            placed.push(cand);
            break;
          }
        }

        labels.push(
          <g key={`ident-${i}`}>
            <line x1={sx} y1={sy} x2={bestPos[0]} y2={bestPos[1]}
              stroke="#47556944" strokeWidth={0.3} />
            <rect x={bestPos[0] - tw / 2} y={bestPos[1] - th / 2}
              width={tw} height={th} rx={2}
              fill="#0f172a" fillOpacity={0.9} stroke="#334155" strokeWidth={0.3} />
            <text x={bestPos[0]} y={bestPos[1]}
              textAnchor="middle" dominantBaseline="central"
              fill="#e2e8f0" fontSize={7.5} fontFamily={css.mono} fontWeight={600}>
              {labelText}
            </text>
          </g>
        );
      }

      // ─── Diameter annotation at diameter changes ───
      if (showDiameters) {
        const connEls = elements.filter(el => el.n1 === i || el.n2 === i);
        const diams = [...new Set(connEls.map(el => el.d))];
        if (diams.length > 1) {
          diams.sort((a, b) => a - b);
          const diamText = diams.map(d => `Ø${d.toFixed(1)}`).join("→");
          const tw = diamText.length * 4.2 + 4;
          const dy = sy + 20;
          const candidate: Rect = { x: sx - tw / 2, y: dy - 4, w: tw, h: 8 };
          if (!placed.some(p => overlap(p, candidate))) {
            placed.push(candidate);
            labels.push(
              <g key={`diam-${i}`}>
                <line x1={sx} y1={sy + 3} x2={sx} y2={dy - 4}
                  stroke="#0ea5e944" strokeWidth={0.3} />
                <rect x={sx - tw / 2} y={dy - 4} width={tw} height={8}
                  rx={1.5} fill="#0c4a6e" fillOpacity={0.6} stroke="#0ea5e9" strokeWidth={0.3} />
                <text x={sx} y={dy} textAnchor="middle" dominantBaseline="central"
                  fill="#7dd3fc" fontSize={5.5} fontFamily={css.mono}>
                  {diamText}
                </text>
              </g>
            );
          }
        }
      }
    });

    // ─── North arrow (PLE4Win always shows this) ───
    const northArrow = (
      <g transform={`translate(${W - 45}, 35)`}>
        <line x1={0} y1={18} x2={0} y2={-12} stroke="#94a3b8" strokeWidth={1.5} />
        <polygon points="0,-12 -4,-4 4,-4" fill="#94a3b8" />
        <text x={0} y={-16} textAnchor="middle" fill="#e2e8f0" fontSize={10}
          fontWeight={700} fontFamily={css.mono}>N</text>
      </g>
    );

    // ─── Scale bar ───
    const targetBarPx = 80;
    const targetMm = targetBarPx / scale;
    const niceVals = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    const niceMm = niceVals.reduce((best, v) =>
      Math.abs(v - targetMm) < Math.abs(best - targetMm) ? v : best, niceVals[0]);
    const barPx = niceMm * scale;
    const barLabel = niceMm >= 1000 ? `${niceMm / 1000} m` : `${niceMm} mm`;

    const scaleBar = (
      <g transform={`translate(${margin}, ${H - 25})`}>
        <line x1={0} y1={0} x2={barPx} y2={0} stroke="#94a3b8" strokeWidth={1} />
        <line x1={0} y1={-3} x2={0} y2={3} stroke="#94a3b8" strokeWidth={1} />
        <line x1={barPx} y1={-3} x2={barPx} y2={3} stroke="#94a3b8" strokeWidth={1} />
        <text x={barPx / 2} y={-6} textAnchor="middle" fill="#94a3b8" fontSize={7} fontFamily={css.mono}>
          {barLabel}
        </text>
      </g>
    );

    // ─── Axis labels ───
    const axisLabels = (
      <g>
        <text x={W / 2} y={H - 8} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily={css.mono}>
          X (Oost) [m]
        </text>
        <text x={12} y={H / 2} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily={css.mono}
          transform={`rotate(-90, 12, ${H / 2})`}>
          Y (Noord) [m]
        </text>
      </g>
    );

    // ─── Grid lines with coordinate labels ───
    const gridLines: React.ReactNode[] = [];
    const gridStepMm = niceMm; // Use same step as scale bar
    const xStart = Math.ceil(minX / gridStepMm) * gridStepMm;
    const yStart = Math.ceil(minY / gridStepMm) * gridStepMm;
    
    for (let gx = xStart; gx <= maxX; gx += gridStepMm) {
      const sx2 = tx(gx);
      gridLines.push(
        <line key={`gx-${gx}`} x1={sx2} y1={margin - 5} x2={sx2} y2={H - margin + 5}
          stroke="#1e293b" strokeWidth={0.3} />
      );
      gridLines.push(
        <text key={`gxl-${gx}`} x={sx2} y={H - margin + 16} textAnchor="middle"
          fill="#475569" fontSize={6} fontFamily={css.mono}>
          {fmtCoord(gx)}
        </text>
      );
    }
    for (let gy = yStart; gy <= maxY; gy += gridStepMm) {
      const sy2 = ty(gy);
      gridLines.push(
        <line key={`gy-${gy}`} x1={margin - 5} y1={sy2} x2={W - margin + 5} y2={sy2}
          stroke="#1e293b" strokeWidth={0.3} />
      );
      gridLines.push(
        <text key={`gyl-${gy}`} x={margin - 10} y={sy2 + 2} textAnchor="end"
          fill="#475569" fontSize={6} fontFamily={css.mono}>
          {fmtCoord(gy)}
        </text>
      );
    }

    return { lines, markers, labels, northArrow, scaleBar, axisLabels, gridLines, W, H };
  }, [nodes, elements, boundaryConditions, css.mono, showIdents, showBends, showNodes,
      showElements, showConstraints, showDiameters, showDimensions, showTees]);


  /* ═════════════════════════════════════════════════════════════════════════
     PROFILE VIEW (Vertical Alignment) — distance along axis vs Z (elevation)
     ═════════════════════════════════════════════════════════════════════════ */
  const profileDrawing = useMemo(() => {
    if (!nodes || nodes.length === 0) return null;

    const maxDist = Math.max(...cumDist);
    let minZ = Infinity, maxZ = -Infinity;
    
    // Include ground level and water level in Z range
    for (const n of nodes) {
      const z = n.z || 0;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    for (const gl of glevel) {
      if (gl.z < minZ) minZ = gl.z;
      if (gl.z > maxZ) maxZ = gl.z;
    }
    for (const wl of wlevel) {
      if (wl.z < minZ) minZ = wl.z;
      if (wl.z > maxZ) maxZ = wl.z;
    }
    
    // Add some padding for flat pipelines
    if (maxZ - minZ < 100) {
      minZ -= 500;
      maxZ += 500;
    }
    
    const spanDist = maxDist || 1;
    const spanZ = maxZ - minZ || 1;

    const W = 1100, H = 350;
    const margin = { left: 70, right: 40, top: 40, bottom: 50 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;
    const scaleX = innerW / spanDist;
    const scaleZ = innerH / spanZ;
    
    const tx = (d: number) => margin.left + d * scaleX;
    const tz = (z: number) => H - margin.bottom - (z - minZ) * scaleZ;

    const placed: Rect[] = [];
    const profileLines: React.ReactNode[] = [];
    const profileMarkers: React.ReactNode[] = [];
    const profileLabels: React.ReactNode[] = [];

    // ─── Ground level fill (PLE4Win shows this as shaded area) ───
    if (showGroundLevel && glevel.length >= 2) {
      const glPoints = glevel
        .sort((a, b) => cumDist[a.nodeIndex] - cumDist[b.nodeIndex])
        .map(gl => `${tx(cumDist[gl.nodeIndex])},${tz(gl.z)}`);
      // Close polygon at bottom
      const lastDist = cumDist[glevel[glevel.length - 1].nodeIndex];
      const firstDist = cumDist[glevel[0].nodeIndex];
      const bottomY = tz(minZ);
      const polyPoints = `${tx(firstDist)},${bottomY} ${glPoints.join(" ")} ${tx(lastDist)},${bottomY}`;
      
      profileLines.push(
        <polygon key="gl-fill" points={polyPoints}
          fill="#854d0e" fillOpacity={0.08} stroke="none" />
      );
      profileLines.push(
        <polyline key="gl-line"
          points={glPoints.join(" ")}
          fill="none" stroke="#a16207" strokeWidth={1} strokeDasharray="4,2" />
      );
      profileLabels.push(
        <text key="gl-label" x={tx(firstDist) + 4} y={tz(glevel[0].z) - 6}
          fill="#a16207" fontSize={7} fontFamily={css.mono}>G-LEVEL</text>
      );
    }

    // ─── Water level ───
    if (showWaterLevel && wlevel.length >= 2) {
      const wlPoints = wlevel
        .sort((a, b) => cumDist[a.nodeIndex] - cumDist[b.nodeIndex])
        .map(wl => `${tx(cumDist[wl.nodeIndex])},${tz(wl.z)}`);
      profileLines.push(
        <polyline key="wl-line"
          points={wlPoints.join(" ")}
          fill="none" stroke="#0ea5e9" strokeWidth={0.8} strokeDasharray="6,3" />
      );
      profileLabels.push(
        <text key="wl-label" x={tx(cumDist[wlevel[0].nodeIndex]) + 4}
          y={tz(wlevel[0].z) - 6}
          fill="#0ea5e9" fontSize={7} fontFamily={css.mono}>W-LEVEL</text>
      );
    }

    // ─── Pipeline profile line ───
    elements.forEach((el, i) => {
      const n1 = nodes[el.n1];
      const n2 = nodes[el.n2];
      if (!n1 || !n2) return;
      
      const x1 = tx(cumDist[el.n1]), y1 = tz(n1.z || 0);
      const x2 = tx(cumDist[el.n2]), y2 = tz(n2.z || 0);
      
      profileLines.push(
        <line key={`prof-seg-${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={el.type === "tee" ? "#4ade80" : "#cbd5e1"}
          strokeWidth={2} strokeLinecap="round" />
      );

      // Segment length dimension
      if (showDimensions) {
        const dx3d = n2.x - n1.x;
        const dy3d = n2.y - n1.y;
        const dz3d = (n2.z || 0) - (n1.z || 0);
        const len3d = Math.sqrt(dx3d * dx3d + dy3d * dy3d + dz3d * dz3d);
        if (len3d > 200 && Math.abs(x2 - x1) > 25) {
          const mx = (x1 + x2) / 2;
          const my = Math.min(y1, y2) - 12;
          const lenStr = fmtLen(len3d);
          const tw = lenStr.length * 4.5 + 2;
          const candidate: Rect = { x: mx - tw / 2, y: my - 4, w: tw, h: 8 };
          if (!placed.some(p => overlap(p, candidate))) {
            placed.push(candidate);
            profileLabels.push(
              <text key={`prdim-${i}`} x={mx} y={my}
                textAnchor="middle" dominantBaseline="central"
                fill="#94a3b8" fontSize={6.5} fontFamily={css.mono}>
                {lenStr}
              </text>
            );
          }
        }
      }
    });

    // ─── Node markers on profile ───
    nodes.forEach((n, i) => {
      const sx = tx(cumDist[i]);
      const sy = tz(n.z || 0);
      const isBend = n.bendR && n.bendR > 0;
      const isTee = n.etyp === "tee" || n.id.startsWith("T") || n.id.startsWith("t");

      // Vertical drop line to bottom axis
      if (showNodes) {
        profileMarkers.push(
          <line key={`vline-${i}`} x1={sx} y1={sy} x2={sx} y2={H - margin.bottom}
            stroke="#1e293b" strokeWidth={0.3} strokeDasharray="1,2" />
        );
      }

      // Node dot
      if (isBend && showBends) {
        profileMarkers.push(
          <g key={`pbend-${i}`}>
            <circle cx={sx} cy={sy} r={4} fill="none" stroke="#fbbf24" strokeWidth={1} />
            <circle cx={sx} cy={sy} r={1.5} fill="#fbbf24" />
          </g>
        );
      } else if (isTee && showTees) {
        profileMarkers.push(
          <rect key={`ptee-${i}`} x={sx - 4} y={sy - 4} width={8} height={8}
            fill="none" stroke="#4ade80" strokeWidth={1} rx={1} />
        );
      } else {
        profileMarkers.push(
          <circle key={`pdot-${i}`} cx={sx} cy={sy} r={2}
            fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.5} />
        );
      }

      // Ident label (below axis)
      if (showIdents) {
        const labelY = H - margin.bottom + 12;
        // Rotate label if nodes are close together
        const prevDist = i > 0 ? cumDist[i] - cumDist[i - 1] : Infinity;
        const nextDist = i < nodes.length - 1 ? cumDist[i + 1] - cumDist[i] : Infinity;
        const tooClose = Math.min(prevDist, nextDist) * scaleX < 35;
        
        profileLabels.push(
          <text key={`pident-${i}`} x={sx} y={labelY}
            textAnchor={tooClose ? "start" : "middle"} dominantBaseline="hanging"
            fill="#e2e8f0" fontSize={7} fontFamily={css.mono} fontWeight={600}
            transform={tooClose ? `rotate(-45, ${sx}, ${labelY})` : undefined}>
            {n.id}
          </text>
        );
      }

      // Elevation label near node
      if (showNodes) {
        const zLabel = `z=${fmtCoord(n.z || 0)}`;
        const tw = zLabel.length * 4 + 2;
        const lx = sx + 8;
        const ly = sy - 8;
        const candidate: Rect = { x: lx, y: ly - 4, w: tw, h: 8 };
        if (!placed.some(p => overlap(p, candidate))) {
          placed.push(candidate);
          profileLabels.push(
            <text key={`zelev-${i}`} x={lx} y={ly}
              fill="#64748b" fontSize={5.5} fontFamily={css.mono}>
              {zLabel}
            </text>
          );
        }
      }
    });

    // ─── Y-axis (elevation) labels ───
    const gridLines: React.ReactNode[] = [];
    const zStep = spanZ / 5;
    const niceZSteps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const niceZStep = niceZSteps.reduce((best, v) =>
      Math.abs(v - zStep) < Math.abs(best - zStep) ? v : best, niceZSteps[0]);
    
    const zStart = Math.ceil(minZ / niceZStep) * niceZStep;
    for (let z = zStart; z <= maxZ; z += niceZStep) {
      const sy = tz(z);
      gridLines.push(
        <line key={`zgrid-${z}`} x1={margin.left} y1={sy} x2={W - margin.right} y2={sy}
          stroke="#1e293b" strokeWidth={0.3} />
      );
      gridLines.push(
        <text key={`zlab-${z}`} x={margin.left - 8} y={sy + 2}
          textAnchor="end" fill="#475569" fontSize={6.5} fontFamily={css.mono}>
          {fmtCoord(z)}
        </text>
      );
    }

    // ─── Axes labels ───
    const axisLabels = (
      <g>
        <text x={W / 2} y={H - 4} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily={css.mono}>
          Afstand langs leiding-as [m]
        </text>
        <text x={14} y={H / 2} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily={css.mono}
          transform={`rotate(-90, 14, ${H / 2})`}>
          Hoogte Z [m]
        </text>
      </g>
    );

    // Distance axis labels
    const dStep = spanDist / 8;
    const niceDSteps = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    const niceDStep = niceDSteps.reduce((best, v) =>
      Math.abs(v - dStep) < Math.abs(best - dStep) ? v : best, niceDSteps[0]);
    const dStart = Math.ceil(0 / niceDStep) * niceDStep;
    for (let d = dStart; d <= maxDist; d += niceDStep) {
      const sx = tx(d);
      gridLines.push(
        <line key={`dgrid-${d}`} x1={sx} y1={margin.top} x2={sx} y2={H - margin.bottom}
          stroke="#1e293b" strokeWidth={0.2} />
      );
    }

    return { profileLines, profileMarkers, profileLabels, gridLines, axisLabels, W, H };
  }, [nodes, elements, cumDist, glevel, wlevel, css.mono,
      showIdents, showBends, showNodes, showDimensions, showConstraints,
      showGroundLevel, showWaterLevel, showTees]);

  // ─── Export handlers ───
  const exportSVG = useCallback((svgRef: React.RefObject<SVGSVGElement | null>, name: string) => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "pipeline"}_${name}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projectName]);

  const exportPrint = useCallback((svgRef: React.RefObject<SVGSVGElement | null>, title: string) => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
        <style>@page{size:A3 landscape;margin:10mm}body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}svg{max-width:100%;max-height:100vh}</style>
        </head><body>${svgData}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  }, []);

  // ─── Mouse handlers for pan ───
  const handleMouseDown = useCallback((view: "plan" | "profile", e: React.MouseEvent) => {
    const pan = view === "plan" ? planPan : profilePan;
    setDragging({ view, startX: e.clientX - pan.x, startY: e.clientY - pan.y, startPanX: pan.x, startPanY: pan.y });
  }, [planPan, profilePan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const newPan = { x: e.clientX - dragging.startX, y: e.clientY - dragging.startY };
    if (dragging.view === "plan") setPlanPan(newPan);
    else setProfilePan(newPan);
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  const handleWheel = useCallback((view: "plan" | "profile", e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    if (view === "plan") setPlanZoom(z => Math.max(0.3, Math.min(5, z * factor)));
    else setProfileZoom(z => Math.max(0.3, Math.min(5, z * factor)));
  }, []);

  // ─── Empty state ───
  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: css.muted, fontFamily: css.mono, fontSize: 12,
        border: `1px dashed ${css.border}`, borderRadius: 8, margin: "16px 0" }}>
        Geen leidingmodel geladen — importeer eerst een Excel bestand met POLYDIF data
      </div>
    );
  }

  const toggleBtn = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      padding: "3px 7px", fontSize: 9, fontFamily: css.mono,
      background: active ? "rgba(59,130,246,0.15)" : "rgba(100,116,139,0.06)",
      border: `1px solid ${active ? "rgba(59,130,246,0.3)" : css.border}`,
      borderRadius: 4, color: active ? css.accent : css.dim,
      cursor: "pointer", fontWeight: active ? 600 : 400, transition: "all 0.15s",
    }}>{label}</button>
  );

  const viewBtn = (view: "plan" | "profile" | "both", label: string) => (
    <button onClick={() => setActiveView(view)} style={{
      padding: "3px 8px", fontSize: 9, fontFamily: css.mono,
      background: activeView === view ? "rgba(59,130,246,0.2)" : "transparent",
      border: `1px solid ${activeView === view ? css.accent : "transparent"}`,
      borderRadius: 4, color: activeView === view ? css.accent : css.muted,
      cursor: "pointer", fontWeight: activeView === view ? 700 : 400,
    }}>{label}</button>
  );

  return (
    <div style={{ margin: "8px 0" }}>
      {/* ═══ Toolbar — matching PLE4Win's PipeDraw options bar ═══ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5, marginBottom: 0,
        flexWrap: "wrap", padding: "6px 8px",
        background: "rgba(15,23,42,0.5)", borderRadius: "8px 8px 0 0",
        border: `1px solid ${css.border}`, borderBottom: "none",
      }}>
        <span style={{ fontSize: 10, color: css.muted, fontFamily: css.mono, fontWeight: 700, marginRight: 6 }}>
          PIPEDRAW
        </span>
        <div style={{ width: 1, height: 16, background: css.border }} />
        
        {/* View selection */}
        {viewBtn("both", "Plan+Profiel")}
        {viewBtn("plan", "Plan")}
        {viewBtn("profile", "Profiel")}
        
        <div style={{ width: 1, height: 16, background: css.border }} />
        
        {/* Display toggles — matches PLE4Win's options */}
        {toggleBtn(showIdents, "Idents", () => setShowIdents(!showIdents))}
        {toggleBtn(showNodes, "Nodes", () => setShowNodes(!showNodes))}
        {toggleBtn(showElements, "Elem.nrs", () => setShowElements(!showElements))}
        {toggleBtn(showBends, "Bochten", () => setShowBends(!showBends))}
        {toggleBtn(showTees, "T-stukken", () => setShowTees(!showTees))}
        {toggleBtn(showConstraints, "Constraints", () => setShowConstraints(!showConstraints))}
        {toggleBtn(showDiameters, "DN", () => setShowDiameters(!showDiameters))}
        {toggleBtn(showDimensions, "Maten", () => setShowDimensions(!showDimensions))}
        {toggleBtn(showGroundLevel, "G-Level", () => setShowGroundLevel(!showGroundLevel))}
        {toggleBtn(showWaterLevel, "W-Level", () => setShowWaterLevel(!showWaterLevel))}
        
        <div style={{ flex: 1 }} />
        
        {/* Export */}
        <button onClick={() => exportSVG(activeView === "profile" ? profileSvgRef : planSvgRef,
          activeView === "profile" ? "profiel" : "plan")} style={{
          padding: "3px 8px", fontSize: 9, fontFamily: css.mono,
          background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: 4, color: css.green, cursor: "pointer", fontWeight: 600,
        }}>SVG ↓</button>
        <button onClick={() => exportPrint(activeView === "profile" ? profileSvgRef : planSvgRef,
          `${projectName || "Pipeline"} - ${activeView === "profile" ? "Profiel" : "Plan"}`)} style={{
          padding: "3px 8px", fontSize: 9, fontFamily: css.mono,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, color: css.red, cursor: "pointer", fontWeight: 600,
        }}>Print/PDF</button>
      </div>

      {/* ═══ Drawing area ═══ */}
      <div style={{
        border: `1px solid ${css.border}`, borderRadius: "0 0 8px 8px",
        background: "#0a0f1a", overflow: "hidden",
      }}>
        
        {/* ─── PLAN VIEW (Horizontal Alignment) ─── */}
        {(activeView === "both" || activeView === "plan") && planDrawing && (
          <div
            onWheel={(e) => handleWheel("plan", e)}
            onMouseDown={(e) => handleMouseDown("plan", e)}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragging?.view === "plan" ? "grabbing" : "grab", position: "relative" }}
          >
            {/* Section header */}
            <div style={{
              padding: "4px 10px", borderBottom: `1px solid ${css.border}22`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 9, fontFamily: css.mono, color: css.yellow, fontWeight: 600 }}>
                HORIZONTAL ALIGNMENT
              </span>
              <span style={{ fontSize: 8, fontFamily: css.mono, color: css.dim }}>
                Bovenaanzicht (X/Y)
              </span>
              <span style={{ marginLeft: "auto", fontSize: 8, fontFamily: css.mono, color: css.dim }}>
                {(planZoom * 100).toFixed(0)}%
              </span>
              <button onClick={() => { setPlanZoom(1); setPlanPan({ x: 0, y: 0 }); }} style={{
                fontSize: 7, fontFamily: css.mono, color: css.dim, background: "none",
                border: `1px solid ${css.border}`, borderRadius: 3, padding: "1px 5px", cursor: "pointer",
              }}>Reset</button>
            </div>
            
            <svg ref={planSvgRef} viewBox={`0 0 ${planDrawing.W} ${planDrawing.H}`}
              xmlns="http://www.w3.org/2000/svg"
              style={{
                width: "100%", height: "auto",
                transform: `scale(${planZoom}) translate(${planPan.x / planZoom}px, ${planPan.y / planZoom}px)`,
                transformOrigin: "center center",
              }}>
              <rect width="100%" height="100%" fill="#0a0f1a" />
              <defs>
                <marker id="arrow-inf" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#8b5cf6" />
                </marker>
              </defs>
              {planDrawing.gridLines}
              {planDrawing.lines}
              {planDrawing.markers}
              {planDrawing.labels}
              {planDrawing.northArrow}
              {planDrawing.scaleBar}
              {planDrawing.axisLabels}
              {/* Title */}
              <text x={planDrawing.W - 40} y={planDrawing.H - 12} textAnchor="end"
                fill="#475569" fontSize={7} fontFamily={css.mono}>
                {projectName || "PLE Pipeline"}
              </text>
            </svg>
          </div>
        )}

        {/* ─── Divider ─── */}
        {activeView === "both" && (
          <div style={{ height: 1, background: css.border, opacity: 0.3 }} />
        )}

        {/* ─── PROFILE VIEW (Vertical Alignment) ─── */}
        {(activeView === "both" || activeView === "profile") && profileDrawing && (
          <div
            onWheel={(e) => handleWheel("profile", e)}
            onMouseDown={(e) => handleMouseDown("profile", e)}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragging?.view === "profile" ? "grabbing" : "grab", position: "relative" }}
          >
            {/* Section header */}
            <div style={{
              padding: "4px 10px", borderBottom: `1px solid ${css.border}22`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 9, fontFamily: css.mono, color: css.green, fontWeight: 600 }}>
                VERTICAL ALIGNMENT
              </span>
              <span style={{ fontSize: 8, fontFamily: css.mono, color: css.dim }}>
                Profiel (afstand vs hoogte)
              </span>
              <span style={{ marginLeft: "auto", fontSize: 8, fontFamily: css.mono, color: css.dim }}>
                {(profileZoom * 100).toFixed(0)}%
              </span>
              <button onClick={() => { setProfileZoom(1); setProfilePan({ x: 0, y: 0 }); }} style={{
                fontSize: 7, fontFamily: css.mono, color: css.dim, background: "none",
                border: `1px solid ${css.border}`, borderRadius: 3, padding: "1px 5px", cursor: "pointer",
              }}>Reset</button>
            </div>
            
            <svg ref={profileSvgRef} viewBox={`0 0 ${profileDrawing.W} ${profileDrawing.H}`}
              xmlns="http://www.w3.org/2000/svg"
              style={{
                width: "100%", height: "auto",
                transform: `scale(${profileZoom}) translate(${profilePan.x / profileZoom}px, ${profilePan.y / profileZoom}px)`,
                transformOrigin: "center center",
              }}>
              <rect width="100%" height="100%" fill="#0a0f1a" />
              {profileDrawing.gridLines}
              {profileDrawing.profileLines}
              {profileDrawing.profileMarkers}
              {profileDrawing.profileLabels}
              {profileDrawing.axisLabels}
              <text x={profileDrawing.W - 40} y={profileDrawing.H - 8} textAnchor="end"
                fill="#475569" fontSize={7} fontFamily={css.mono}>
                {projectName || "PLE Pipeline"}
              </text>
            </svg>
          </div>
        )}
      </div>

      {/* ─── Stats / legend bar ─── */}
      <div style={{
        display: "flex", gap: 12, padding: "5px 10px", marginTop: 3,
        fontSize: 8, fontFamily: css.mono, color: css.dim, flexWrap: "wrap",
      }}>
        <span style={{ color: css.muted, fontWeight: 600 }}>Legenda:</span>
        <span>● <span style={{ color: "#e2e8f0" }}>Node</span></span>
        <span>◎ <span style={{ color: "#fbbf24" }}>Bocht</span></span>
        <span>□ <span style={{ color: "#4ade80" }}>T-stuk</span></span>
        <span>▽ <span style={{ color: "#ef4444" }}>Vast</span></span>
        <span>○ <span style={{ color: "#3b82f6" }}>Vrij</span></span>
        <span>→∞ <span style={{ color: "#8b5cf6" }}>Oneindig</span></span>
        {showGroundLevel && <span>--- <span style={{ color: "#a16207" }}>Maaiveld</span></span>}
        {showWaterLevel && <span>--- <span style={{ color: "#0ea5e9" }}>Waterpeil</span></span>}
        <span style={{ marginLeft: "auto" }}>Scroll=zoom · Klik+sleep=pan</span>
      </div>
    </div>
  );
}
