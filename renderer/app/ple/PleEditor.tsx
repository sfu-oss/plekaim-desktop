"use client";

import React, { useState, useCallback } from "react";
import PleDataGrid, { PleColumnDef } from "./PleDataGrid";
import type {
  PleModel, PleNode, PleDiam, PleWall, PleMatl, PleIstrop,
  PleEndpt, PleSupport, PleSpring, PleConnect, PleTeeSpec, PleTeeConf,
  PleCoating, PleGLevel, PleWLevel, PlePress, PleTemp,
  PleLoadCase, PleSubside, PleAdident, PleSupang,
} from "../../lib/ple-model";
import { updateModelTable } from "../../lib/ple-model";
import { MATERIAL_REFS, findMaterial } from "../../lib/ple-materials";

/* ═══════════════════════════════════════════════════════════════════════════
   PLE Editor v2 — Bewerkbare tabellen die PleModel direct muteren
   
   Verschil met v1: Editor werkt nu op typed PleModel arrays in plaats van
   rawSheets. Elke wijziging gaat via updateModelTable() die automatisch
   rebuildTopology() aanroept bij structurele wijzigingen.
   
   Sub-tabs:
   - Geometrie: nodes (POLYDIF)
   - Buisdata: diameters + walls + materials + materialProps (DIAM + WALL + MATL + ISTROP)
   - Grond: gLevels + wLevels (G-LEVEL + W-LEVEL)
   - Randvoorwaarden: endpts + supports + connects + springs (ENDPTS + SUPPORT + CONNECT + ELSPRS)
   - Belastingen: press + temp + loadCases + subside (PRESS + TEMP + LOCASE + SUBSIDE)
   - T-stukken: teeSpecs + teeConfs (TEESPEC + TEECONF)
   - Coating: coatings (COATING)
   - Configuratie: adidents (ADIDENT)
   ═══════════════════════════════════════════════════════════════════════════ */

const F = "'JetBrains Mono','Fira Code','Courier New',monospace";

// ── Kolom definities per tabel ──

const NODE_COLS: PleColumnDef[] = [
  { key: "id", label: "Ident", type: "text", width: 90, required: true },
  { key: "x", label: "X", unit: "mm", type: "number", width: 90, decimals: 1 },
  { key: "y", label: "Y", unit: "mm", type: "number", width: 90, decimals: 1 },
  { key: "z", label: "Z", unit: "mm", type: "number", width: 80, decimals: 1 },
  { key: "bendR", label: "Bend R", unit: "mm", type: "number", width: 80 },
  { key: "etyp", label: "Type", type: "text", width: 70 },
];

const DIAM_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "dout1", label: "DOUT1", unit: "mm", type: "number", width: 80, min: 10, max: 2000, decimals: 1 },
  { key: "dout2", label: "DOUT2", unit: "mm", type: "number", width: 80, decimals: 1 },
];

const WALL_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "tnom1", label: "T-NOM1", unit: "mm", type: "number", width: 80, min: 1, max: 100, decimals: 1 },
  { key: "tnom2", label: "T-NOM2", unit: "mm", type: "number", width: 80, decimals: 1 },
];

const MATL_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "matRef", label: "Materiaal", type: "text", width: 120, datalist: MATERIAL_REFS },
  { key: "fabmet", label: "Fabricage", type: "select", options: ["none", "seam-welded", "seamless"], width: 100 },
  { key: "matfact", label: "MATFACT", type: "number", width: 70, decimals: 2 },
];

const ISTROP_COLS: PleColumnDef[] = [
  { key: "matRef", label: "Materiaal", type: "text", width: 120, required: true, datalist: MATERIAL_REFS },
  { key: "E", label: "E-mod", unit: "MPa", type: "number", width: 80 },
  { key: "nu", label: "ν", type: "number", width: 60, decimals: 2 },
  { key: "alpha", label: "α", unit: "1/°C", type: "number", width: 80, decimals: 7 },
  { key: "Re", label: "Re (SMYS)", unit: "MPa", type: "number", width: 80 },
  { key: "ReT", label: "ReT", unit: "MPa", type: "number", width: 70 },
  { key: "weight", label: "WEIGHT", unit: "N/mm³", type: "number", width: 90, decimals: 7 },
];

const PRESS_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "press1", label: "PRESS1", unit: "N/mm²", type: "number", width: 80, decimals: 2 },
  { key: "press2", label: "PRESS2", unit: "N/mm²", type: "number", width: 80, decimals: 2 },
];

const TEMP_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "tabs1", label: "T-ABS1", unit: "°C", type: "number", width: 70 },
  { key: "tref1", label: "T-REF1", unit: "°C", type: "number", width: 70 },
  { key: "tabs2", label: "T-ABS2", unit: "°C", type: "number", width: 70 },
  { key: "tref2", label: "T-REF2", unit: "°C", type: "number", width: 70 },
];

const ENDPTS_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "cond", label: "Conditie", type: "select", options: ["fixed", "free", "spring", "guided", "infin"], width: 80 },
  { key: "state", label: "Status", type: "select", options: ["open", "closed"], width: 70 },
];

const CONNECT_COLS: PleColumnDef[] = [
  { key: "ident1", label: "Ident1", type: "text", width: 80, required: true },
  { key: "ident2", label: "Ident2", type: "text", width: 80, required: true },
  { key: "conname", label: "Naam", type: "text", width: 70 },
  { key: "teeRef", label: "TEE-REF", type: "text", width: 90 },
];

const TEESPEC_COLS: PleColumnDef[] = [
  { key: "teeRef", label: "TEE-REF", type: "text", width: 90, required: true },
  { key: "type", label: "Type", type: "select", options: ["Welded", "Reinforced", "Forged"], width: 90 },
  { key: "matRef", label: "Mat Run", type: "text", width: 80 },
  { key: "matBrn", label: "Mat Brn", type: "text", width: 80 },
  { key: "dRun", label: "D-Run", unit: "mm", type: "number", width: 70 },
  { key: "tRun", label: "t-Run", unit: "mm", type: "number", width: 60 },
  { key: "dBrn", label: "D-Brn", unit: "mm", type: "number", width: 70 },
  { key: "tBrn", label: "t-Brn", unit: "mm", type: "number", width: 60 },
  { key: "te", label: "TE", unit: "mm", type: "number", width: 50 },
  { key: "r0", label: "R0", unit: "mm", type: "number", width: 50 },
];

const TEECONF_COLS: PleColumnDef[] = [
  { key: "teeRef", label: "TEE-REF", type: "text", width: 90, required: true },
  { key: "lRun", label: "L-Run", unit: "mm", type: "number", width: 70 },
  { key: "lBrn", label: "L-Brn", unit: "mm", type: "number", width: 70 },
  { key: "cycles", label: "Cycles", type: "number", width: 60 },
];

const SUPPORT_COLS: PleColumnDef[] = [
  { key: "refIdent", label: "RefIdent", type: "text", width: 90, required: true },
  { key: "deltaAxL", label: "ΔAX-L", unit: "mm", type: "number", width: 100 },
  { key: "cosys", label: "CoSys", type: "select", options: ["Local", "Global"], width: 70 },
  { key: "supRef", label: "SupRef", type: "text", width: 70 },
];

const ELSPRS_COLS: PleColumnDef[] = [
  { key: "sprRef", label: "Ref", type: "text", width: 70, required: true },
  { key: "kx", label: "kx", unit: "N/mm", type: "number", width: 100 },
  { key: "ky", label: "ky", unit: "N/mm", type: "number", width: 80 },
  { key: "kz", label: "kz", unit: "N/mm", type: "number", width: 80 },
  { key: "kphi", label: "kφ", unit: "Nmm/rad", type: "number", width: 90 },
  { key: "kpsi", label: "kψ", unit: "Nmm/rad", type: "number", width: 90 },
  { key: "keta", label: "kη", unit: "Nmm/rad", type: "number", width: 90 },
];

const GLEVEL_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "ground1", label: "GROUND1", unit: "mm", type: "number", width: 80 },
  { key: "uncv1", label: "UNCV1", unit: "mm", type: "number", width: 70 },
  { key: "ground2", label: "GROUND2", unit: "mm", type: "number", width: 80 },
  { key: "uncv2", label: "UNCV2", unit: "mm", type: "number", width: 70 },
];

const WLEVEL_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "water1", label: "WATER1", unit: "mm", type: "number", width: 80 },
  { key: "uncv1", label: "UNCV1", unit: "mm", type: "number", width: 70 },
  { key: "water2", label: "WATER2", unit: "mm", type: "number", width: 80 },
  { key: "uncv2", label: "UNCV2", unit: "mm", type: "number", width: 70 },
  { key: "weight", label: "WEIGHT", unit: "N/mm³", type: "number", width: 90, decimals: 8 },
];

const COATING_COLS: PleColumnDef[] = [
  { key: "startIdent", label: "Start", type: "text", width: 80, required: true },
  { key: "endIdent", label: "Eind", type: "text", width: 80 },
  { key: "name", label: "Naam", type: "text", width: 80 },
  { key: "type", label: "Type", type: "select", options: ["External", "Medium", "Internal"], width: 80 },
  { key: "thick", label: "Dikte", unit: "mm", type: "number", width: 70, decimals: 2 },
  { key: "weight", label: "Gewicht", unit: "N/mm³", type: "number", width: 90, decimals: 8 },
];

const LOCASE_COLS: PleColumnDef[] = [
  { key: "lc", label: "LC", type: "text", width: 60 },
  { key: "gloadF", label: "Eigengewicht", type: "number", width: 90, decimals: 1 },
  { key: "pressF", label: "Druk", type: "number", width: 60, decimals: 1 },
  { key: "tDifF", label: "Temp", type: "number", width: 60, decimals: 1 },
  { key: "deadwF", label: "Dood", type: "number", width: 60, decimals: 1 },
  { key: "setlF", label: "Zakking", type: "number", width: 70, decimals: 1 },
];

const SUBSIDE_COLS: PleColumnDef[] = [
  { key: "ident", label: "Ident", type: "text", width: 90, required: true },
  { key: "subzMax", label: "Zmax", unit: "mm", type: "number", width: 80, decimals: 2 },
  { key: "uncF", label: "UncF", type: "number", width: 60, decimals: 2 },
  { key: "length", label: "Lengte", unit: "mm", type: "number", width: 80 },
  { key: "shape", label: "Vorm", type: "select", options: ["Double", "Right", "Left"], width: 70 },
];

const ADIDENT_COLS: PleColumnDef[] = [
  { key: "refIdent", label: "RefIdent", type: "text", width: 90, required: true },
  { key: "deltaAxL", label: "ΔAX-L", unit: "mm", type: "number", width: 80 },
  { key: "newIdent", label: "NieuwIdent", type: "text", width: 90 },
];

// ── Sub-tab definities ──

interface SubTab {
  id: string;
  label: string;
  icon: string;
  color: string;
}

const SUB_TABS: SubTab[] = [
  { id: "geom", label: "Geometrie", icon: "📐", color: "#4472C4" },
  { id: "pipe", label: "Buisdata", icon: "🔧", color: "#4472C4" },
  { id: "ground", label: "Grond", icon: "🏔️", color: "#00B0F0" },
  { id: "boundary", label: "Randvw", icon: "📌", color: "#FF0000" },
  { id: "loading", label: "Belasting", icon: "⚡", color: "#7030A0" },
  { id: "tees", label: "T-stukken", icon: "🔀", color: "#548235" },
  { id: "coating", label: "Coating", icon: "🛡️", color: "#ED7D31" },
  { id: "config", label: "Config", icon: "⚙️", color: "#A5A5A5" },
];

// ── Props ──
interface PleEditorProps {
  model?: PleModel;
  onModelChange?: (updated: PleModel) => void;
  onDataChanged?: () => void;
  // Legacy compatibility: rawSheets-based interface
  rawSheets?: Record<string, any[][]>;
  onRawSheetsChange?: (updated: Record<string, any[][]>) => void;
}

export default function PleEditor({ model, onModelChange, onDataChanged, rawSheets, onRawSheetsChange }: PleEditorProps) {
  if (!model || !onModelChange) {
    return null;
  }
  const [subTab, setSubTab] = useState("geom");

  // Helper: update een tabel in het model
  const setTable = useCallback(<K extends keyof PleModel>(table: K, data: PleModel[K]) => {
    const updated = updateModelTable(model, table, data);
    onModelChange(updated);
    onDataChanged?.();
  }, [model, onModelChange, onDataChanged]);

  return (
    <div>
      {/* Sub-tab navigatie */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 12, flexWrap: "wrap",
        borderBottom: "1px solid #1e293b", paddingBottom: 8,
      }}>
        {SUB_TABS.map(st => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            style={{
              padding: "4px 10px", fontSize: 10, fontFamily: F,
              background: subTab === st.id ? `${st.color}22` : "transparent",
              border: `1px solid ${subTab === st.id ? st.color : "#1e293b"}`,
              borderRadius: 4,
              color: subTab === st.id ? st.color : "#64748b",
              cursor: "pointer", whiteSpace: "nowrap",
              fontWeight: subTab === st.id ? 600 : 400,
            }}
          >
            {st.icon} {st.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === "geom" && (
        <PleDataGrid
          title="Nodes — Pipeline geometrie"
          subtitle="Knooppunten met coördinaten en bochtradius"
          columns={NODE_COLS}
          data={model.nodes as any[]}
          onChange={d => setTable("nodes", d as PleNode[])}
          newRowTemplate={{ id: "", x: 0, y: 0, z: 0, bendR: null, etyp: "", D0: null, DPE: null }}
          maxHeight={600}
        />
      )}

      {subTab === "pipe" && (
        <>
          <PleDataGrid
            title="Diameters — Diameter per segment"
            columns={DIAM_COLS}
            data={model.diameters as any[]}
            onChange={d => setTable("diameters", d as PleDiam[])}
          />
          <PleDataGrid
            title="Wanddiktes — Wanddikte per segment"
            columns={WALL_COLS}
            data={model.walls as any[]}
            onChange={d => setTable("walls", d as PleWall[])}
          />
          <PleDataGrid
            title="Materiaal — Materiaal per segment"
            columns={MATL_COLS}
            data={model.materials as any[]}
            onChange={d => setTable("materials", d as PleMatl[])}
          />
          <PleDataGrid
            title="ISTROP — Materiaal eigenschappen"
            subtitle="E-modulus, Poisson, thermische coëfficiënt, SMYS — typ een materiaalcode voor autocomplete"
            columns={ISTROP_COLS}
            data={model.materialProps as any[]}
            onChange={d => {
              // Auto-fill eigenschappen als matRef overeenkomt met bekende database entry
              const filled = (d as PleIstrop[]).map(row => {
                const db = findMaterial(row.matRef);
                if (!db) return row;
                return {
                  ...row,
                  E:      row.E      || db.E,
                  nu:     row.nu     || db.nu,
                  alpha:  row.alpha  || db.alpha,
                  Re:     row.Re     || db.Re,
                  ReT:    row.ReT    || db.ReT,
                  weight: row.weight || db.weight,
                };
              });
              setTable("materialProps", filled as PleIstrop[]);
            }}
          />
        </>
      )}

      {subTab === "ground" && (
        <>
          <PleDataGrid
            title="G-LEVEL — Maaiveldniveau"
            subtitle="Absolute Z-coördinaat van maaiveld per node"
            columns={GLEVEL_COLS}
            data={model.gLevels as any[]}
            onChange={d => setTable("gLevels", d as PleGLevel[])}
            maxHeight={400}
          />
          <PleDataGrid
            title="W-LEVEL — Grondwaterniveau"
            subtitle="Absolute Z-coördinaat van waterpeil per node"
            columns={WLEVEL_COLS}
            data={model.wLevels as any[]}
            onChange={d => setTable("wLevels", d as PleWLevel[])}
            maxHeight={400}
          />
        </>
      )}

      {subTab === "boundary" && (
        <>
          <PleDataGrid
            title="Eindpunten — Randvoorwaarden"
            columns={ENDPTS_COLS}
            data={model.endpts as any[]}
            onChange={d => setTable("endpts", d as PleEndpt[])}
          />
          <PleDataGrid
            title="Steunpunten"
            columns={SUPPORT_COLS}
            data={model.supports as any[]}
            onChange={d => setTable("supports", d as PleSupport[])}
          />
          <PleDataGrid
            title="T-stuk verbindingen"
            columns={CONNECT_COLS}
            data={model.connects as any[]}
            onChange={d => setTable("connects", d as PleConnect[])}
          />
          <PleDataGrid
            title="Elastische veren"
            columns={ELSPRS_COLS}
            data={model.springs as any[]}
            onChange={d => setTable("springs", d as PleSpring[])}
          />
        </>
      )}

      {subTab === "loading" && (
        <>
          <PleDataGrid
            title="Druk — Inwendige druk"
            columns={PRESS_COLS}
            data={model.press as any[]}
            onChange={d => setTable("press", d as PlePress[])}
          />
          <PleDataGrid
            title="Temperatuur — Temperatuurcondities"
            columns={TEMP_COLS}
            data={model.temp as any[]}
            onChange={d => setTable("temp", d as PleTemp[])}
          />
          <PleDataGrid
            title="Lastgevallen"
            subtitle="Belastingscombinaties met factoren"
            columns={LOCASE_COLS}
            data={model.loadCases as any[]}
            onChange={d => setTable("loadCases", d as PleLoadCase[])}
          />
          <PleDataGrid
            title="Bodemdaling"
            columns={SUBSIDE_COLS}
            data={model.subside as any[]}
            onChange={d => setTable("subside", d as PleSubside[])}
            maxHeight={300}
          />
        </>
      )}

      {subTab === "tees" && (
        <>
          <PleDataGrid
            title="T-stuk specificaties"
            subtitle="Geometrie en materiaal per T-stuk type"
            columns={TEESPEC_COLS}
            data={model.teeSpecs as any[]}
            onChange={d => setTable("teeSpecs", d as PleTeeSpec[])}
          />
          <PleDataGrid
            title="T-stuk configuratie"
            subtitle="Lengtes en vermoeiingscycli"
            columns={TEECONF_COLS}
            data={model.teeConfs as any[]}
            onChange={d => setTable("teeConfs", d as PleTeeConf[])}
          />
        </>
      )}

      {subTab === "coating" && (
        <PleDataGrid
          title="Coating — Isolatie en mantel"
          subtitle="PUR, PE, medium per tracésegment"
          columns={COATING_COLS}
          data={model.coatings as any[]}
          onChange={d => setTable("coatings", d as PleCoating[])}
        />
      )}

      {subTab === "config" && (
        <>
          <PleDataGrid
            title="Extra interpolatiepunten"
            columns={ADIDENT_COLS}
            data={model.adidents as any[]}
            onChange={d => setTable("adidents", d as PleAdident[])}
            maxHeight={300}
          />
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 12, fontFamily: F }}>
            GEOMCTL en SOILCTL instellingen worden automatisch overgenomen uit het Excel bestand.
            MaxGeoIter={model.geomctl.maxGeoIterations}, MaxSoilIter={model.soilctl.maxSoilIterations}
          </div>
        </>
      )}
    </div>
  );
}
