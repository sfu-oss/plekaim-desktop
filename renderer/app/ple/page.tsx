"use client";

import React, { useEffect, useMemo, useState } from "react";
import Ple3DViewer from "../../components/Ple3DViewer";
import PlePipeDraw from "./PlePipeDraw";
import PleEditor from "./PleEditor";
import PleSoilWizard, { type SoilParameters } from "./PleSoilWizard";
import { parseSheetsToModel, buildFemInput, modelToLegacy, modelToRawSheets, type PleModel, type SoilWizardResult } from "../../lib/ple-model";
import * as XLSX from "xlsx";

// ============================================================
// PLE Pipeline Engineering Calculator — Mobile-First
// NEN 3650-2 compliant stress analysis for buried pipelines
// ============================================================

const MATERIALS = {
  "API 5L Grade B": { E: 210000, SMYS: 245, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "API 5L X42": { E: 210000, SMYS: 290, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "API 5L X52": { E: 210000, SMYS: 359, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "API 5L X60": { E: 210000, SMYS: 414, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "API 5L X65": { E: 210000, SMYS: 448, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "API 5L X70": { E: 210000, SMYS: 483, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "API 5L X80": { E: 210000, SMYS: 552, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "S235 (EN 10025)": { E: 210000, SMYS: 235, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "S355 (EN 10025)": { E: 210000, SMYS: 355, poisson: 0.3, alpha: 11.7e-6, density: 7850, type: "steel" },
  "Stainless 304": { E: 193000, SMYS: 205, poisson: 0.29, alpha: 17.2e-6, density: 7900, type: "steel" },
  "Stainless 316": { E: 193000, SMYS: 205, poisson: 0.29, alpha: 16.0e-6, density: 8000, type: "steel" },
  "PE80 (SDR 11)": { E: 800, SMYS: 8, poisson: 0.38, alpha: 200e-6, density: 950, type: "plastic", SDR: 11 },
  "PE80 (SDR 17)": { E: 800, SMYS: 8, poisson: 0.38, alpha: 200e-6, density: 950, type: "plastic", SDR: 17 },
  "PE100 (SDR 11)": { E: 1000, SMYS: 10, poisson: 0.38, alpha: 200e-6, density: 960, type: "plastic", SDR: 11 },
  "PE100 (SDR 17)": { E: 1000, SMYS: 10, poisson: 0.38, alpha: 200e-6, density: 960, type: "plastic", SDR: 17 },
  "PVC (SDR 21)": { E: 3000, SMYS: 48, poisson: 0.38, alpha: 80e-6, density: 1400, type: "plastic", SDR: 21 },
  "PVC (SDR 26)": { E: 3000, SMYS: 48, poisson: 0.38, alpha: 80e-6, density: 1400, type: "plastic", SDR: 26 },
  "Gietijzer (GGG-40)": { E: 169000, SMYS: 250, poisson: 0.275, alpha: 10.5e-6, density: 7100, type: "cast_iron" },
  "Gietijzer (GGG-50)": { E: 169000, SMYS: 320, poisson: 0.275, alpha: 10.5e-6, density: 7100, type: "cast_iron" },

  "P235GH": { E: 210000, SMYS: 235, poisson: 0.3, alpha: 12e-6, density: 7850, type: "steel" },
  "P265GH": { E: 210000, SMYS: 265, poisson: 0.3, alpha: 12e-6, density: 7850, type: "steel" },
  "P355GH": { E: 210000, SMYS: 355, poisson: 0.3, alpha: 12e-6, density: 7850, type: "steel" },
} as const;

const SOIL_TYPES = {
  "Zand (droog)": { gamma: 17, phi: 30, c: 0, k_h: 5000, k_v_up: 2000, k_v_down: 10000, E_soil: 20 },
  "Zand (nat)": { gamma: 20, phi: 28, c: 0, k_h: 8000, k_v_up: 3000, k_v_down: 15000, E_soil: 25 },
  "Klei (zacht)": { gamma: 16, phi: 15, c: 10, k_h: 1500, k_v_up: 500, k_v_down: 3000, E_soil: 5 },
  "Klei (stevig)": { gamma: 19, phi: 22, c: 25, k_h: 4000, k_v_up: 1500, k_v_down: 8000, E_soil: 15 },
  "Veen": { gamma: 12, phi: 10, c: 5, k_h: 500, k_v_up: 200, k_v_down: 1000, E_soil: 2 },
  "Grind": { gamma: 18, phi: 35, c: 0, k_h: 15000, k_v_up: 5000, k_v_down: 25000, E_soil: 40 },
  "Aangevoerde grond": { gamma: 16, phi: 25, c: 5, k_h: 3000, k_v_up: 1000, k_v_down: 6000, E_soil: 10 },
} as const;

/**
 * Converteert Soil Wizard resultaten naar FEM solver soilSprings formaat.
 * Wizard output is in kN/m² en kN/m; FEM solver verwacht N/mm eenheden.
 */
function wizardResultsToSoilSprings(results: SoilWizardResult[]): any[] {
  return results.map(r => ({
    nodeId: r.nodeId,
    // Stijfheden: kN/m² → N/mm³ (÷1e6) — maar wizard KLH is al in kN/m²
    // FEM solver verwacht kh in N/mm³
    kh: r.KLH / 1e6,         // kN/m² → N/mm³
    kv_up: r.KLT / 1e6,      // kN/m² → N/mm³
    kv_down: r.KLS / 1e6,    // kN/m² → N/mm³
    kAxial: r.F / 1e6,       // wrijvingsstijfheid kN/m² → N/mm³
    // Maximale grondreacties (voor bilineair model)
    rMaxSide: r.RH,   // kN/m (= N/mm)
    rMaxDown: r.RVS,   // kN/m (= N/mm)
    rMaxUp: r.RVT,     // kN/m (= N/mm)
  }));
}

const NEN3650_FACTORS = {
  gamma_f_pressure: 1.39, gamma_f_soil: 1.0, gamma_f_traffic: 1.25,
  gamma_f_temp: 1.0, gamma_m: 1.1, gamma_m_plastic: 1.25,
  design_factor_class1: 0.72, design_factor_class2: 0.60,
  design_factor_class3: 0.50, design_factor_class4: 0.40,
  vm_limit_factor: 0.85,
};

const TRAFFIC_LOADS = {
  "Geen": { q: 0 }, "Licht (fiets)": { q: 10 },
  "Normaal (weg)": { q: 40 }, "Zwaar (snelweg)": { q: 60 },
  "Spoorweg": { q: 80 }, "Aangepast": { q: 0 },
} as const;

// ============================================================
// Engineering Calculations
// ============================================================
function calcGeometry(D: number, t: number) {
  const Di = D - 2*t, ro = D/2, ri = Di/2;
  const As = Math.PI*(ro*ro - ri*ri);
  const I = (Math.PI/64)*(Math.pow(D,4) - Math.pow(Di,4));
  return { Di, ro, ri, As, I, W: I/ro, Ab: Math.PI*ri*ri, SDR: D/t };
}

function parsePLEFile(file: File): Promise<{ nodes: any[], elements: any[], meta: any }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets["POLYDIF"];
        if (!ws) return reject(new Error("POLYDIF sheet ontbreekt"));
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        const header = (rows[0] as any[] || []).map((h: any) => (h || "").toString().trim());
        const idx = (name: string) => header.indexOf(name);
        const toNum = (v: any) => {
          if (v === null || v === undefined || v === "") return NaN;
          if (typeof v === "string") {
            let s = v.trim();
            if (!s) return NaN;
            if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
            else if (s.includes(",")) s = s.replace(",", ".");
            return Number(s);
          }
          return Number(v);
        };
        const normalizeId = (id: any) => (id || "").toString().trim();
        const parseSheet = (name: string) => {
          const w = wb.Sheets[name];
          if (!w) return [];
          return XLSX.utils.sheet_to_json(w, { header: 1, raw: true, defval: null });
        };
        const sheetToObjects = (rows: any[]) => {
          if (!rows?.length) return [];
          const h = (rows[0] || []).map((x: any) => (x || "").toString().trim());
          const out: any[] = [];
          // PLE4Win sheets: row 0 = header, row 1 = units (mm/°C/etc), row 2+ = data
          // Skip row 1 (units) by starting at i=2
          for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const obj: any = {};
            h.forEach((k: string, j: number) => { if (k) obj[k] = row[j]; });
            out.push(obj);
          }
          return out;
        };

        // Build model using DHStress-style CONNECT logic when available
        let nodes: any[] = [];
        let elements: any[] = [];
        let istropMap = new Map<string, any>();
        let coatingSegments: any[] = [];
        let endptsMap = new Map<string, any>();
        let elsprsMap = new Map<string, any>();
        let supportList: any[] = [];
        let adidentList: any[] = [];
        let loadCases: any[] = [];
        let subsideMap = new Map<string, any>();
        let supangMap = new Map<string, any>();
        let sectionList: any[] = [];
        let teeconfMap = new Map<string, any>();
        let teeSpecMap = new Map<string, any>();
        let connectsList: any[] = [];

        if (wb.Sheets["CONNECT"]) {
          const sheets = {
            POLYDIF: parseSheet("POLYDIF"),
            DIAM: parseSheet("DIAM"),
            WALL: parseSheet("WALL"),
            MATL: parseSheet("MATL"),
            CONNECT: parseSheet("CONNECT"),
            TEESPEC: parseSheet("TEESPEC"),
            ORIGIN: parseSheet("ORIGIN"),
            ISTROP: parseSheet("ISTROP"),
            COATING: parseSheet("COATING"),
            ENDPTS: parseSheet("ENDPTS"),
            ELSPRS: parseSheet("ELSPRS"),
            SUPPORT: parseSheet("SUPPORT"),
            ADIDENT: parseSheet("ADIDENT"),
            LOCASE: parseSheet("LOCASE"),
            SUBSIDE: parseSheet("SUBSIDE"),
            SUPANG: parseSheet("SUPANG"),
            SECTION: parseSheet("SECTION"),
            TEECONF: parseSheet("TEECONF"),
          } as any;

          const polydif = sheetToObjects(sheets.POLYDIF || []);

          // PLE4Win: startnode S1 staat in de units-rij (index 1) van POLYDIF, kolommen 17-20
          // sheetToObjects slaat rij 1 over -> S1 handmatig toevoegen als eerste node
          const polydifRaw = sheets.POLYDIF || [];
          const unitsRow = polydifRaw[1] as any[] | null;
          if (unitsRow && unitsRow[17] && typeof unitsRow[18] === "number" && typeof unitsRow[19] === "number") {
            const s1Node: any = {
              "IDENT": (unitsRow[17] || "").toString().trim(),
              "X-N": unitsRow[18],
              "Y-N": unitsRow[19],
              "Z-N": unitsRow[20] ?? 0,
              "BENDRAD": null,
              "ETYP": "",
              "D0": unitsRow[23] ?? null,
              "DPE": unitsRow[24] ?? null,
            };
            polydif.unshift(s1Node);
          }
          const diam = sheetToObjects(sheets.DIAM || []);
          const wall = sheetToObjects(sheets.WALL || []);
          const matl = sheetToObjects(sheets.MATL || []);
          const connect = sheetToObjects(sheets.CONNECT || []);
          connectsList = connect;
          const teespec = sheetToObjects(sheets.TEESPEC || []);
          const origin = sheetToObjects(sheets.ORIGIN || []);

          const originRow = origin?.[0] || {};
          const ox = toNum(originRow["X-S"]) || 0;
          const oy = toNum(originRow["Y-S"]) || 0;
          const oz = toNum(originRow["Z-S"]) || 0;

          const diamMap = new Map(diam.map((d: any) => [normalizeId(d.Identifier || d.IDENT), d]));
          const wallMap = new Map(wall.map((d: any) => [normalizeId(d.Identifier || d.IDENT), d]));
          const matlMap = new Map(matl.map((d: any) => [normalizeId(d.Identifier || d.IDENT), d]));
          const teeSpecMap = new Map(teespec.map((t: any) => [normalizeId(t["TEE-REF"] || t.TEEREF), t]));

          // ISTROP: materiaalbibliotheek uit Excel (overschrijft hardcoded MATERIALS)
          const istrop = sheetToObjects(sheets.ISTROP || []);
          const istropMap = new Map(istrop.map((m: any) => [
            normalizeId(m.MATREF),
            {
              E: toNum(m.Emod) || 207000,
              poisson: toNum(m.Nu) || 0.3,
              alpha: toNum(m.ALPHA) || 12e-6,
              SMYS: toNum(m.Re) || 235,
              density: toNum(m.WEIGHT) ? Math.round(toNum(m.WEIGHT) * 1e9 / 9.81) : 7850,
              type: "steel" as const,
            }
          ]));

          // COATING: per tracésegment (start→end identifier, type, dikte, gewicht)
          const coating = sheetToObjects(sheets.COATING || []);
          const coatingSegments = coating.map((c: any) => ({
            start: normalizeId(c["Start Identifier"]),
            end: normalizeId(c["End Identifier"]),
            name: (c.NAME || "").toString().trim(),
            type: (c.TYPE || "").toString().trim(), // "Medium" | "External"
            thick: toNum(c.THICK) || 0, // mm
            weight: toNum(c.WEIGHT) || 0, // N/mm³
          }));

          // ENDPTS: randvoorwaarden per eindpunt
          const endpts = sheetToObjects(sheets.ENDPTS || []);
          const endptsMap = new Map(endpts.map((e: any) => [
            normalizeId(e.IDENT),
            { cond: (e.COND || "fixed").toString().trim(), state: (e.STATE || "open").toString().trim() }
          ]));

          // ELSPRS: verenstijfheden per SUPREF
          const elsprs = sheetToObjects(sheets.ELSPRS || []);
          const elsprsMap = new Map(elsprs.map((s: any) => [
            normalizeId(s.SPRREF),
            {
              kx: toNum(s.XX) || 0,
              ky: toNum(s.YY) || 0,
              kz: toNum(s.ZZ) || 0,
              kphi: toNum(s["PHI-PHI"]) || 0,
            }
          ]));

          // SUPPORT: steunpuntposities per node
          const support = sheetToObjects(sheets.SUPPORT || []);
          const supportList = support.map((s: any) => ({
            refIdent: normalizeId(s.REFIDENT),
            deltaAxL: toNum(s["∆AX-L"]) || 0,
            cosys: (s.COSYS || "Local").toString().trim(),
            supRef: normalizeId(s.SUPREF),
            supLeng: toNum(s.SUPPLENG) || 0,
            supAngle: toNum(s.SUPANGLE) || 0,
          }));

          // ADIDENT: tussenliggende knooppunten per bochtpunt
          const adident = sheetToObjects(sheets.ADIDENT || []);
          const adidentList = adident.map((a: any) => ({
            refIdent: normalizeId(a.REFIDENT),
            deltaAxL: toNum(a["∆AX-L"]) || 0,
            newIdent: normalizeId(a.NEWIDENT),
          }));

          // LOCASE: belastingscombinaties
          const locase = sheetToObjects(sheets.LOCASE || []);
          loadCases = locase.map((l: any) => {
            const lcId = (l.LC || "").toString().trim();
            // PLE4Win: LC='-' is het standaard lastgeval
            // Als PRESS-F=0 en T-DIF-F=0 is het een eigengewicht-lastgeval
            const pressF = toNum(l["PRESS-F"]) ?? 0;
            const tDifF = toNum(l["T-DIF-F"]) ?? 0;
            const isEigengewicht = pressF === 0 && tDifF === 0;
            const lcName = (lcId === "-" || lcId === "" || lcId === "–")
              ? (isEigengewicht ? "Eigengewicht" : "Bedrijf")
              : lcId;
            return {
              lc: lcName,
              gloadF: toNum(l.GLOADF) ?? 1,
              pressF,
              tDifF,
              deadwF: toNum(l["DEADW-F"]) ?? 0,
              setlF: toNum(l["SETL-F"]) ?? 0,
              nodalF: toNum(l["NODAL-F"]) ?? 0,
              elbndF: toNum(l["ELBND-F"]) ?? 0,
              wavcF: toNum(l["WAVC-F"]) ?? 0,
            };
          });
          // Fallback: als er geen loadcases zijn, maak een default bedrijfsconditie
          if (loadCases.length === 0) {
            loadCases.push({ lc: "Bedrijf", gloadF: 1, pressF: 1, tDifF: 1, deadwF: 1, setlF: 1, nodalF: 0, elbndF: 0, wavcF: 0 });
          }
          // PLE4Win: als het enige lastgeval alleen eigengewicht is (PRESS-F=0, T-DIF-F=0),
          // voeg automatisch een volledig bedrijfs-lastgeval toe zodat de FEM solver
          // ook druk + temperatuur berekent. In PLE4Win maakt de gebruiker dit handmatig.
          const hasFullLC = loadCases.some((lc: any) => (lc.pressF > 0 || lc.tDifF > 0));
          if (!hasFullLC) {
            loadCases.push({ lc: "Bedrijf", gloadF: 1, pressF: 1, tDifF: 1, deadwF: 1, setlF: 1, nodalF: 0, elbndF: 0, wavcF: 0 });
          }

          // SUBSIDE: zakking per node (sinusvormig)
          const subside = sheetToObjects(sheets.SUBSIDE || []);
          const subsideMap = new Map(subside.map((s: any) => [
            normalizeId(s.Identifier),
            {
              subzMax: toNum(s.SUBZMAX) || 0, // mm, negatief = zakking
              uncF: toNum(s.UNCF) || 1.0,
              length: toNum(s.LENGTH) || 3000, // mm
              shape: (s.SINESHAPE || "Double").toString().trim(), // "Double"|"Right"|"Left"
            }
          ]));

          // SUPANG: bochtspreiding per node
          const supang = sheetToObjects(sheets.SUPANG || []);
          const supangMap = new Map(supang.map((s: any) => [
            normalizeId(s.Identifier),
            {
              angMin: toNum(s.ANGMIN) || 122,
              angMax: toNum(s.ANGMAX) || 180,
              rvsl: toNum(s.RVSL) || 50,
              rvsh: toNum(s.RVSH) || 100,
              curve: (s.CURVE || "Sinus").toString().trim(),
            }
          ]));

          // SECTION: toetsingsecties
          const section = sheetToObjects(sheets.SECTION || []);
          const sectionList = section.map((s: any) => ({
            start: normalizeId(s["Start Identifier"]),
            end: normalizeId(s["End Identifier"]),
            topLoad: (s.TOPLOAD || "Yes").toString().trim() === "Yes",
            sAllow: toNum(s["S-ALLOW"]) || null,
          }));

          // TEECONF: T-stuk configuratie (vermoeiing)
          const teeconfRaw = sheetToObjects(sheets.TEECONF || []);
          const teeconfMap = new Map(teeconfRaw.map((t: any) => [
            normalizeId(t["TEE-REF"]),
            {
              lRun: toNum(t["L-RUN"]) || 700,
              lBrn: toNum(t["L-BRN"]) || 363,
              cycles: toNum(t.CYCLES) || 2000,
            }
          ]));

          polydif.forEach((p: any, idx: number) => {
            const id = normalizeId(p.IDENT || p["IDENT"]) || `N${idx+1}`;
            const xN = toNum(p["X-N"]);
            const yN = toNum(p["Y-N"]);
            const zN = toNum(p["Z-N"]) ?? 0;
            if (xN === null || yN === null || !Number.isFinite(xN) || !Number.isFinite(yN)) return;
            const bendR = toNum(p.BENDRAD);
            nodes.push({
              id,
              x: xN - ox,
              y: yN - oy,
              z: zN - oz,
              bendR,
              etyp: p.ETYP || p.BEND_EL || p.PIPE_EL || "",
              D0: toNum(p.D0),
              DPE: toNum(p.DPE),
            });
          });

          const endptsSheet = sheetToObjects(parseSheet("ENDPTS"));
          const endpointSet = new Set(endptsSheet.map((e: any) => normalizeId(e.IDENT)));
          const teeWeldMap = new Map<string, string>();
          connect.forEach((c: any) => { teeWeldMap.set(normalizeId(c.IDENT2), normalizeId(c.IDENT1)); });

          for (let i = 0; i < nodes.length - 1; i++) {
            const n1 = nodes[i];
            const n2 = nodes[i + 1];
            const n1IsEndpoint = endpointSet.has(n1.id) && i > 0;
            const n2IsBranchStart = teeWeldMap.has(n2.id);
            if (n1IsEndpoint && n2IsBranchStart) continue;
            const dRow = diamMap.get(n1.id) || diamMap.get(n2.id) || {};
            const wRow = wallMap.get(n1.id) || wallMap.get(n2.id) || {};
            const mRow = matlMap.get(n1.id) || matlMap.get(n2.id) || {};
            const d = toNum(dRow.DOUT1) || toNum(dRow.DOUT2) || n1.D0 || 139.7;
            const t = toNum(wRow["T-NOM1"]) || toNum(wRow["T-NOM2"]) || 3.6;
            const type = (n1.bendR || n2.bendR || (n1.etyp || "").toString().toLowerCase().includes("bend")) ? "bend" : "straight";
            elements.push({
              n1: i, n2: i + 1,
              d, t, dc: d + 2 * (n1.DPE || 0),
              dpe: n1.DPE || n2.DPE || 0,
              type,
              R: n1.bendR || n2.bendR || d * 3,
            });
          }

          connect.forEach((c: any) => {
            const id1 = normalizeId(c.IDENT1);
            const id2 = normalizeId(c.IDENT2);
            const nIdx1 = nodes.findIndex(n => n.id === id1);
            const nIdx2 = nodes.findIndex(n => n.id === id2);
            if (nIdx1 >= 0 && nIdx2 >= 0) {
              const elIdx = elements.findIndex(e => (e.n1 === nIdx1 && e.n2 === nIdx2) || (e.n1 === nIdx2 && e.n2 === nIdx1));
              if (elIdx >= 0) {
                elements[elIdx].type = "tee";
                const tconf = teeSpecMap.get(normalizeId(c["TEE-REF"]));
                if (tconf?.["D-RUN"]) elements[elIdx].d = toNum(tconf["D-RUN"]) || elements[elIdx].d;
                if (tconf?.["T-RUN"]) elements[elIdx].t = toNum(tconf["T-RUN"]) || elements[elIdx].t;
              }
            }
          });

          // ═══ ADIDENT: Voeg extra interpolatiepunten toe ═══
          // PLE4Win: ADIDENT definieert extra nodes op afstand ΔAX-L van een referentie-ident
          // Deze worden INGEVOEGD in de nodelijst op de juiste positie langs de leiding-as
          if (adidentList.length > 0) {
            const insertions: { refIdx: number; delta: number; newId: string }[] = [];
            adidentList.forEach((ad: any) => {
              const refIdx = nodes.findIndex((n: any) => n.id === ad.refIdent);
              if (refIdx < 0) return;
              insertions.push({ refIdx, delta: ad.deltaAxL, newId: ad.newIdent });
            });
            // Sorteer per referentie-index, dan per delta (negatief = vóór, positief = ná)
            insertions.sort((a, b) => a.refIdx - b.refIdx || a.delta - b.delta);
            
            // Voeg nodes in van achteren naar voren (zodat indices niet verschuiven)
            const grouped = new Map<number, typeof insertions>();
            insertions.forEach(ins => {
              if (!grouped.has(ins.refIdx)) grouped.set(ins.refIdx, []);
              grouped.get(ins.refIdx)!.push(ins);
            });
            
            // Verwerk per groep
            const sortedRefIdxs = [...grouped.keys()].sort((a, b) => b - a); // van achter naar voor
            for (const refIdx of sortedRefIdxs) {
              const group = grouped.get(refIdx)!;
              const refNode = nodes[refIdx];
              
              for (const ins of group.reverse()) {
                // Bereken positie: interpoleer langs de leiding-as
                // ΔAX-L < 0: vóór de referentie, > 0: ná de referentie
                const targetIdx = ins.delta < 0 ? refIdx - 1 : refIdx;
                const otherIdx = ins.delta < 0 ? refIdx : refIdx + 1;
                
                if (targetIdx < 0 || otherIdx >= nodes.length) continue;
                
                const nA = nodes[targetIdx];
                const nB = nodes[otherIdx];
                if (!nA || !nB) continue;
                
                const dx = nB.x - nA.x;
                const dy = nB.y - nA.y;
                const dz = (nB.z || 0) - (nA.z || 0);
                const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                if (segLen < 1) continue;
                
                // Fractie langs het segment
                const absDelta = Math.abs(ins.delta);
                const frac = Math.min(absDelta / segLen, 0.99);
                const t_frac = ins.delta < 0 ? (1 - frac) : frac;
                
                const newNode = {
                  id: ins.newId,
                  x: nA.x + dx * t_frac,
                  y: nA.y + dy * t_frac,
                  z: (nA.z || 0) + dz * t_frac,
                  bendR: null,
                  etyp: "",
                  D0: refNode.D0,
                  DPE: refNode.DPE,
                  _isAdident: true,
                };
                
                // Voeg in op de juiste positie
                const insertAt = ins.delta < 0 ? refIdx : refIdx + 1;
                nodes.splice(insertAt, 0, newNode);
              }
            }
            
            // Herbouw elementen na ADIDENT insertie
            elements.length = 0;
            for (let i = 0; i < nodes.length - 1; i++) {
              const n1 = nodes[i];
              const n2 = nodes[i + 1];
              const n1IsEndpoint = endpointSet.has(n1.id) && i > 0;
              const n2IsBranchStart = teeWeldMap.has(n2.id);
              if (n1IsEndpoint && n2IsBranchStart) continue;
              const dRow2 = diamMap.get(n1.id) || diamMap.get(n2.id) || {};
              const wRow2 = wallMap.get(n1.id) || wallMap.get(n2.id) || {};
              const d2 = toNum(dRow2.DOUT1) || toNum(dRow2.DOUT2) || n1.D0 || 139.7;
              const t2 = toNum(wRow2["T-NOM1"]) || toNum(wRow2["T-NOM2"]) || 3.6;
              const type2 = (n1.bendR || n2.bendR || (n1.etyp || "").toString().toLowerCase().includes("bend")) ? "bend" : "straight";
              elements.push({
                n1: i, n2: i + 1,
                d: d2, t: t2, dc: d2 + 2 * (n1.DPE || 0),
                dpe: n1.DPE || n2.DPE || 0,
                type: type2,
                R: n1.bendR || n2.bendR || d2 * 3,
              });
            }
            // Herhaal CONNECT markering
            connect.forEach((c: any) => {
              const id1b = normalizeId(c.IDENT1);
              const id2b = normalizeId(c.IDENT2);
              const nIdx1b = nodes.findIndex(n => n.id === id1b);
              const nIdx2b = nodes.findIndex(n => n.id === id2b);
              if (nIdx1b >= 0 && nIdx2b >= 0) {
                const elIdxb = elements.findIndex(e => (e.n1 === nIdx1b && e.n2 === nIdx2b) || (e.n1 === nIdx2b && e.n2 === nIdx1b));
                if (elIdxb >= 0) {
                  elements[elIdxb].type = "tee";
                  const tconf2 = teeSpecMap.get(normalizeId(c["TEE-REF"]));
                  if (tconf2?.["D-RUN"]) elements[elIdxb].d = toNum(tconf2["D-RUN"]) || elements[elIdxb].d;
                  if (tconf2?.["T-RUN"]) elements[elIdxb].t = toNum(tconf2["T-RUN"]) || elements[elIdxb].t;
                }
              }
            });
          }

          // ═══ COATING: Bereken DPE per node uit coating segmenten ═══
          // PLE4Win: COATING definieert isolatielagen per tracédeel (Start→End)
          // DPE = buitendiameter + 2 × Σ(coating diktes van type "External")
          if (coatingSegments.length > 0) {
            // Bouw een lookup: voor elke node, zoek welke coating-segmenten van toepassing zijn
            const nodeIdList = nodes.map((n: any) => n.id);
            nodes.forEach((node: any, ni: number) => {
              let totalCoatingThick = 0;
              let hasCoating = false;
              
              coatingSegments.forEach((cs: any) => {
                if (cs.type !== "External") return;
                // Check of deze node binnen het segment [start, end] valt
                const startIdx = nodeIdList.indexOf(cs.start);
                const endIdx = nodeIdList.indexOf(cs.end);
                if (startIdx < 0 || endIdx < 0) return;
                const lo = Math.min(startIdx, endIdx);
                const hi = Math.max(startIdx, endIdx);
                if (ni >= lo && ni <= hi) {
                  totalCoatingThick += cs.thick || 0;
                  hasCoating = true;
                }
              });
              
              if (hasCoating) {
                // Zoek de buisdiameter voor deze node
                const connEl = elements.find((el: any) => el.n1 === ni || el.n2 === ni);
                const D_pipe = connEl ? connEl.d : (node.D0 || 139.7);
                node.DPE = D_pipe + 2 * totalCoatingThick;
                // Update ook het element dc (mantelbuisdiameter)
                if (connEl) connEl.dc = node.DPE;
              }
            });
            
            // Update medium-vulling (water) eigengewicht per node uit coating
            const mediumCoatings = coatingSegments.filter((cs: any) => cs.type === "Medium");
            if (mediumCoatings.length > 0) {
              nodes.forEach((node: any, ni: number) => {
                mediumCoatings.forEach((cs: any) => {
                  const startIdx = nodeIdList.indexOf(cs.start);
                  const endIdx = nodeIdList.indexOf(cs.end);
                  if (startIdx < 0 || endIdx < 0) return;
                  if (ni >= Math.min(startIdx, endIdx) && ni <= Math.max(startIdx, endIdx)) {
                    node.mediumWeight = cs.weight || 0; // N/mm³
                  }
                });
              });
            }
          }

          // ═══ SUPANG: Sla steunhoeken op per node voor ring model ═══
          // Wordt later in de FEM solver gebruikt voor grondreactie-verdeling
          // Data is al in supangMap — koppel aan node indices
          // ═══ SUPPORT met ΔAX-L: koppel steunpunt aan juiste node ═══
          // PLE4Win: SUPPORT.REFIDENT + ΔAX-L bepaalt de locatie langs de leiding
          // Als ΔAX-L ≠ 0, zoek de dichtstbijzijnde ADIDENT node
          supportList.forEach((sup: any) => {
            if (sup.deltaAxL && Math.abs(sup.deltaAxL) > 1) {
              // Zoek een ADIDENT node die op deze afstand van de referentie zit
              const nearestAdident = nodes.findIndex((n: any) => {
                if (!n._isAdident) return false;
                const refIdx = nodes.findIndex((rn: any) => rn.id === sup.refIdent);
                if (refIdx < 0) return false;
                // Check of deze node dicht bij de verwachte positie zit
                const ref = nodes[refIdx];
                const dx = n.x - ref.x;
                const dy = n.y - ref.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return Math.abs(dist - Math.abs(sup.deltaAxL)) < 100; // 100mm tolerantie
              });
              if (nearestAdident >= 0) {
                sup._resolvedNodeId = nodes[nearestAdident].id;
                sup._resolvedNodeIdx = nearestAdident;
              }
            }
          });
        } else {
          const ix = idx("X-N"), iy = idx("Y-N"), iz = idx("Z-N");
          if (ix < 0 || iy < 0) return reject(new Error("POLYDIF mist X-N/Y-N"));
          // Origin offset
          const ows = wb.Sheets["ORIGIN"];
          let ox = 0, oy = 0, oz = 0;
          if (ows) {
            const orows = XLSX.utils.sheet_to_json(ows, { header: 1, raw: true, defval: null });
            const r = orows[2] as any[];
            if (r) { ox = Number(r[2] || 0); oy = Number(r[3] || 0); oz = Number(r[4] || 0); }
          }
          // Skip rij 1 (units-rij) en start bij rij 2 (eerste echte data-rij)
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i] as any[];
            const x = toNum(r[ix]) - ox;
            const y = toNum(r[iy]) - oy;
            const z = iz >= 0 ? toNum(r[iz] || 0) - oz : 0;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            nodes.push({ x, y, z });
          }
          for (let i = 0; i < nodes.length - 1; i++) elements.push({ n1: i, n2: i + 1 });
        }

        // Auto-scale verwijderd: coördinaten blijven altijd in mm.
        // Ple3DViewer doet intern /1000 (mm→m) voor alle geïmporteerde nodes.
        // Geen extra centroid-aftrek nodig: origin (ORIGIN sheet) is al afgetrokken.
        // De auto-scale (1e6 check hierboven) schaalt mm→m als het netwerk te groot is.

        // Basic meta from DIAM/WALL/PRESS/TEMP/MATL
        // PLE4Win rows: [0]=header, [1]=units, [2]=first data row
        const meta: any = {};

        const getRow = (sheet: string) => {
          const w = wb.Sheets[sheet];
          if (!w) return null;
          const r = XLSX.utils.sheet_to_json(w, { header: 1, raw: true, defval: null });
          return r[2] as any[]; // index 2 = eerste data-rij (na header + units)
        };

        // Per-node G-LEVEL map voor variabele dekking per tracésegment
        const buildCoverMap = () => {
          const w = wb.Sheets["G-LEVEL"];
          if (!w) return new Map<string, number>();
          const rows = XLSX.utils.sheet_to_json(w, { header: 1, raw: true, defval: null }) as any[][];
          const map = new Map<string, number>();
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r[1] == null) continue;
            const id = (r[1] || "").toString().trim();
            const cover = Number(r[2]);
            if (id && Number.isFinite(cover)) map.set(id, cover);
          }
          return map;
        };

        // Per-node W-LEVEL map voor variabele grondwaterstand per tracésegment
        const buildWaterMap = () => {
          const w = wb.Sheets["W-LEVEL"];
          if (!w) return new Map<string, number>();
          const rows = XLSX.utils.sheet_to_json(w, { header: 1, raw: true, defval: null }) as any[][];
          const map = new Map<string, number>();
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r[1] == null) continue;
            const id = (r[1] || "").toString().trim();
            const water = Number(r[2]);
            if (id && Number.isFinite(water)) map.set(id, water);
          }
          return map;
        };

        const coverMap = buildCoverMap();
        const waterMap = buildWaterMap();

        // Sla per-node maps op in meta zodat de viewer ze kan gebruiken
        meta.coverMap = Object.fromEntries(coverMap);
        meta.waterMap = Object.fromEntries(waterMap);

        const diamRow = getRow("DIAM");
        const wallRow = getRow("WALL");
        const press = getRow("PRESS");
        const temp = getRow("TEMP");
        const matl = getRow("MATL");
        const glevel = getRow("G-LEVEL");
        const wlevel = getRow("W-LEVEL");

        // DIAM: kolom 2 = DOUT1 (buitendiameter mm)
        if (diamRow) meta.D = Number(diamRow[2]);
        if (wallRow) meta.t = Number(wallRow[2]); // WALL: kolom 2 = T-NOM1
        if (!meta.D && elements[0]?.d) meta.D = elements[0].d;
        if (!meta.t && elements[0]?.t) meta.t = elements[0].t;

        // PRESS: kolom 2 = PRESS1 (N/mm²)
        if (press) meta.Pi = Number(press[2]);

        // TEMP: kolom 2 = T-ABS1 (bedrijfstemperatuur), kolom 3 = T-REF1 (installatietemperatuur)
        if (temp) {
          meta.Top = Number(temp[2]);
          meta.Tinst = Number(temp[3] ?? 10);
          if (!Number.isFinite(meta.Tinst)) meta.Tinst = 10;
        }

        // LOCASE factoren toepassen op Pi en Top
        meta.PiRaw = meta.Pi;
        meta.TopRaw = meta.Top;
        if (loadCases.length > 0) {
          const lc0 = loadCases[0];
          const pF = (lc0.pressF != null) ? lc0.pressF : 1;
          const tF = (lc0.tDifF != null) ? lc0.tDifF : 1;
          meta.Pi = (meta.Pi || 0) * pF;
          meta.Top = (meta.Tinst || 10) + ((meta.TopRaw || 100) - (meta.Tinst || 10)) * tF;
        }

        // MATL: kolom 2 = MATREF (bijv. "P235GH")
        if (matl) meta.mat = (matl[2] || "").toString().trim();

        // Fallback globale dekking (eerste node in G-LEVEL of default 500mm)
        if (glevel) meta.cover = Number(glevel[2]);
        if (wlevel) meta.water = Number(wlevel[2]);
        if (!Number.isFinite(meta.cover)) meta.cover = 500;
        if (!Number.isFinite(meta.water)) meta.water = 0;

        // Sla alle engineering data op in meta
        meta.istropMap = Object.fromEntries(istropMap);
        meta.coatingSegments = coatingSegments;
        meta.endptsMap = Object.fromEntries(endptsMap);
        meta.elsprsMap = Object.fromEntries(elsprsMap);
        meta.supportList = supportList;
        meta.adidentList = adidentList;
        meta.loadCases = loadCases;
        meta.subsideMap = Object.fromEntries(subsideMap);
        meta.supangMap = Object.fromEntries(supangMap);
        meta.sectionList = sectionList;
        meta.adidentCount = adidentList.length;
        meta.adidentInserted = nodes.filter((n: any) => n._isAdident).length;
        meta.teeconfMap = Object.fromEntries(teeconfMap);
        meta.teeSpecData = Object.fromEntries(teeSpecMap);
        meta.connects = (connectsList || []).map((c: any) => ({ id1: normalizeId(c.IDENT1), id2: normalizeId(c.IDENT2), name: normalizeId(c.CONNAME), teeRef: normalizeId(c["TEE-REF"]) }));
        meta.nodeCount = nodes.length;

        // Bewaar ruwe sheet data voor Excel export
        meta._rawSheets = {
          ORIGIN: parseSheet("ORIGIN"),
          POLYDIF: parseSheet("POLYDIF"),
          DIAM: parseSheet("DIAM"),
          WALL: parseSheet("WALL"),
          MATL: parseSheet("MATL"),
          ISTROP: parseSheet("ISTROP"),
          CONNECT: parseSheet("CONNECT"),
          TEESPEC: parseSheet("TEESPEC"),
          TEECONF: parseSheet("TEECONF"),
          COATING: parseSheet("COATING"),
          ENDPTS: parseSheet("ENDPTS"),
          ELSPRS: parseSheet("ELSPRS"),
          SUPPORT: parseSheet("SUPPORT"),
          ADIDENT: parseSheet("ADIDENT"),
          PRESS: parseSheet("PRESS"),
          TEMP: parseSheet("TEMP"),
          LOCASE: parseSheet("LOCASE"),
          SUBSIDE: parseSheet("SUBSIDE"),
          SUPANG: parseSheet("SUPANG"),
          SECTION: parseSheet("SECTION"),
          "G-LEVEL": parseSheet("G-LEVEL"),
          "W-LEVEL": parseSheet("W-LEVEL"),
          GEOMCTL: parseSheet("GEOMCTL"),
          SOILCTL: parseSheet("SOILCTL"),
          DEADW: parseSheet("DEADW"),
          GROUPS: parseSheet("GROUPS"),
        };

        // GEOMCTL: geometrisch niet-lineaire instellingen (optioneel)
        try {
          const geomctlData = sheetToObjects(parseSheet("GEOMCTL"));
          if (geomctlData.length > 0) {
            const gc = geomctlData[0];
            meta.geomctl = {
              maxGeoIterations: toNum(gc.MAXGIT) || 10,
              geoConvergenceTol: toNum(gc.RELDISEQ) || 0.001,
              maxRotation: toNum(gc.ROTINCR) || 0.3,
            };
          }
        } catch { /* GEOMCTL sheet niet beschikbaar */ }

        // SOILCTL: grondmodel instellingen (optioneel)
        try {
          const soilctlData = sheetToObjects(parseSheet("SOILCTL"));
          if (soilctlData.length > 0) {
            const sc = soilctlData[0];
            meta.soilctl = {
              maxSoilIterations: toNum(sc.MAXSIT) || 20,
            };
          }
        } catch { /* SOILCTL sheet niet beschikbaar */ }

        // Gebruik ISTROP materiaaldata als beschikbaar, anders fallback naar meta.mat lookup
        if (meta.mat && istropMap.has(meta.mat)) {
          meta.matProps = istropMap.get(meta.mat);
        }

        resolve({ nodes, elements, meta });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Herparst rawSheets naar nodes/elements/meta ZONDER een volledig Excel bestand te rebuilden.
 * Gebruikt voor Herberekenen na Editor wijzigingen.
 */
function rebuildModelFromRawSheets(rawSheets: Record<string, any[][]>, existingMeta: any): { nodes: any[], elements: any[], meta: any } {
  const toNum = (v: any) => {
    if (v === null || v === undefined || v === "") return NaN;
    if (typeof v === "string") {
      let s = v.trim();
      if (!s) return NaN;
      if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
      else if (s.includes(",")) s = s.replace(",", ".");
      return Number(s);
    }
    return Number(v);
  };
  const normalizeId = (id: any) => (id || "").toString().trim();
  const sheetToObjects = (rows: any[]) => {
    if (!rows?.length) return [];
    const h = (rows[0] || []).map((x: any) => (x || "").toString().trim());
    const out: any[] = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const obj: any = {};
      let hasData = false;
      h.forEach((k: string, j: number) => { if (k && k !== " ") { obj[k] = row[j]; if (row[j] != null && row[j] !== "") hasData = true; } });
      if (hasData) out.push(obj);
    }
    return out;
  };

  const polydif = sheetToObjects(rawSheets.POLYDIF || []);
  // S1 startnode uit units-rij
  const polydifRaw = rawSheets.POLYDIF || [];
  const unitsRow = polydifRaw[1] as any[] | null;
  if (unitsRow && unitsRow[17] && typeof unitsRow[18] === "number" && typeof unitsRow[19] === "number") {
    polydif.unshift({
      "IDENT": (unitsRow[17] || "").toString().trim(),
      "X-N": unitsRow[18], "Y-N": unitsRow[19], "Z-N": unitsRow[20] ?? 0,
      "BENDRAD": null, "ETYP": "", "D0": unitsRow[23] ?? null, "DPE": unitsRow[24] ?? null,
    });
  }

  const diam = sheetToObjects(rawSheets.DIAM || []);
  const wall = sheetToObjects(rawSheets.WALL || []);
  const connect = sheetToObjects(rawSheets.CONNECT || []);
  const endpts = sheetToObjects(rawSheets.ENDPTS || []);
  const origin = sheetToObjects(rawSheets.ORIGIN || []);
  const originRow = origin?.[0] || {};
  const ox = toNum(originRow["X-S"]) || 0;
  const oy = toNum(originRow["Y-S"]) || 0;
  const oz = toNum(originRow["Z-S"]) || 0;

  const diamMap = new Map(diam.map((d: any) => [normalizeId(d.Identifier || d.IDENT), d]));
  const wallMap = new Map(wall.map((d: any) => [normalizeId(d.Identifier || d.IDENT), d]));
  const endpointSet = new Set(endpts.map((e: any) => normalizeId(e.IDENT)));
  const teeWeldMap = new Map<string, string>();
  connect.forEach((c: any) => { teeWeldMap.set(normalizeId(c.IDENT2), normalizeId(c.IDENT1)); });

  const nodes: any[] = [];
  polydif.forEach((p: any, idx: number) => {
    const id = normalizeId(p.IDENT || p["IDENT"]) || `N${idx+1}`;
    const xN = toNum(p["X-N"]);
    const yN = toNum(p["Y-N"]);
    const zN = toNum(p["Z-N"]) ?? 0;
    if (xN === null || yN === null || !Number.isFinite(xN) || !Number.isFinite(yN)) return;
    nodes.push({
      id, x: xN - ox, y: yN - oy, z: zN - oz,
      bendR: toNum(p.BENDRAD),
      etyp: p.ETYP || p.BEND_EL || p.PIPE_EL || "",
      D0: toNum(p.D0), DPE: toNum(p.DPE),
    });
  });

  const elements: any[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const n1 = nodes[i], n2 = nodes[i + 1];
    const n1IsEndpoint = endpointSet.has(n1.id) && i > 0;
    const n2IsBranchStart = teeWeldMap.has(n2.id);
    if (n1IsEndpoint && n2IsBranchStart) continue;
    const dRow = diamMap.get(n1.id) || diamMap.get(n2.id) || {};
    const wRow = wallMap.get(n1.id) || wallMap.get(n2.id) || {};
    const d = toNum(dRow.DOUT1) || toNum(dRow.DOUT2) || n1.D0 || 139.7;
    const t = toNum(wRow["T-NOM1"]) || toNum(wRow["T-NOM2"]) || 3.6;
    const type = (n1.bendR || n2.bendR || (n1.etyp || "").toString().toLowerCase().includes("bend")) ? "bend" : "straight";
    elements.push({ n1: i, n2: i + 1, d, t, dc: d + 2 * (n1.DPE || 0), dpe: n1.DPE || n2.DPE || 0, type, R: n1.bendR || n2.bendR || d * 3 });
  }

  // T-stuk verbindingen markeren
  const teespec = sheetToObjects(rawSheets.TEESPEC || []);
  const teeSpecMap = new Map(teespec.map((t: any) => [normalizeId(t["TEE-REF"] || t.TEEREF), t]));
  connect.forEach((c: any) => {
    const id1 = normalizeId(c.IDENT1), id2 = normalizeId(c.IDENT2);
    const nIdx1 = nodes.findIndex((n: any) => n.id === id1);
    const nIdx2 = nodes.findIndex((n: any) => n.id === id2);
    if (nIdx1 >= 0 && nIdx2 >= 0) {
      const elIdx = elements.findIndex((e: any) => (e.n1 === nIdx1 && e.n2 === nIdx2) || (e.n1 === nIdx2 && e.n2 === nIdx1));
      if (elIdx >= 0) {
        elements[elIdx].type = "tee";
        const tconf = teeSpecMap.get(normalizeId(c["TEE-REF"]));
        if (tconf?.["D-RUN"]) elements[elIdx].d = toNum(tconf["D-RUN"]) || elements[elIdx].d;
        if (tconf?.["T-RUN"]) elements[elIdx].t = toNum(tconf["T-RUN"]) || elements[elIdx].t;
      }
    }
  });

  // Behoud alle bestaande meta maar update connecties
  const meta = { ...existingMeta, _rawSheets: rawSheets };
  meta.connects = connect.map((c: any) => ({
    id1: normalizeId(c.IDENT1), id2: normalizeId(c.IDENT2),
    name: normalizeId(c.CONNAME), teeRef: normalizeId(c["TEE-REF"]),
  }));
  meta.teeSpecData = Object.fromEntries(teeSpecMap);

  return { nodes, elements, meta };
}

function calcStresses(P_int: number, P_ext: number, D: number, t: number, mat: any, Top: number, Tinst: number, Mb: number, g: any) {
  const P = (P_int - P_ext) * 0.1;
  const sh = (P * D) / (2 * t);
  const slp = mat.poisson * sh;
  const st = -mat.E * mat.alpha * (Top - Tinst);
  const sb = Mb > 0 ? (Mb * 1e6 * g.ro) / g.I : 0;
  const sl = slp + st + sb;
  const sec = (P * g.Ab) / g.As;
  const vm = Math.sqrt(sh*sh - sh*sl + sl*sl);
  const tr = Math.max(Math.abs(sh-sl), Math.abs(sh), Math.abs(sl));
  return { sh, slp, st, sb, sl, sec, vm, tr };
}

function calcSoil(soil: any, D: number, H: number) {
  const q = soil.gamma * H;
  const K0 = 1 - Math.sin(soil.phi * Math.PI / 180);
  return { q, K0, sh_soil: K0 * q, E_prime: soil.E_soil };
}

function calcOval(D: number, t: number, q: number, Ep: number, Es: number) {
  const r = D/2, It = t*t*t/12;
  const d = (1.5 * 0.1 * q * r*r*r) / (Ep*It + 0.061*Es*r*r*r);
  return { delta: d, pct: (d/D)*100 };
}

function calcImplode(D: number, t: number, E: number, v: number) {
  return (2*E) / (1-v*v) * Math.pow(t/D, 3);
}

function nenCheck(sh: number, vm: number, SMYS: number, cls: number, mtype: string) {
  const f = NEN3650_FACTORS;
  const gm = mtype==="plastic" ? f.gamma_m_plastic : f.gamma_m;
  const df = [0, f.design_factor_class1, f.design_factor_class2, f.design_factor_class3, f.design_factor_class4][cls];
  const sha = df * SMYS;
  const vma = f.vm_limit_factor * SMYS / gm;
  const hu = Math.abs(sh)/sha, vu = vm/vma;
  return { df, gm, sha, vma, hu, hp: hu<=1, vu, vp: vu<=1, cu: Math.max(hu,vu), ok: hu<=1 && vu<=1 };
}

// ============================================================
// Responsive hook
// ============================================================
function useIsMobile() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w < 768;
}

// ============================================================
// Shared Styles
// ============================================================
const css = {
  mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sans: "'Inter', -apple-system, system-ui, sans-serif",
  bg: "#020617", card: "#0f172a", border: "#1e293b",
  accent: "#3b82f6", green: "#22c55e", red: "#ef4444", yellow: "#eab308", orange: "#f97316",
  text: "#e2e8f0", muted: "#94a3b8", dim: "#64748b", faint: "#475569",
};

// ============================================================
// UI Components — Mobile First
// ============================================================

const Badge = ({ pass, label, unity, compact }: { pass: boolean; label: string; unity: number; compact?: boolean }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: compact ? 6 : 8,
    padding: compact ? "6px 10px" : "8px 14px",
    background: pass ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
    border: `1px solid ${pass ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
    borderRadius: 8, fontFamily: css.mono, fontSize: compact ? 11 : 13, flex: 1, minWidth: 0,
  }}>
    <span style={{ width: 7, height: 7, borderRadius: "50%", background: pass ? css.green : css.red, flexShrink: 0 }} />
    <span style={{ color: pass ? "#16a34a" : "#dc2626", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    <span style={{ color: css.dim, marginLeft: "auto", flexShrink: 0, fontSize: compact ? 10 : 12 }}>{unity.toFixed(3)}</span>
  </div>
);

const Input = ({ label, unit, value, onChange, step, info }: { label: string; unit?: string; value: number; onChange: (v: number) => void; step?: number; info?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    <label style={{ fontSize: 11, fontWeight: 500, color: css.muted, fontFamily: css.mono }}>
      {label} {unit && <span style={{ color: css.faint }}>[{unit}]</span>}
    </label>
    <input
      type="number" inputMode="decimal" value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      step={step || 0.1}
      style={{
        background: css.bg, border: `1px solid ${css.border}`, borderRadius: 8,
        padding: "10px 12px", color: css.text, fontSize: 15, fontFamily: css.mono,
        outline: "none", width: "100%", boxSizing: "border-box",
        WebkitAppearance: "none", MozAppearance: "textfield",
      }}
      onFocus={e => { e.currentTarget.style.borderColor = css.accent; e.currentTarget.select(); }}
      onBlur={e => { e.currentTarget.style.borderColor = css.border; }}
    />
    {info && <span style={{ fontSize: 10, color: css.faint }}>{info}</span>}
  </div>
);

const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    <label style={{ fontSize: 11, fontWeight: 500, color: css.muted, fontFamily: css.mono }}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: css.bg, border: `1px solid ${css.border}`, borderRadius: 8,
        padding: "10px 12px", color: css.text, fontSize: 14, fontFamily: css.mono,
        outline: "none", width: "100%", boxSizing: "border-box",
        WebkitAppearance: "none", MozAppearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
        paddingRight: 36,
      }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: css.card, border: `1px solid ${css.border}`, borderRadius: 12,
    padding: 16, ...style,
  }}>{children}</div>
);

const Section = ({ icon, title, sub, children, defaultOpen = true }: { icon: string; title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card style={{ marginBottom: 12 }}>
      <div onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
        marginBottom: open ? 14 : 0, userSelect: "none",
      }}>
        <span style={{ fontSize: 17 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", letterSpacing: -0.3 }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: css.dim, marginTop: 1 }}>{sub}</div>}
        </div>
        <span style={{
          fontSize: 12, color: css.dim, transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>▼</span>
      </div>
      {open && children}
    </Card>
  );
};

const Row = ({ label, value, unit, hl, warn }: { label: string; value: number | string; unit?: string; hl?: boolean; warn?: boolean }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "5px 0", borderBottom: "1px solid rgba(30,41,59,0.4)", gap: 8,
  }}>
    <span style={{ fontSize: 12, color: css.muted, flex: 1 }}>{label}</span>
    <span style={{
      fontSize: 13, fontWeight: 600, fontFamily: css.mono, flexShrink: 0,
      color: warn ? css.red : hl ? css.accent : css.text,
    }}>
      {typeof value === "number" ? value.toFixed(2) : value}
      {unit && <span style={{ color: css.faint, fontWeight: 400, fontSize: 11 }}> {unit}</span>}
    </span>
  </div>
);

const Gauge = ({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) => {
  const pct = Math.min((Math.abs(value) / max) * 100, 100);
  const c = pct < 50 ? css.green : pct < 72 ? css.yellow : pct < 85 ? css.orange : css.red;
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 10, color: css.dim, marginBottom: 3, fontFamily: css.mono }}>{label}</div>
      <div style={{ background: css.bg, borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: c, marginTop: 3, fontFamily: css.mono }}>
        {value.toFixed(1)} <span style={{ fontSize: 10, color: css.faint, fontWeight: 400 }}>/ {max.toFixed(0)} {unit}</span>
      </div>
    </div>
  );
};

const PropGrid = ({ items }: { items: [string, string, string?][] }) => (
  <div style={{
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px",
    fontSize: 11, fontFamily: css.mono, padding: "10px 12px",
    background: "rgba(30,41,59,0.4)", borderRadius: 8,
  }}>
    {items.map(([k, v, c]) => (
      <React.Fragment key={k}>
        <span style={{ color: css.muted }}>{k}</span>
        <span style={{ color: c || css.text, textAlign: "right" }}>{v}</span>
      </React.Fragment>
    ))}
  </div>
);

const FormulaBox = ({ title, color, lines }: { title: string; color: string; lines: string[] }) => (
  <div style={{ padding: 14, background: "rgba(30,41,59,0.4)", borderRadius: 8, flex: 1, minWidth: 200 }}>
    <div style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 6 }}>{title}</div>
    <div style={{ fontFamily: css.mono, fontSize: 12, color: css.text, lineHeight: 1.8 }}>
      {lines.map((l, i) => <div key={i} style={l.startsWith("=") ? { color, fontWeight: 600 } : {}}>{l}</div>)}
    </div>
  </div>
);

const PipeViz = ({ D, t, sh, sl, SMYS, mobile }: { D: number; t: number; sh: number; sl: number; SMYS: number; mobile: boolean }) => {
  const sz = mobile ? 160 : 200;
  const cx = sz/2, cy = sz/2, ro = mobile ? 55 : 70;
  const ri = ro * (1 - 2*t/D);
  const ratio = Math.min(Math.abs(sh)/SMYS, 1);
  const c = ratio < 0.5 ? `rgb(${Math.round(ratio*2*255)},${Math.round(200-ratio*100)},50)` :
    ratio < 0.85 ? `rgb(255,${Math.round((1-ratio)*400)},0)` : `rgb(255,${Math.round((1-ratio)*100)},${Math.round((1-ratio)*100)})`;
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ margin: "0 auto", display: "block" }}>
      <defs><radialGradient id="pg"><stop offset="0%" stopColor="#1e293b"/><stop offset="100%" stopColor="#0f172a"/></radialGradient></defs>
      <circle cx={cx} cy={cy} r={ro} fill="none" stroke={c} strokeWidth={ro-ri} opacity={0.7}/>
      <circle cx={cx} cy={cy} r={ri} fill="url(#pg)"/>
      {[0,90,180,270].map(a=>{const r2=(a*Math.PI)/180;return <circle key={a} cx={cx+(ro+10)*Math.cos(r2)} cy={cy+(ro+10)*Math.sin(r2)} r={2.5} fill={c} opacity={0.8}/>;})}
      <text x={cx} y={16} textAnchor="middle" fill={css.muted} fontSize={9} fontFamily={css.mono}>σh={sh.toFixed(1)}</text>
      <text x={cx} y={sz-6} textAnchor="middle" fill={css.muted} fontSize={9} fontFamily={css.mono}>σl={sl.toFixed(1)}</text>
      <text x={cx} y={cy-3} textAnchor="middle" fill={css.dim} fontSize={8} fontFamily={css.mono}>D={D}mm</text>
      <text x={cx} y={cy+10} textAnchor="middle" fill={css.dim} fontSize={8} fontFamily={css.mono}>t={t}mm</text>
    </svg>
  );
};

const Mohr = ({ sh, sl, mobile }: { sh: number; sl: number; mobile: boolean }) => {
  const sz = mobile ? 170 : 220;
  const cx = sz/2, cy = sz/2;
  const sa = (sh+sl)/2, R = Math.abs(sh-sl)/2;
  const mx = Math.max(Math.abs(sh), Math.abs(sl), Math.abs(sa+R)) || 1;
  const sc = (mobile ? 55 : 70)/mx;
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ margin: "0 auto", display: "block" }}>
      <line x1={8} y1={cy} x2={sz-8} y2={cy} stroke={css.border} strokeWidth={0.5}/>
      <line x1={cx} y1={8} x2={cx} y2={sz-8} stroke={css.border} strokeWidth={0.5}/>
      <circle cx={cx+sa*sc} cy={cy} r={Math.max(R*sc,2)} fill="rgba(59,130,246,0.06)" stroke={css.accent} strokeWidth={1.5}/>
      <circle cx={cx+sh*sc} cy={cy} r={3.5} fill={css.red}/>
      <circle cx={cx+sl*sc} cy={cy} r={3.5} fill={css.green}/>
      <circle cx={cx+sa*sc} cy={cy} r={2} fill={css.yellow}/>
      <text x={cx+sh*sc} y={cy-10} textAnchor="middle" fill={css.red} fontSize={8} fontFamily={css.mono}>σh</text>
      <text x={cx+sl*sc} y={cy+16} textAnchor="middle" fill={css.green} fontSize={8} fontFamily={css.mono}>σl</text>
    </svg>
  );
};


// ============================================================
// Roadmap workflow steps (PLE4Win-style guided workflow)
// ============================================================
interface RoadmapStep {
  id: string;
  label: string;
  icon: string;
  tab: string;           // welke tab opent bij klik
  required: boolean;     // moet voltooid zijn voor volgende stap
  description: string;   // korte omschrijving
}

const ROADMAP_STEPS: RoadmapStep[] = [
  { id: "project",   label: "Projectdefinitie",    icon: "📋", tab: "input",    required: true,  description: "Materiaal, diameter, wanddikte" },
  { id: "geometry",  label: "Geometrie",            icon: "📐", tab: "import",   required: true,  description: "PLE4Win import of handmatig" },
  { id: "pipedata",  label: "Buisgegevens",         icon: "🔧", tab: "import",   required: true,  description: "D, t, materiaal per segment" },
  { id: "soil",      label: "Grondcondities",       icon: "🏔️", tab: "soil",     required: true,  description: "Grondtype, dekking, verkeer" },
  { id: "boundary",  label: "Randvoorwaarden",      icon: "📌", tab: "import",   required: false, description: "Eindpunten, steunpunten" },
  { id: "loading",   label: "Belastingen",          icon: "⚡", tab: "input",    required: true,  description: "Druk, temperatuur, lastgevallen" },
  { id: "calculate", label: "Berekening",           icon: "🔄", tab: "model3d",  required: true,  description: "FEM solver uitvoeren" },
  { id: "results",   label: "Resultaten",           icon: "📊", tab: "results",  required: false, description: "Spanningen, verplaatsingen" },
  { id: "verify",    label: "Normtoetsing",         icon: "✅", tab: "nen3650",  required: false, description: "NEN 3650 / EN 13941 check" },
  { id: "report",    label: "Rapportage",           icon: "📄", tab: "report",   required: false, description: "PDF export" },
];

const TABS = [
  { id: "input", label: "Invoer", icon: "⚙️" },
  { id: "import", label: "Import", icon: "⬆️" },
  { id: "soil", label: "Grond", icon: "🏔️" },
  { id: "model3d", label: "3D Model", icon: "🧊" },
  { id: "results", label: "Resultaten", icon: "📊" },
  { id: "diagrams", label: "Diagrammen", icon: "📈" },
  { id: "tekening", label: "Tekening", icon: "📐" },
  { id: "nen3650", label: "NEN 3650", icon: "✅" },
  { id: "report", label: "Rapport", icon: "📄" },
  { id: "dhstress", label: "DHStress", icon: "🔥" },
  { id: "admin", label: "Admin", icon: "🛡️" },
];

// ============================================================
// Main App
// ============================================================
function PLECalculator() {
  const mobile = useIsMobile();
  const session = { user: { email: "desktop@kaimple.com", isAdmin: true } } as any;
  // Desktop: no router needed
  const [tab, setTab] = useState("input");

  const isAdmin = Boolean(session?.user?.isAdmin);
  const tabs = useMemo(() => (isAdmin ? TABS : TABS.filter(t => t.id !== "dhstress")), [isAdmin]);

  useEffect(() => {
    const api = (window as any).electronAPI; if (api?.importsList) { api.importsList().then((d: any) => setSavedImports(d?.items || [])).catch(() => {}); }
  }, []);

  const [matName, setMatName] = useState("API 5L X52");
  const [D, setD] = useState(323.9);
  const [t, setT] = useState(8.0);
  const [L, setL] = useState(1000);
  const [Pi, setPi] = useState(40);
  const [importError, setImportError] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedNodes, setImportedNodes] = useState<any[]>([]);
  const [importedEls, setImportedEls] = useState<any[]>([]);
  const [importedMeta, setImportedMeta] = useState<any>(null);
  const [femResults, setFemResults] = useState<any[]>([]);
  const [femAllLC, setFemAllLC] = useState<any[]>([]);
  const [activeLoadCase, setActiveLoadCase] = useState(-1);
  const [diagramHover, setDiagramHover] = useState<number | null>(null);
  const [savedImports, setSavedImports] = useState<any[]>([]);
  const [pleModel, setPleModel] = useState<PleModel | null>(null);

  // ============================================================
  // Persist import data in localStorage (overleeft page refresh)
  // ============================================================
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ple_import");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.nodes?.length > 0) {
          setImportedNodes(data.nodes);
          setImportedEls(data.elements || []);
          setImportedMeta(data.meta || null);
          setImportFileName(data.fileName || "");
          if (data.femResults?.length > 0) setFemResults(data.femResults);
          // Herstel basisparameters met RUWE waarden (niet LOCASE-gefactored)
          if (data.meta?.D) setD(data.meta.D);
          if (data.meta?.t) setT(data.meta.t);
          const rawPi2 = data.meta?.PiRaw ?? data.meta?.Pi;
          setPi(rawPi2 > 0 ? rawPi2 * 10 : 40); // N/mm² → bar
          setTop(data.meta?.TopRaw ?? data.meta?.Top ?? 60);
          setTin(data.meta?.Tinst ?? 10);
          if (data.meta?.mat) {
            const m = Object.keys(MATERIALS).find(k => k.toLowerCase().includes(data.meta.mat.toLowerCase()));
            if (m) setMatName(m);
          }
          if (data.meta?.cover) setHc(data.meta.cover / 1000);
          // Herstel PleModel uit opgeslagen rawSheets
          if (data.meta?._rawSheets) {
            try {
              const model = parseSheetsToModel(data.meta._rawSheets);
              setPleModel(model);
              if (model.soilWizardResults && model.soilWizardResults.length > 0) {
                setSoilWizardResults(model.soilWizardResults);
              }
            } catch { /* rawSheets corrupt, negeer */ }
          }
        }
      }
    } catch { /* localStorage niet beschikbaar of corrupt */ }
  }, []);

  // Sla import data op bij elke wijziging
  useEffect(() => {
    if (importedNodes.length > 0) {
      try {
        const data = {
          nodes: importedNodes,
          elements: importedEls,
          meta: importedMeta,
          fileName: importFileName,
          femResults: femResults,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem("ple_import", JSON.stringify(data));
      } catch { /* localStorage vol of niet beschikbaar */ }
    }
  }, [importedNodes, importedEls, importedMeta, importFileName, femResults]);

  // Wis import data uit localStorage
  const clearImportData = () => {
    setImportedNodes([]);
    setImportedEls([]);
    setImportedMeta(null);
    setImportFileName("");
    setFemResults([]);
    setFemAllLC([]);
    setPleModel(null);
    setSoilWizardResults([]);
    setShowSoilWizard(false);
    try { localStorage.removeItem("ple_import"); } catch {}
  };

  // Sync PleModel → legacy state (importedNodes/importedEls/importedMeta)
  const syncModelToLegacy = (model: PleModel) => {
    const legacy = modelToLegacy(model);
    setImportedNodes(legacy.nodes);
    setImportedEls(legacy.elements);
    setImportedMeta((prev: any) => ({ ...prev, ...legacy.meta }));
  };
  const [Pe, setPe] = useState(0);
  const [Top, setTop] = useState(60);
  const [Tin, setTin] = useState(10);
  const [Mb, setMb] = useState(0);
  const [soilName, setSoilName] = useState("Zand (droog)");
  const [Hc, setHc] = useState(1.2);
  const [tlName, setTlName] = useState("Normaal (weg)");
  const [tlCustom, setTlCustom] = useState(40);
  const [cls, setCls] = useState(1);
  const [showRoadmap, setShowRoadmap] = useState(true);
  const [showSoilWizard, setShowSoilWizard] = useState(false);
  const [soilWizardResults, setSoilWizardResults] = useState<SoilWizardResult[]>([]);

  const R = useMemo(() => {
    // Gebruik ISTROP data uit Excel als beschikbaar, anders fallback naar hardcoded MATERIALS
    let m = MATERIALS[matName as keyof typeof MATERIALS] as any;
    if (!m) return null;
    if (importedMeta?.matProps) {
      // Override met ISTROP data uit het geïmporteerde Excel bestand
      m = { ...m, ...importedMeta.matProps };
    }
    const g = calcGeometry(D, t);
    const s = calcStresses(Pi, Pe, D, t, m, Top, Tin, Mb, g);
    const soilData = SOIL_TYPES[soilName as keyof typeof SOIL_TYPES];
    const soilR = calcSoil(soilData, D, Hc);
    const tq = tlName === "Aangepast" ? tlCustom : TRAFFIC_LOADS[tlName as keyof typeof TRAFFIC_LOADS].q;
    const qt = soilR.q + tq;
    const ov = calcOval(D, t, qt/1000, m.E, soilR.E_prime);
    const Pcr = calcImplode(D, t, m.E, m.poisson);
    const dT = Top - Tin;
    const dL = L * m.alpha * dT * 1000;
    const sth = Math.abs(s.st);
    const n = nenCheck(s.sh, s.vm, m.SMYS, cls, m.type);
    const Fth = m.E * m.alpha * Math.abs(dT) * g.As / 1000;
    return { m, g, s, soilR, soilData, tq, qt, ov, Pcr, dT, dL, sth, n, Fth };
  }, [matName, D, t, L, Pi, Pe, Top, Tin, Mb, soilName, Hc, tlName, tlCustom, cls, importedMeta]);

  if (!R) return null;
  const { m, g, s, soilR, soilData, tq, qt, ov, Pcr, dT, dL, sth, n, Fth } = R;

  // Als FEM resultaten beschikbaar zijn EN solver geconvergeerd EN UC realistisch, gebruik die
  const femUCmax = femResults.length > 0 ? Math.max(...femResults.map((r: any) => r.uc || 0)) : -1;
  const femConverged = importedMeta?._femConverged === true;
  if (femUCmax >= 0 && femUCmax < 50 && femConverged) {
    n.cu = femUCmax;
    n.ok = femUCmax <= 1.0;
    n.vu = Math.max(...femResults.map((r: any) => r.ucVM || 0));
    n.hu = Math.max(...femResults.map((r: any) => r.ucRing || 0));
    n.vp = n.vu <= 1.0;
    n.hp = n.hu <= 1.0;
  }

  // ============================================================
  // Roadmap validatie — per stap checken of invoer compleet is
  // Moet NA de R destructuring staan zodat n.ok beschikbaar is
  // ============================================================
  type StepStatus = "empty" | "partial" | "complete" | "error" | "locked";

  // Pre-compute prereq statussen om recursie te voorkomen
  const projectOk = D > 0 && t > 0 && !!matName;
  const loadingOk = Pi > 0 && Top !== Tin;

  const getStepStatus = (stepId: string): StepStatus => {
    const hasImport = importedNodes.length > 0;
    switch (stepId) {
      case "project":
        // Alleen "complete" als er een bestand geladen is OF handmatige invoer gedaan
        if (!hasImport && D === 323.9 && t === 8.0) return "empty"; // defaults = niet ingevuld
        if (projectOk) return "complete";
        if (D > 0 || t > 0) return "partial";
        return "empty";

      case "geometry":
        if (importedNodes.length > 1) return "complete";
        if (L > 0 && !hasImport) return "partial";
        return "empty";

      case "pipedata":
        if (!hasImport && D === 323.9 && t === 8.0) return "empty";
        if (D > 0 && t > 0 && t < D/2 && D/t > 5) return "complete";
        if (D > 0 && t > 0 && (t >= D/2 || D/t <= 5)) return "error";
        return "partial";

      case "soil":
        if (soilWizardResults.length > 0) return "complete";
        if (!hasImport && soilName === "Zand (droog)" && Hc === 1.2) return "empty";
        if (soilName && Hc > 0) return "complete";
        return "partial";

      case "boundary":
        if (!hasImport) return "empty";
        if (importedMeta?.endptsMap && Object.keys(importedMeta.endptsMap).length > 0) return "complete";
        return "partial";

      case "loading":
        if (!hasImport && Pi === 40 && Top === 60 && Tin === 10) return "empty";
        if (loadingOk) return "complete";
        if (Pi > 0 || Top !== Tin) return "partial";
        return "empty";

      case "calculate":
        if (femResults.length > 0) {
          if (importedMeta?._femConverged === false) return "error";
          return "complete";
        }
        if (!hasImport || !projectOk || !loadingOk) return "locked";
        return "empty";

      case "results":
        if (femResults.length > 0) return "complete";
        return "locked";

      case "verify":
        if (!hasImport && !femResults.length) return "locked";
        return n.ok ? "complete" : "error";

      case "report": {
        // Rapportage is complete als alle andere stappen (excl. report) complete zijn
        const otherSteps = ROADMAP_STEPS.filter(s => s.id !== "report");
        const doneCount = otherSteps.filter(s => getStepStatus(s.id) === "complete").length;
        if (doneCount >= otherSteps.length) return "complete";
        if (doneCount >= Math.ceil(otherSteps.length / 2)) return "partial";
        return "empty";
      }
    }
    return "empty";
  };

  const stepStatusColor = (status: StepStatus): string => {
    switch (status) {
      case "complete": return css.green;
      case "partial": return css.yellow;
      case "error": return css.red;
      case "locked": return css.faint;
      case "empty": return css.dim;
    }
  };

  const stepStatusIcon = (status: StepStatus): string => {
    switch (status) {
      case "complete": return "✓";
      case "partial": return "◐";
      case "error": return "✗";
      case "locked": return "🔒";
      case "empty": return "○";
    }
  };

  const completedSteps = ROADMAP_STEPS.filter(s => getStepStatus(s.id) === "complete").length;
  const totalSteps = ROADMAP_STEPS.length;
  const progressPct = Math.round((completedSteps / totalSteps) * 100);

  const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: mobile ? 12 : 16 };
  const grid2i: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };

  // ---- TAB: INPUT ----
  const tabInput = (
    <div style={grid2}>
      <Section icon="🔧" title="Leiding & Materiaal" sub="Buisgeometrie en materiaalkeuze">
        <Select label="Materiaal" value={matName} onChange={setMatName} options={Object.keys(MATERIALS)} />
        <div style={{ ...grid2i, marginTop: 10 }}>
          <Input label="Buitendiameter" unit="mm" value={D} onChange={setD} />
          <Input label="Wanddikte" unit="mm" value={t} onChange={setT} />
          <Input label="Lengte" unit="m" value={L} onChange={setL} step={1} />
        </div>
        <div style={{ marginTop: 12 }}>
          <PropGrid items={[
            ["E-modulus", `${m.E.toLocaleString()} MPa${importedMeta?.matProps?.E && m.E !== 210000 ? " (ISTROP)" : ""}`],
            ["SMYS", `${m.SMYS} MPa`, css.accent],
            ["Poisson", `${m.poisson}`],
            ["α therm.", `${(m.alpha*1e6).toFixed(1)} ×10⁻⁶`],
            ["Dichtheid", `${m.density > 10000 ? Math.round(m.density / 10) : m.density} kg/m³`],
            ["SDR", g.SDR.toFixed(1)],
          ]} />
        </div>
      </Section>

      <Section icon="⚡" title="Belastingen" sub="Druk, temperatuur, buiging">
        <div style={grid2i}>
          <Input label="Interne druk" unit="bar" value={Pi} onChange={setPi} />
          <Input label="Externe druk" unit="bar" value={Pe} onChange={setPe} />
          <Input label="Bedrijfstemp" unit="°C" value={Top} onChange={setTop} step={1} />
          <Input label="Installatietemp" unit="°C" value={Tin} onChange={setTin} step={1} />
          <Input label="Buigmoment" unit="kNm" value={Mb} onChange={setMb} />
        </div>
      </Section>

      <Section icon="🌡️" title="Thermische Analyse" sub="Temperatuurbelasting">
        <Row label="ΔT" value={dT} unit="°C" hl />
        <Row label="Vrije uitzetting (ΔL)" value={dL} unit="mm" />
        <Row label="Thermische spanning" value={sth} unit="MPa" warn={sth > m.SMYS*0.9} />
        <Row label="Axiaalkracht" value={Fth} unit="kN" />
      </Section>
    </div>
  );

  // ---- TAB: 3D MODEL ----
  const tab3d = (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", flexShrink: 0 }}>
        <Badge pass={n.hp} label="Ring" unity={n.hu} compact={mobile} />
        <Badge pass={n.vp} label="VM" unity={n.vu} compact={mobile} />
        <Badge pass={n.ok} label="Totaal" unity={n.cu} compact={mobile} />
      </div>
      <Ple3DViewer D={D} t={t} matName={matName} Pi={Pi} dT={dT} sh={s.sh} vm={s.vm} unity={n.cu} nodes={importedNodes} elements={importedEls} endpoints={importedMeta?.endptsMap} connects={importedMeta?.connects || []} supports={importedMeta?.supportList || []} tees={importedMeta?.teeSpecData} SMYS={m.SMYS} femResults={femResults} coverMap={importedMeta?.coverMap} waterMap={importedMeta?.waterMap} />
    </div>
  );

  // ---- TAB: RESULTS ----
  // Bij een geladen FEM model: toon het maatgevende knooppunt
  // Zonder FEM: toon de handmatige berekening (volledig ingeklemd)
  const femWorst = femResults.length > 0 ? femResults.reduce((a: any, b: any) => b.uc > a.uc ? b : a, femResults[0]) : null;
  const hasFEM = femWorst && femConverged;
  
  const tabResults = (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Badge pass={n.hp} label="Ring" unity={n.hu} compact={mobile} />
        <Badge pass={n.vp} label="Von Mises" unity={n.vu} compact={mobile} />
        <Badge pass={n.ok} label="Totaal" unity={n.cu} compact={mobile} />
      </div>

      {/* FEM indicator */}
      {hasFEM && (
        <div style={{ marginBottom: 12, padding: "6px 12px", background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.2)`, borderRadius: 6, fontSize: 10, fontFamily: css.mono, color: css.accent }}>
          FEM resultaten beschikbaar — maatgevend knooppunt: <span style={{ fontWeight: 700 }}>{femWorst.nodeId}</span> (UC={femWorst.uc.toFixed(3)})
          {" | "}Handmatige berekening hieronder is voor referentie (volledig ingeklemd).
        </div>
      )}

      <div style={grid2}>
        <Section icon="📊" title={hasFEM ? "Spanningen (handmatig — referentie)" : "Spanningen"} sub={hasFEM ? "Volledig ingeklemde buis — conservatief" : "Berekende buiswandspanningen"}>
          <Row label="Ringspanning (σh)" value={s.sh} unit="MPa" hl />
          <Row label="Langsspanning druk" value={s.slp} unit="MPa" />
          <Row label="Thermische spanning" value={s.st} unit="MPa" />
          <Row label="Buigspanning" value={s.sb} unit="MPa" />
          <Row label="Totaal langsspanning" value={s.sl} unit="MPa" hl />
          <div style={{ height: 8 }} />
          <Row label="Von Mises (σvm)" value={s.vm} unit="MPa" hl warn={!n.vp} />
          <Row label="Tresca" value={s.tr} unit="MPa" />
          {hasFEM && (<>
            <div style={{ height: 12 }} />
            <div style={{ fontSize: 10, fontWeight: 600, color: css.green, marginBottom: 4 }}>FEM maatgevend ({femWorst.nodeId})</div>
            <Row label="σh (FEM)" value={femWorst.sh} unit="MPa" hl />
            <Row label="σl (FEM)" value={femWorst.sl} unit="MPa" />
            <Row label="σvm (FEM)" value={femWorst.vm} unit="MPa" hl />
            <Row label="σb buiging (FEM)" value={femWorst.sb} unit="MPa" />
            <Row label="UC (FEM)" value={femWorst.uc} warn={femWorst.uc > 1} />
          </>)}
        </Section>
        <Section icon="🎯" title="Visualisatie" sub="Dwarsdoorsnede & Mohr">
          <PipeViz D={D} t={t} sh={s.sh} sl={s.sl} SMYS={m.SMYS} mobile={mobile} />
          <div style={{ marginTop: 12, textAlign: "center", fontSize: 10, color: css.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Cirkel van Mohr</div>
          <Mohr sh={s.sh} sl={s.sl} mobile={mobile} />
        </Section>
        <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
          <Section icon="📈" title="Unity Checks" sub={hasFEM ? "FEM-gebaseerd (maatgevend knooppunt)" : "Benuttingsgraad"}>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: mobile ? 12 : 24 }}>
              <Gauge value={hasFEM ? Math.abs(femWorst.sh) : Math.abs(s.sh)} max={n.sha} label="Ringspanning" unit="MPa" />
              <Gauge value={hasFEM ? femWorst.vm : s.vm} max={n.vma} label="Von Mises" unit="MPa" />
              <Gauge value={hasFEM ? Math.abs(femWorst.sl || 0) : sth} max={m.SMYS*0.9} label={hasFEM ? "Langsspanning" : "Thermisch"} unit="MPa" />
              <Gauge value={ov.pct} max={5} label="Ovalisatie" unit="%" />
            </div>
          </Section>
        </div>
        <Section icon="📏" title="Geometrie" sub="Doorsnede parameters">
          <Row label="Binnendiameter" value={g.Di} unit="mm" />
          <Row label="SDR" value={g.SDR} />
          <Row label="Staaloppervlak" value={g.As} unit="mm²" />
          <Row label="Traagheidsmoment" value={g.I/1e6} unit="×10⁶ mm⁴" />
          <Row label="Weerstandsmoment" value={g.W/1e3} unit="×10³ mm³" />
        </Section>
        <Section icon="🏗️" title="Grond & Stabiliteit" sub="Belasting en vervorming">
          <Row label="Gronddruk" value={soilR.q} unit="kPa" />
          <Row label="Verkeersbelasting" value={tq} unit="kPa" />
          <Row label="Totale belasting" value={qt} unit="kPa" hl />
          <Row label="Ovalisatie" value={ov.pct} unit="%" warn={ov.pct > 5} />
          <Row label="Ringvervorming" value={ov.delta} unit="mm" />
          <Row label="Implosiedruk" value={Pcr} unit="MPa" />
        </Section>
      </div>
    </div>
  );

  // ---- TAB: NEN3650 ----
  const tabNen = (
    <div>
      {/* Locatieklasse en veiligheidsfactoren (verplaatst van Invoer tab) */}
      <div style={{ marginBottom: 16 }}>
        <div style={grid2}>
          <Section icon="📐" title="NEN 3650 Instellingen" sub="Veiligheidsklasse en factoren">
            <Select label="Locatieklasse" value={`Klasse ${cls}`}
              onChange={v => setCls(parseInt(v.replace("Klasse ", "")))}
              options={["Klasse 1", "Klasse 2", "Klasse 3", "Klasse 4"]} />
            <div style={{ marginTop: 12 }}>
              <PropGrid items={[
                ["γ_f druk", `${NEN3650_FACTORS.gamma_f_pressure}`],
                ["γ_f grond", `${NEN3650_FACTORS.gamma_f_soil}`],
                ["γ_f verkeer", `${NEN3650_FACTORS.gamma_f_traffic}`],
                ["γ_m materiaal", `${n.gm}`],
                ["Ontwerpfactor", `${n.df}`, css.accent],
                ["VM limiet", `${NEN3650_FACTORS.vm_limit_factor} × SMYS`],
              ]} />
            </div>
          </Section>
        </div>
      </div>

      {/* Per-node resultaten tabel als FEM beschikbaar */}
      {femResults.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: css.text, marginBottom: 8 }}>
            UC per knooppunt — {importedMeta?.mat || "P235GH"} | Pi={Pi.toFixed(1)} bar | ΔT={Math.abs(Top - Tin)}°C
            {importedMeta?._femConverged === false && <span style={{ color: css.red, marginLeft: 8 }}>⚠ Solver niet geconvergeerd</span>}
            {importedMeta?._soilIterations > 1 && (
              <span style={{ color: importedMeta?._soilConverged ? css.green : css.yellow, marginLeft: 8, fontSize: 11 }}>
                🔄 Grond: {importedMeta._soilIterations} iteraties{importedMeta._plasticNodeCount > 0 ? ` (${importedMeta._plasticNodeCount} plastisch)` : ""}
                {importedMeta._soilConverged ? " ✓" : " ⚠"}
              </span>
            )}
            {importedMeta?._geoIterations > 0 && (
              <span style={{ color: importedMeta?._geoConverged ? css.green : css.yellow, marginLeft: 8, fontSize: 11 }}>
                📐 2e orde: {importedMeta._geoIterations} iteraties
                {importedMeta._geoConverged ? " ✓" : " ⚠"}
              </span>
            )}
            {importedMeta?._matIterations > 0 && (
              <span style={{ color: importedMeta?._matConverged ? css.green : css.yellow, marginLeft: 8, fontSize: 11 }}>
                🔧 M0: {importedMeta._matIterations} iter
                {importedMeta._yieldedElements > 0 ? ` (${importedMeta._yieldedElements} yielded` : ""}
                {importedMeta._maxPlasticStrain > 0 ? `, ε=${(importedMeta._maxPlasticStrain * 100).toFixed(2)}%` : ""}
                {importedMeta._yieldedElements > 0 ? ")" : ""}
                {importedMeta._localBuckled > 0 ? ` ⚠ ${importedMeta._localBuckled} knik` : ""}
                {importedMeta._matConverged ? " ✓" : " ⚠"}
              </span>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                  {["Node","σh","σl","σvm","σb","Fx (kN)","My","Mz","ux","uy","uz","UC","Status"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", textAlign: "right", color: css.muted, fontWeight: 400, whiteSpace: "nowrap", fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {femResults.map((r: any) => {
                  const ok = r.uc <= 1.0;
                  const warn = r.uc > 0.85 && r.uc <= 1.0;
                  const color = ok ? (warn ? css.yellow : css.green) : css.red;
                  return (
                    <tr key={r.nodeId} style={{ borderBottom: `1px solid ${css.border}22` }}>
                      <td style={{ padding: "3px 6px", color: css.muted }}>{r.nodeId}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{r.sh.toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{r.sl.toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{r.vm.toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: r.sb > 0 ? css.yellow : css.text }}>{(r.sb||0).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{((r.Fx||0)/1000).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{((r.My||0)/1e6).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{((r.Mz||0)/1e6).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{(r.ux||0).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{(r.uy||0).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: css.text }}>{(r.uz||0).toFixed(1)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color, fontWeight: 500 }}>{r.uc.toFixed(3)}</td>
                      <td style={{ padding: "3px 6px", textAlign: "center", color }}>{ok ? (warn ? "⚠" : "✓") : "✗"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Worst case samenvatting */}
          {(() => {
            const worst = femResults.reduce((a: any, b: any) => b.uc > a.uc ? b : a, femResults[0]);
            return (
              <div style={{ marginTop: 8, fontSize: 12, color: css.muted }}>
                Maatgevend knooppunt: <span style={{ color: worst.uc > 1 ? css.red : css.yellow, fontFamily: css.mono }}>{worst.nodeId}</span>
                {" "}UC = <span style={{ color: worst.uc > 1 ? css.red : css.text, fontWeight: 500 }}>{worst.uc.toFixed(3)}</span>
                {" "}(σh={worst.sh.toFixed(1)} MPa, σvm={worst.vm.toFixed(1)} MPa)
              </div>
            );
          })()}

          {/* Excel export knop */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={async () => {
              try {
                const XLSX = await import("xlsx");
                const wb = XLSX.utils.book_new();

                // Sheet 1: Spanningen per node
                const stressData = femResults.map((r: any) => ({
                  Node: r.nodeId,
                  "σh (MPa)": +r.sh.toFixed(2),
                  "σl (MPa)": +r.sl.toFixed(2),
                  "σvm (MPa)": +r.vm.toFixed(2),
                  "σb (MPa)": +(r.sb || 0).toFixed(2),
                  "Fx (kN)": +((r.Fx || 0) / 1000).toFixed(2),
                  "My (kNm)": +((r.My || 0) / 1e6).toFixed(3),
                  "Mz (kNm)": +((r.Mz || 0) / 1e6).toFixed(3),
                  "ux (mm)": +(r.ux || 0).toFixed(2),
                  "uy (mm)": +(r.uy || 0).toFixed(2),
                  "uz (mm)": +(r.uz || 0).toFixed(2),
                  UC: +r.uc.toFixed(4),
                  "UC Ring": +(r.ucRing || 0).toFixed(4),
                  "UC VM": +(r.ucVM || 0).toFixed(4),
                  Status: r.uc <= 1 ? "OK" : "FAIL",
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stressData), "Spanningen");

                // Sheet 2: Elementkrachten (als beschikbaar)
                const elForces = importedMeta?._femElementForces || [];
                if (elForces.length > 0) {
                  const elData = elForces.map((ef: any, i: number) => {
                    const el = importedEls[i] || {};
                    const n1 = importedNodes[el.n1] || {};
                    const n2 = importedNodes[el.n2] || {};
                    return {
                      Element: i + 1,
                      "Node 1": n1.id || `N${el.n1}`,
                      "Node 2": n2.id || `N${el.n2}`,
                      Type: el.type || "straight",
                      "D (mm)": el.d || "",
                      "t (mm)": el.t || "",
                      "Fx1 (kN)": +(ef.Fx1 / 1000).toFixed(2),
                      "Fy1 (kN)": +(ef.Fy1 / 1000).toFixed(2),
                      "Fz1 (kN)": +(ef.Fz1 / 1000).toFixed(2),
                      "My1 (kNm)": +(ef.My1 / 1e6).toFixed(3),
                      "Mz1 (kNm)": +(ef.Mz1 / 1e6).toFixed(3),
                      "Fx2 (kN)": +(ef.Fx2 / 1000).toFixed(2),
                      "Fy2 (kN)": +(ef.Fy2 / 1000).toFixed(2),
                      "Fz2 (kN)": +(ef.Fz2 / 1000).toFixed(2),
                      "My2 (kNm)": +(ef.My2 / 1e6).toFixed(3),
                      "Mz2 (kNm)": +(ef.Mz2 / 1e6).toFixed(3),
                    };
                  });
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(elData), "Elementkrachten");
                }

                // Sheet 3: Verplaatsingen
                const dispData = femResults.map((r: any) => ({
                  Node: r.nodeId,
                  "ux (mm)": +(r.ux || 0).toFixed(3),
                  "uy (mm)": +(r.uy || 0).toFixed(3),
                  "uz (mm)": +(r.uz || 0).toFixed(3),
                  "rx (rad)": +(r.rx || 0).toFixed(6),
                  "ry (rad)": +(r.ry || 0).toFixed(6),
                  "rz (rad)": +(r.rz || 0).toFixed(6),
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dispData), "Verplaatsingen");

                // Sheet 4: Projectinfo
                const infoData = [{
                  Parameter: "Materiaal", Waarde: importedMeta?.mat || matName,
                }, {
                  Parameter: "D (mm)", Waarde: importedMeta?.D || D,
                }, {
                  Parameter: "t (mm)", Waarde: importedMeta?.t || t,
                }, {
                  Parameter: "Pi (bar)", Waarde: importedMeta?.Pi || Pi,
                }, {
                  Parameter: "T bedrijf (°C)", Waarde: importedMeta?.Top || Top,
                }, {
                  Parameter: "T install (°C)", Waarde: importedMeta?.Tinst || Tin,
                }, {
                  Parameter: "Grondtype", Waarde: soilName,
                }, {
                  Parameter: "Gronddekking (m)", Waarde: Hc,
                }, {
                  Parameter: "Max UC", Waarde: +femResults.reduce((a: any, b: any) => b.uc > a.uc ? b : a, femResults[0]).uc.toFixed(4),
                }, {
                  Parameter: "Solver geconvergeerd", Waarde: importedMeta?._femConverged !== false ? "Ja" : "Nee",
                }, {
                  Parameter: "Gronditeraties", Waarde: importedMeta?._soilIterations || 1,
                }, {
                  Parameter: "Plastische nodes", Waarde: importedMeta?._plasticNodeCount || 0,
                }];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoData), "Projectinfo");

                XLSX.writeFile(wb, `PLE_resultaten_${new Date().toISOString().slice(0, 10)}.xlsx`);
              } catch (err) {
                console.error("Excel export mislukt:", err);
                alert("Excel export mislukt.");
              }
            }} style={{
              padding: "8px 16px", background: "rgba(34,197,94,0.1)", border: `1px solid rgba(34,197,94,0.3)`,
              borderRadius: 8, color: css.green, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: css.mono,
            }}>
              📊 Excel Export (Spanningen + Krachten)
            </button>
          </div>

          {/* Elementkrachten tabel */}
          {importedMeta?._femElementForces && importedMeta._femElementForces.length > 0 && (
            <Section icon="🔩" title="Elementkrachten" sub="Interne krachten per element" defaultOpen={false}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                      {["El","N1→N2","Type","Fx1 (kN)","Fy1","Fz1","My1 (kNm)","Mz1","Fx2 (kN)","Fy2","Fz2","My2 (kNm)","Mz2"].map(h => (
                        <th key={h} style={{ padding: "3px 4px", textAlign: "right", color: css.muted, fontWeight: 400, whiteSpace: "nowrap", fontSize: 9 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importedMeta._femElementForces.slice(0, 100).map((ef: any, i: number) => {
                      const el = importedEls[i] || {};
                      const n1 = importedNodes[el.n1] || {};
                      const n2 = importedNodes[el.n2] || {};
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${css.border}11` }}>
                          <td style={{ padding: "2px 4px", color: css.dim }}>{i + 1}</td>
                          <td style={{ padding: "2px 4px", color: css.muted, fontSize: 9 }}>{n1.id||""}→{n2.id||""}</td>
                          <td style={{ padding: "2px 4px", color: el.type === "bend" ? css.yellow : el.type === "tee" ? css.green : css.dim, fontSize: 9 }}>{el.type || "str"}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Fx1/1000).toFixed(1)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Fy1/1000).toFixed(1)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Fz1/1000).toFixed(1)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.My1/1e6).toFixed(2)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Mz1/1e6).toFixed(2)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Fx2/1000).toFixed(1)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Fy2/1000).toFixed(1)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Fz2/1000).toFixed(1)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.My2/1e6).toFixed(2)}</td>
                          <td style={{ padding: "2px 4px", textAlign: "right" }}>{(ef.Mz2/1e6).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {importedMeta._femElementForces.length > 100 && (
                  <div style={{ fontSize: 10, color: css.dim, marginTop: 4 }}>
                    Eerste 100 van {importedMeta._femElementForces.length} elementen getoond. Volledige data in Excel export.
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Buigstijfheid per bocht */}
          {importedEls.some((el: any) => el.type === "bend") && (
            <Section icon="🔄" title="Bochtstijfheid & SIF" sub="Flexibility factor en stress intensification per bocht" defaultOpen={false}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                      {["Bocht","Nodes","D×t (mm)","R (mm)","R/D","h param","Flex factor","SIF"].map(h => (
                        <th key={h} style={{ padding: "4px 6px", textAlign: "right", color: css.muted, fontWeight: 400, fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importedEls.filter((el: any) => el.type === "bend").map((el: any, i: number) => {
                      const n1 = importedNodes[el.n1] || {};
                      const n2 = importedNodes[el.n2] || {};
                      const d = el.d || 139.7;
                      const tw = el.t || 3.6;
                      const R = el.R || d * 3;
                      const r2 = d / 2 - tw;
                      const h = (tw * R) / (r2 * r2);
                      const flex = Math.max(1.65 / Math.max(h, 0.01), 1.0);
                      const sif = Math.max(0.9 / Math.pow(Math.max(h, 0.01), 2/3), 1.0);
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${css.border}11` }}>
                          <td style={{ padding: "3px 6px", color: css.yellow }}>{i + 1}</td>
                          <td style={{ padding: "3px 6px", color: css.muted, fontSize: 10 }}>{n1.id||""}→{n2.id||""}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right" }}>Ø{d}×{tw}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right" }}>{R.toFixed(0)}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right" }}>{(R/d).toFixed(1)}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right" }}>{h.toFixed(4)}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right", color: flex > 5 ? css.yellow : css.text }}>{flex.toFixed(2)}</td>
                          <td style={{ padding: "3px 6px", textAlign: "right", color: sif > 2 ? css.red : sif > 1.5 ? css.yellow : css.text }}>{sif.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Ring model — 48-punts dwarsdoorsnede resultaten */}
          {femResults.some((r: any) => r.ring) && (
            <Section icon="⭕" title="Ring model — dwarsdoorsnede spanning" sub="48-punts inner/outer wall verdeling (EN 13941-1 bijlage B)" defaultOpen={false}>
              {(() => {
                const worstRing = femResults.reduce((a: any, b: any) => {
                  const vmA = a.ring ? Math.max(a.ring.vmInnerMax, a.ring.vmOuterMax) : 0;
                  const vmB = b.ring ? Math.max(b.ring.vmInnerMax, b.ring.vmOuterMax) : 0;
                  return vmB > vmA ? b : a;
                }, femResults[0]);
                const ring = worstRing?.ring;
                if (!ring) return null;
                const sz = mobile ? 260 : 320;
                const cx = sz / 2, cy = sz / 2, rPlot = sz * 0.35;
                const SMYS_val = m.SMYS;
                const maxStress = Math.max(ring.vmInnerMax, ring.vmOuterMax, SMYS_val * 0.5);
                return (
                  <div>
                    <div style={{ fontSize: 11, color: css.muted, marginBottom: 8 }}>
                      Maatgevend: <span style={{ color: css.accent, fontFamily: css.mono }}>{worstRing.nodeId}</span>
                      {" "}| σvm inner={ring.vmInnerMax.toFixed(1)} | outer={ring.vmOuterMax.toFixed(1)} MPa
                      {" "}| Oval={ring.ovalisationPct.toFixed(2)}%
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
                      <div>
                        <div style={{ fontSize: 10, color: css.dim, textAlign: "center", marginBottom: 4 }}>Von Mises (inner=blauw, outer=rood)</div>
                        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
                          {[0.25, 0.5, 0.75, 1.0].map(f => (
                            <circle key={f} cx={cx} cy={cy} r={rPlot * f} fill="none" stroke="#1e293b" strokeWidth={0.5} strokeDasharray={f === 1 ? "none" : "2 2"} />
                          ))}
                          <circle cx={cx} cy={cy} r={rPlot * Math.min(SMYS_val / maxStress, 1)} fill="none" stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4 2" opacity={0.5} />
                          <line x1={cx} y1={cy - rPlot - 10} x2={cx} y2={cy + rPlot + 10} stroke="#1e293b" strokeWidth={0.3} />
                          <line x1={cx - rPlot - 10} y1={cy} x2={cx + rPlot + 10} y2={cy} stroke="#1e293b" strokeWidth={0.3} />
                          <polygon points={ring.angles.map((a: number, i: number) => {
                            const r2 = rPlot * Math.min(ring.vmInner[i] / maxStress, 1.2);
                            return `${cx + r2 * Math.cos(a - Math.PI/2)},${cy + r2 * Math.sin(a - Math.PI/2)}`;
                          }).join(" ")} fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth={1.5} />
                          <polygon points={ring.angles.map((a: number, i: number) => {
                            const r2 = rPlot * Math.min(ring.vmOuter[i] / maxStress, 1.2);
                            return `${cx + r2 * Math.cos(a - Math.PI/2)},${cy + r2 * Math.sin(a - Math.PI/2)}`;
                          }).join(" ")} fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth={1} />
                          <text x={cx} y={12} textAnchor="middle" fill="#64748b" fontSize={9} fontFamily="monospace">0°</text>
                          <text x={sz - 8} y={cy + 4} textAnchor="end" fill="#64748b" fontSize={9} fontFamily="monospace">90°</text>
                          <text x={cx} y={sz - 4} textAnchor="middle" fill="#64748b" fontSize={9} fontFamily="monospace">180°</text>
                          <text x={10} y={cy + 4} textAnchor="start" fill="#64748b" fontSize={9} fontFamily="monospace">270°</text>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: css.text, marginBottom: 6 }}>Ring model samenvatting</div>
                        <Row label="σx inner max" value={ring.sxInnerMax} unit="MPa" />
                        <Row label="σx outer max" value={ring.sxOuterMax} unit="MPa" />
                        <Row label="σf inner max" value={ring.sfInnerMax} unit="MPa" />
                        <Row label="σf outer max" value={ring.sfOuterMax} unit="MPa" />
                        <Row label="σvm inner max" value={ring.vmInnerMax} unit="MPa" hl />
                        <Row label="σvm outer max" value={ring.vmOuterMax} unit="MPa" hl />
                        <Row label="Ovalisatie" value={ring.ovalisationPct} unit="%" warn={ring.ovalisationPct > 3} />
                        <Row label="Ovalisatie abs" value={ring.ovalisation} unit="mm" />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Section>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Badge pass={n.hp} label="Ring" unity={n.hu} compact={mobile} />
        <Badge pass={n.vp} label="VM" unity={n.vu} compact={mobile} />
        <Badge pass={n.ok} label="Totaal" unity={n.cu} compact={mobile} />
      </div>
      {/* T-stuk SIF */}
      {importedMeta?.teeconfMap && Object.keys(importedMeta.teeconfMap).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: css.text, marginBottom: 8 }}>T-stuk verificatie (EN 13941-1 bijlage D)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                {["TEE-REF","Type","D-run×t","D-brn×t","SIF run","SIF brn","Cycli","Status"].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "right", color: css.muted, fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(importedMeta.teeconfMap || {}).map(([ref, conf]: any) => {
                // Haal TEESPEC data op
                const spec = (importedMeta.teeSpecData || {})[ref] || {};
                const dRun = spec["D-RUN"] || spec.dRun || 139.7;
                const tRun = spec["T-RUN"] || spec.tRun || 3.6;
                const dBrn = spec["D-BRN"] || spec.dBrn || 139.7;
                const tBrn = spec["T-BRN"] || spec.tBrn || 3.6;
                const teeType = spec.TYPE || spec.type || "Reinforced";
                const te = spec.TE || spec.te || 4.5;
                // Eenvoudige SIF benadering ASME B31.3
                const r2 = dRun / 2 - tRun;
                const T = teeType === "Welded" ? tRun : Math.max(tRun, te);
                const h = (T / r2) * Math.pow(r2 / (dRun / 2), 2);
                const sifRun = Math.max(0.9 / Math.pow(Math.max(h, 0.01), 2/3), 1.0);
                const r2b = dBrn / 2 - tBrn;
                const hb = (tBrn / r2b) * Math.pow(r2b / (dBrn / 2), 2);
                const sifBrn = Math.max(0.9 / Math.pow(Math.max(hb, 0.01), 2/3), 1.0);
                const cycles = conf.cycles || 2000;
                // Eenvoudige vermoeiingscheck: SIF × σrange < 0.35 × SMYS (indicatief)
                const SMYS = importedMeta.matProps?.SMYS || 235;
                const sigma = Math.abs((importedMeta.Pi || 2.5) * 0.1 * dRun / (2 * tRun));
                const fatigue = sifRun * sigma;
                const fatigueOk = fatigue < 0.35 * SMYS;
                return (
                  <tr key={ref} style={{ borderBottom: `1px solid ${css.border}22` }}>
                    <td style={{ padding: "3px 8px", color: css.muted }}>{ref}</td>
                    <td style={{ padding: "3px 8px", color: css.text }}>{teeType}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{dRun}×{tRun}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{dBrn}×{tBrn}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{sifRun.toFixed(2)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{sifBrn.toFixed(2)}</td>
                    <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{cycles.toLocaleString()}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center", color: fatigueOk ? css.green : css.yellow }}>
                      {fatigueOk ? "✓" : "⚠"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={grid2}>
        <Section icon="🔴" title="Ringspanning Toets" sub="σh ≤ f × SMYS">
          <Row label="Berekend σh" value={Math.abs(s.sh)} unit="MPa" />
          <Row label="Ontwerpfactor (f)" value={n.df} />
          <Row label="SMYS" value={m.SMYS} unit="MPa" />
          <Row label="Toelaatbaar σh" value={n.sha} unit="MPa" hl />
          <Row label="Unity Check" value={n.hu} warn={!n.hp} />
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: n.hp ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${n.hp ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: n.hp ? css.green : css.red }}>{n.hp ? "✓ VOLDOET" : "✗ VOLDOET NIET"} — UC = {n.hu.toFixed(3)}</div>
            <div style={{ fontSize: 11, color: css.muted, marginTop: 3 }}>{Math.abs(s.sh).toFixed(1)} {n.hp ? "≤" : ">"} {n.sha.toFixed(1)} MPa</div>
          </div>
        </Section>
        <Section icon="🔵" title="Von Mises Toets" sub="σvm ≤ 0.85 × SMYS / γm">
          <Row label="Berekend σvm" value={s.vm} unit="MPa" />
          <Row label="VM factor" value={NEN3650_FACTORS.vm_limit_factor} />
          <Row label="γm materiaal" value={n.gm} />
          <Row label="Toelaatbaar σvm" value={n.vma} unit="MPa" hl />
          <Row label="Unity Check" value={n.vu} warn={!n.vp} />
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: n.vp ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${n.vp ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: n.vp ? css.green : css.red }}>{n.vp ? "✓ VOLDOET" : "✗ VOLDOET NIET"} — UC = {n.vu.toFixed(3)}</div>
            <div style={{ fontSize: 11, color: css.muted, marginTop: 3 }}>{s.vm.toFixed(1)} {n.vp ? "≤" : ">"} {n.vma.toFixed(1)} MPa</div>
          </div>
        </Section>
      </div>
      <Section icon="📐" title="Formules" sub="NEN 3650-2" defaultOpen={!mobile}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <FormulaBox title="Ringspanning (Barlow)" color={css.accent} lines={["σh = (P × D) / (2 × t)", `σh = (${(Pi*0.1).toFixed(2)} × ${D}) / (2 × ${t})`, `= ${s.sh.toFixed(2)} MPa`]} />
          <FormulaBox title="Langsspanning" color={css.green} lines={["σl = ν×σh + σt + σb", `σl = ${s.slp.toFixed(1)} + (${s.st.toFixed(1)}) + ${s.sb.toFixed(1)}`, `= ${s.sl.toFixed(2)} MPa`]} />
          <FormulaBox title="Von Mises" color={css.yellow} lines={["σvm = √(σh² - σh·σl + σl²)", `= ${s.vm.toFixed(2)} MPa`]} />
        </div>
      </Section>
    </div>
  );

  // ---- TAB: THERMAL ----
  const tabThermal = (
    <div style={grid2}>
      <Section icon="🌡️" title="Thermische Analyse" sub="Temperatuurbelasting">
        <Row label="Bedrijfstemperatuur" value={Top} unit="°C" />
        <Row label="Installatietemperatuur" value={Tin} unit="°C" />
        <Row label="ΔT" value={dT} unit="°C" hl />
        <div style={{ height: 8 }} />
        <Row label="Vrije uitzetting (ΔL)" value={dL} unit="mm" />
        <Row label="Thermische spanning" value={sth} unit="MPa" warn={sth > m.SMYS*0.9} />
        <Row label="Axiaalkracht" value={Fth} unit="kN" />
      </Section>
      <Section icon="📉" title="σ-ΔT Grafiek" sub="Spanning vs temperatuur">
        <svg width="100%" viewBox="0 0 340 200" style={{ display: "block" }}>
          {(() => {
            const W=340,H=200,ml=48,mr=12,mt=18,mb=30;
            const pw=W-ml-mr,ph=H-mt-mb,maxS=m.SMYS;
            return (<>
              {[0,1,2,3,4].map(i=>{const y=mt+i*(ph/4);return <g key={i}><line x1={ml} y1={y} x2={W-mr} y2={y} stroke={css.border} strokeWidth={0.5}/><text x={ml-3} y={y+3} textAnchor="end" fill={css.faint} fontSize={8} fontFamily={css.mono}>{(maxS-i*(maxS/4)).toFixed(0)}</text></g>;})}
              <line x1={ml} y1={mt+ph*(1-0.85)} x2={W-mr} y2={mt+ph*(1-0.85)} stroke={css.red} strokeWidth={1} strokeDasharray="4,3" opacity={0.5}/>
              {(()=>{const pts=[];for(let dt=0;dt<=100;dt+=2){const sv=m.E*m.alpha*dt;pts.push(`${ml+(dt/100)*pw},${Math.max(mt,mt+ph-sv/maxS*ph)}`);}return <polyline points={pts.join(" ")} fill="none" stroke={css.accent} strokeWidth={2}/>;})()}
              {(()=>{const x=ml+(Math.abs(dT)/100)*pw,y=Math.max(mt,mt+ph-sth/maxS*ph);return <g><circle cx={x} cy={y} r={4} fill={css.accent} stroke={css.bg} strokeWidth={2}/><text x={x} y={y-9} textAnchor="middle" fill={css.accent} fontSize={8} fontWeight={600} fontFamily={css.mono}>ΔT={Math.abs(dT)}° → {sth.toFixed(0)}</text></g>;})()}
              <line x1={ml} y1={mt+ph} x2={W-mr} y2={mt+ph} stroke="#334155" strokeWidth={1}/>
              <text x={ml+pw/2} y={H-3} textAnchor="middle" fill={css.dim} fontSize={9} fontFamily={css.mono}>ΔT [°C]</text>
              {[0,25,50,75,100].map(v=><text key={v} x={ml+(v/100)*pw} y={mt+ph+13} textAnchor="middle" fill={css.faint} fontSize={7} fontFamily={css.mono}>{v}</text>)}
            </>);
          })()}
        </svg>
      </Section>
      <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
        <Section icon="📋" title="Formules" defaultOpen={!mobile}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <FormulaBox title="Vrije uitzetting" color={css.accent} lines={["ΔL = L × α × ΔT", `= ${dL.toFixed(1)} mm`]} />
            <FormulaBox title="Ingeklemde spanning" color={css.yellow} lines={["σt = E × α × ΔT", `= ${sth.toFixed(1)} MPa`]} />
          </div>
        </Section>
      </div>
      <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
        <Section icon="🔥" title="Steel-in-Steel voorspanning" sub="EN 13941-1 §11 — thermisch voorgespannen stadsverwarming" defaultOpen={false}>
          {(() => {
            // Dynamisch importeren van calcSteelInSteel zou async zijn,
            // dus we berekenen inline met dezelfde formules
            const dMed = importedMeta?.D || D;
            const tMed = importedMeta?.t || t;
            const dCas = importedMeta?.D ? (importedMeta.D * 1.6) : D * 1.6;
            const tCas = Math.max(tMed * 0.6, 3.0);

            // State voor voorverwarmingstemperatuur
            const tPre = 80; // standaard voorverwarming

            const aMed = Math.PI * ((dMed / 2) ** 2 - ((dMed / 2) - tMed) ** 2);
            const aCas = Math.PI * ((dCas / 2) ** 2 - ((dCas / 2) - tCas) ** 2);

            const dTPre = tPre - Tin;
            const deltaAlpha = m.alpha - m.alpha; // zelfde materiaal → 0, maar wél verschil door verwarming
            // Bij zelfde materiaal: voorspanning komt door de fixering bij verhoogde temperatuur
            // σ_pre = E × α × (T_preheat - T_install) × A_med / (A_med + A_cas × E_cas/E_med)
            const stiffRatio = aCas > 0 ? (aMed / (aMed + aCas)) : 0;
            const prestressForce = m.E * m.alpha * dTPre * aMed * stiffRatio;
            const sigmaPre = aMed > 0 ? prestressForce / aMed : 0;
            const sigmaPreCas = aCas > 0 ? -prestressForce / aCas : 0;

            // Bedrijfsfase
            const sigmaTherm = -m.E * m.alpha * (Top - Tin);
            const sigmaAxBedrijf = sigmaTherm + sigmaPre;
            const sigmaHoop = (Pi * 0.1 * dMed) / (2 * tMed);
            const sigmaVM = Math.sqrt(sigmaHoop ** 2 - sigmaHoop * sigmaAxBedrijf + sigmaAxBedrijf ** 2);
            const sigmaVMzonder = Math.sqrt(sigmaHoop ** 2 - sigmaHoop * sigmaTherm + sigmaTherm ** 2);
            const reductie = sigmaVMzonder > 0 ? ((sigmaVMzonder - sigmaVM) / sigmaVMzonder) * 100 : 0;

            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: css.accent, marginBottom: 6 }}>Configuratie</div>
                    <Row label="Mediumbuis" value={`Ø${dMed.toFixed(1)}×${tMed.toFixed(1)}`} unit="mm" />
                    <Row label="Mantelbuis" value={`Ø${dCas.toFixed(0)}×${tCas.toFixed(1)}`} unit="mm" />
                    <Row label="A medium" value={aMed.toFixed(0)} unit="mm²" />
                    <Row label="A mantel" value={aCas.toFixed(0)} unit="mm²" />
                    <div style={{ height: 8 }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: css.yellow, marginBottom: 6 }}>Temperaturen</div>
                    <Row label="Voorverwarming" value={tPre} unit="°C" hl />
                    <Row label="Installatie" value={Tin} unit="°C" />
                    <Row label="Bedrijf" value={Top} unit="°C" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: css.green, marginBottom: 6 }}>Voorspanning</div>
                    <Row label="Voorspankracht" value={prestressForce / 1000} unit="kN" hl />
                    <Row label="σ pre mediumbuis" value={sigmaPre} unit="MPa" />
                    <Row label="σ pre mantelbuis" value={sigmaPreCas} unit="MPa" />
                    <div style={{ height: 8 }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: css.orange, marginBottom: 6 }}>Bedrijfsfase</div>
                    <Row label="σ axiaal bedrijf" value={sigmaAxBedrijf} unit="MPa" />
                    <Row label="σ hoop" value={sigmaHoop} unit="MPa" />
                    <Row label="σ VM met voorsp." value={sigmaVM} unit="MPa" hl />
                    <Row label="σ VM zonder voorsp." value={sigmaVMzonder} unit="MPa" warn={sigmaVMzonder > m.SMYS * 0.85} />
                    <Row label="Spanningsreductie" value={`${reductie.toFixed(1)}%`} />
                  </div>
                </div>
                {reductie > 0 && (
                  <div style={{ marginTop: 12, padding: 10, background: "rgba(34,197,94,0.08)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.2)" }}>
                    <span style={{ fontSize: 12, color: css.green, fontFamily: css.mono }}>
                      ✓ Voorverwarming op {tPre}°C reduceert de Von Mises spanning met {reductie.toFixed(1)}%
                      ({sigmaVMzonder.toFixed(1)} → {sigmaVM.toFixed(1)} MPa)
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </Section>
      </div>
    </div>
  );

  // ---- TAB: SOIL ----
  const tabSoil = (
    <div style={grid2}>
      {/* Soil Wizard toggle */}
      <div style={{ gridColumn: mobile ? undefined : "1 / -1", display: "flex", alignItems: "center", gap: 12, marginBottom: -8 }}>
        <button onClick={() => setShowSoilWizard(!showSoilWizard)} style={{
          padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: css.mono,
          background: showSoilWizard ? css.accent : "transparent",
          color: showSoilWizard ? "#fff" : css.accent,
          border: `1px solid ${css.accent}`, cursor: "pointer",
        }}>
          {showSoilWizard ? "◀ Eenvoudig" : "🧙 Soil Wizard ▶"}
        </button>
        {soilWizardResults.length > 0 && !showSoilWizard && (
          <span style={{ fontSize: 11, color: css.green, fontFamily: css.mono }}>
            ✓ Soil Wizard: {soilWizardResults.length} nodes berekend
          </span>
        )}
      </div>

      {/* Soil Wizard (geavanceerd, per-node grondparameters) */}
      {showSoilWizard && importedNodes.length > 0 && (
        <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
          <PleSoilWizard
            nodes={importedNodes}
            elements={importedEls}
            glevel={importedMeta?.glevelList || importedMeta?.coverMap ? 
              Object.entries(importedMeta?.coverMap || {}).map(([id, z]: [string, any], i: number) => ({
                nodeIndex: importedNodes.findIndex((n: any) => n.id === id),
                z: typeof z === "number" ? z : 0,
              })).filter(g => g.nodeIndex >= 0) : []}
            onApplySoilParameters={(params: SoilParameters[]) => {
              const results: SoilWizardResult[] = params.map(p => ({
                nodeId: p.nodeId,
                nodeIndex: p.nodeIndex,
                KLH: p.KLH,
                KLS: p.KLS,
                KLT: p.KLT,
                RVS: p.RVS,
                RVT: p.RVT,
                RH: p.RH,
                F: p.F,
                UF: p.UF,
                sigmaK: p.sigmaK,
                H_cover: p.H_cover,
              }));
              setSoilWizardResults(results);
              // Sla ook op in pleModel als die beschikbaar is
              if (pleModel) {
                setPleModel({ ...pleModel, soilWizardResults: results });
              }
            }}
            css={css}
          />
        </div>
      )}

      {/* Waarschuwing als geen model geladen maar wizard open */}
      {showSoilWizard && importedNodes.length === 0 && (
        <div style={{ gridColumn: mobile ? undefined : "1 / -1", padding: 16, background: "rgba(239,68,68,0.06)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
          <span style={{ fontSize: 12, color: css.red }}>⚠️ Importeer eerst een PLE4Win model om de Soil Wizard te gebruiken.</span>
        </div>
      )}

      {/* Eenvoudige grond-invoer (standaard view) */}
      {!showSoilWizard && <>
      {/* Grond-invoer (verplaatst van Invoer tab) */}
      <Section icon="🏔️" title="Grondcondities" sub="Bodem, dekking en verkeersbelasting">
        <Select label="Grondtype" value={soilName} onChange={setSoilName} options={Object.keys(SOIL_TYPES)} />
        <div style={{ ...grid2i, marginTop: 10 }}>
          <Input label="Gronddekking" unit="m" value={Hc} onChange={setHc} />
          <Select label="Verkeerslast" value={tlName} onChange={setTlName} options={Object.keys(TRAFFIC_LOADS)} />
          {tlName === "Aangepast" && <Input label="Custom" unit="kN/m²" value={tlCustom} onChange={setTlCustom} />}
        </div>
      </Section>

      <Section icon="🏔️" title="Grondparameters" sub="NEN 3650 parameters">
        <Row label="Grondtype" value={soilName} />
        <Row label="γ" value={soilData.gamma} unit="kN/m³" />
        <Row label="φ" value={soilData.phi} unit="°" />
        <Row label="c" value={soilData.c} unit="kPa" />
        <Row label="E grond" value={soilData.E_soil} unit="MPa" />
        <div style={{height:8}}/>
        <Row label="K0 (rustdruk)" value={soilR.K0} hl />
        <Row label="Ka (actief)" value={Math.tan(Math.PI/4-soilData.phi*Math.PI/360)**2} />
        <Row label="Kp (passief)" value={1/(Math.tan(Math.PI/4-soilData.phi*Math.PI/360)**2)} />
      </Section>
      <Section icon="📊" title="Veerconstanten" sub="Bilineair model">
        <Row label="k_h (horizontaal)" value={soilData.k_h} unit="kN/m³" />
        <Row label="k_v omhoog" value={soilData.k_v_up} unit="kN/m³" />
        <Row label="k_v omlaag" value={soilData.k_v_down} unit="kN/m³" />
        <svg width="100%" viewBox="0 0 320 150" style={{ display: "block", marginTop: 12 }}>
          <text x={160} y={14} textAnchor="middle" fill={css.dim} fontSize={9} fontFamily={css.mono}>Bilineair R-δ</text>
          <line x1={60} y1={130} x2={300} y2={130} stroke="#334155" strokeWidth={1}/>
          <line x1={60} y1={22} x2={60} y2={130} stroke="#334155" strokeWidth={1}/>
          <polyline points="60,130 150,58 280,46" fill="none" stroke={css.accent} strokeWidth={2}/>
          <text x={158} y={52} fill={css.accent} fontSize={7} fontFamily={css.mono}>k_h</text>
          <polyline points="60,130 130,40 280,33" fill="none" stroke={css.green} strokeWidth={2}/>
          <text x={138} y={34} fill={css.green} fontSize={7} fontFamily={css.mono}>k_v↓</text>
          <polyline points="60,130 170,86 280,76" fill="none" stroke={css.yellow} strokeWidth={2}/>
          <text x={178} y={73} fill={css.yellow} fontSize={7} fontFamily={css.mono}>k_v↑</text>
        </svg>
      </Section>
      <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
        <Section icon="🔄" title="Ovalisatie & Stabiliteit">
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr auto", gap: 16, alignItems: "start" }}>
            <div>
              <Row label="Totale belasting" value={qt} unit="kPa" hl />
              <Row label="Ovalisatie" value={ov.pct} unit="%" warn={ov.pct>5} />
              <Row label="Max toelaatbaar" value={5} unit="%" />
            </div>
            <div>
              <Row label="Implosiedruk" value={Pcr} unit="MPa" />
              <Row label="Externe druk" value={Pe*0.1} unit="MPa" />
              <Row label="Veiligheid" value={Pcr/Math.max(Pe*0.1,0.001)} unit="×" hl />
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <svg width={100} height={100} viewBox="0 0 100 100">
                <ellipse cx={50} cy={50} rx={36} ry={36*(1-ov.pct/100)} fill="none" stroke={css.accent} strokeWidth={2} strokeDasharray="3,2"/>
                <circle cx={50} cy={50} r={36} fill="none" stroke={css.faint} strokeWidth={0.5} strokeDasharray="2,3"/>
                <text x={50} y={53} textAnchor="middle" fill={css.dim} fontSize={9} fontFamily={css.mono}>{ov.pct.toFixed(2)}%</text>
              </svg>
            </div>
          </div>
        </Section>
      </div>

      {/* Upheaval Buckling Check */}
      <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
        <Section icon="⬆️" title="Upheaval Buckling" sub="EN 13941-1 bijlage E — opwaartse knikanalyse" defaultOpen={false}>
          {(() => {
            const geo_ub = calcGeometry(D, t);
            const Ftherm = m.E * m.alpha * Math.abs(dT) * geo_ub.As;
            const Fpress = Pi * 0.1 * Math.PI * (D / 2) ** 2;
            const actualForce = Ftherm + Fpress;
            const DPE = D * 1.6;
            const qSoil = soilData.gamma * 1e-6 * (Hc * 1000) * DPE;
            const eigenW = m.density * 9.81e-6 * geo_ub.As;
            const qTotal = qSoil + eigenW;
            const Lbuckle = qTotal > 0 ? Math.PI * Math.sqrt(m.E * geo_ub.I / qTotal) : 10000;
            const Ncrit = Math.PI ** 2 * m.E * geo_ub.I / (Lbuckle ** 2) + qTotal * Lbuckle / Math.PI;
            const sf = actualForce > 0 ? Ncrit / actualForce : 999;
            const ok = sf >= 1.5;
            return (
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div>
                  <Row label="Axiaalkracht (thermisch)" value={Ftherm / 1000} unit="kN" />
                  <Row label="Axiaalkracht (druk)" value={Fpress / 1000} unit="kN" />
                  <Row label="Totaal axiaal" value={actualForce / 1000} unit="kN" hl />
                </div>
                <div>
                  <Row label="Kritische kracht" value={Ncrit / 1000} unit="kN" hl />
                  <Row label="Kniklengte" value={Lbuckle / 1000} unit="m" />
                  <Row label="Veiligheidsfactor" value={sf} unit="×" warn={!ok} />
                  <Row label="Grondgewicht/m" value={qSoil * 1000} unit="N/m" />
                </div>
                <div style={{ gridColumn: mobile ? undefined : "1 / -1", padding: 8, background: ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderRadius: 6, border: `1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <span style={{ fontSize: 12, color: ok ? css.green : css.red, fontFamily: css.mono, fontWeight: 600 }}>
                    {ok ? "✓" : "✗"} Upheaval SF = {sf.toFixed(2)} {ok ? "(≥1.5 — voldoet)" : "(< 1.5 — ONVOLDOENDE)"}
                  </span>
                </div>
              </div>
            );
          })()}
        </Section>
      </div>

      {/* Grondreacties per node */}
      {femResults.length > 0 && femResults.some((r: any) => r.soilRx !== undefined) && (
        <div style={{ gridColumn: mobile ? undefined : "1 / -1" }}>
          <Section icon="🌍" title="Grondreacties per knooppunt" sub="Reactiekrachten uit FEM solver" defaultOpen={false}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                    {["Node", "Rx (kN)", "Ry (kN)", "Rz (kN)", "|R| (kN)", "ux (mm)", "uz (mm)"].map(h => (
                      <th key={h} style={{ padding: "3px 6px", textAlign: "right", color: css.muted, fontWeight: 400, fontSize: 9 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {femResults.filter((r: any) => r.soilRx !== undefined && (Math.abs(r.soilRx || 0) > 0.01 || Math.abs(r.soilRz || 0) > 0.01)).slice(0, 60).map((r: any) => (
                    <tr key={r.nodeId} style={{ borderBottom: `1px solid ${css.border}11` }}>
                      <td style={{ padding: "2px 6px", color: css.muted }}>{r.nodeId}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{((r.soilRx || 0) / 1000).toFixed(2)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{((r.soilRy || 0) / 1000).toFixed(2)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right" }}>{((r.soilRz || 0) / 1000).toFixed(2)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right", color: css.accent }}>{(Math.sqrt((r.soilRx||0)**2 + (r.soilRy||0)**2 + (r.soilRz||0)**2) / 1000).toFixed(2)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right", color: css.dim }}>{(r.ux || 0).toFixed(1)}</td>
                      <td style={{ padding: "2px 6px", textAlign: "right", color: css.dim }}>{(r.uz || 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
      </>}
    </div>
  );
  const tabReport = (
    <Card>
      {/* Import samenvatting als beschikbaar */}
      {importedMeta && (
        <div style={{ background: css.card, border: `1px solid ${css.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: css.text, marginBottom: 12 }}>Projectsamenvatting — geïmporteerd model</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, fontFamily: css.mono }}>
            {[
              ["Materiaal", importedMeta.mat || "—"],
              ["E-modulus", `${(importedMeta.matProps?.E || 207000).toLocaleString()} N/mm²`],
              ["SMYS (Re)", `${importedMeta.matProps?.SMYS || 235} N/mm²`],
              ["Diameter", `DN${importedMeta.D?.toFixed(1) || "—"} mm`],
              ["Wanddikte", `${importedMeta.t?.toFixed(1) || "—"} mm`],
              ["Druk", `${(importedMeta.PiRaw || importedMeta.Pi || 0).toFixed(2)} N/mm² (${((importedMeta.PiRaw || importedMeta.Pi || 0)*10).toFixed(1)} bar)`],
              ["Temperatuur", `${importedMeta.TopRaw || importedMeta.Top || "—"}°C bedrijf / ${importedMeta.Tinst || 10}°C installatie`],
              ["ΔT", `${(importedMeta.TopRaw || importedMeta.Top || 100)-(importedMeta.Tinst||10)}°C`],
              ["Knooppunten", `${importedMeta.nodeCount || "—"}${importedMeta.adidentInserted ? ` (+${importedMeta.adidentInserted} ADIDENT)` : ""}`],
              ["T-stukken", `${(importedMeta.connects || []).length}`],
              ["Steunpunten", `${(importedMeta.supportList || []).length}`],
              ["Isolatielagen", `${(importedMeta.coatingSegments || []).length}`],
              ["Steunhoeken", `${Object.keys(importedMeta.supangMap || {}).length}`],
              ["Secties", `${(importedMeta.sectionList || []).length}`],
              ["Bodemdaling", `${Object.keys(importedMeta.subsideMap || {}).length} punten`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${css.border}22`, paddingBottom: 4 }}>
                <span style={{ color: css.muted }}>{k}</span>
                <span style={{ color: css.text }}>{v}</span>
              </div>
            ))}
          </div>
          {femResults.length > 0 && (() => {
            const worst = femResults.reduce((a: any, b: any) => b.uc > a.uc ? b : a, femResults[0]);
            const passed = femResults.filter((r: any) => r.uc <= 1.0).length;
            return (
              <div style={{ marginTop: 12, padding: 10, background: worst.uc > 1 ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)", borderRadius: 6, border: `1px solid ${worst.uc > 1 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}` }}>
                <div style={{ fontSize: 12, color: worst.uc > 1 ? css.red : css.green, fontFamily: css.mono }}>
                  UC controle: {passed}/{femResults.length} knooppunten voldoen — maatgevend UC = {worst.uc.toFixed(3)} ({worst.nodeId})
                </div>
              </div>
            );
          })()}
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ display: "inline-block", padding: mobile ? "12px 20px" : "16px 32px", borderRadius: 12, background: n.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${n.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
          <div style={{ fontSize: mobile ? 18 : 28, fontWeight: 800, color: n.ok ? css.green : css.red, fontFamily: css.mono }}>{n.ok ? "✓ LEIDING VOLDOET" : "✗ VOLDOET NIET"}</div>
          <div style={{ fontSize: 12, color: css.muted, marginTop: 6 }}>NEN 3650-2 — Klasse {cls} — UC = {n.cu.toFixed(3)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        {[
          { title: "Leiding & Materiaal", color: css.accent, lines: [`Materiaal: ${matName}`, `Ø ${D} × ${t} mm`, `L = ${L} m`, `SMYS: ${m.SMYS} MPa`, `E: ${m.E} MPa`] },
          { title: "Belastingen", color: css.green, lines: [`Pi = ${Pi} bar | Pe = ${Pe} bar`, `Top = ${Top}°C | Tinst = ${Tin}°C`, `ΔT = ${dT}°C`, `Mb = ${Mb} kNm`] },
          { title: "Spanningen", color: css.yellow, lines: [`σh = ${s.sh.toFixed(2)} MPa`, `σl = ${s.sl.toFixed(2)} MPa`, `σvm = ${s.vm.toFixed(2)} MPa`, `σtr = ${s.tr.toFixed(2)} MPa`] },
          { title: "NEN 3650 Toetsing", color: css.orange, lines: [`Klasse ${cls} (f=${n.df})`, `σh toelaat: ${n.sha.toFixed(1)} MPa`, `σvm toelaat: ${n.vma.toFixed(1)} MPa`, `UC ring: ${n.hu.toFixed(3)} ${n.hp?"✓":"✗"}`, `UC vm: ${n.vu.toFixed(3)} ${n.vp?"✓":"✗"}`] },
        ].map(({ title, color, lines }) => (
          <div key={title} style={{ padding: 14, background: "rgba(30,41,59,0.4)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</div>
            <div style={{ fontSize: 11, color: css.text, lineHeight: 1.9, fontFamily: css.mono }}>{lines.map((l,i)=><div key={i}>{l}</div>)}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: 12, background: "rgba(30,41,59,0.25)", borderRadius: 8, fontSize: 10, color: css.faint, fontFamily: css.mono, lineHeight: 1.8 }}>
        Rapport: {new Date().toLocaleDateString("nl-NL")} {new Date().toLocaleTimeString("nl-NL")}<br/>
        PLE Calculator v2.0 — NEN 3650-2:2020 — FEM Solver<br/>
        Disclaimer: Indicatief. Gebruik gecertificeerde software voor definitief ontwerp.
      </div>

      {/* Export knoppen */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {/* CSV Export */}
        <button onClick={() => {
          const rows = [
            ["Node","σh (MPa)","σl (MPa)","σvm (MPa)","σb (MPa)","Fx (N)","My (Nmm)","Mz (Nmm)","ux (mm)","uy (mm)","uz (mm)","UC ring","UC VM","UC totaal"].join(";"),
            ...femResults.map((r: any) =>
              [r.nodeId, r.sh.toFixed(2), r.sl.toFixed(2), r.vm.toFixed(2), (r.sb||0).toFixed(2), (r.Fx||0).toFixed(1), (r.My||0).toFixed(1), (r.Mz||0).toFixed(1), (r.ux||0).toFixed(3), (r.uy||0).toFixed(3), (r.uz||0).toFixed(3), r.ucRing.toFixed(4), r.ucVM.toFixed(4), r.uc.toFixed(4)].join(";")
            ),
          ].join("\n");
          const blob = new Blob(["\uFEFF" + rows], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url;
          a.download = `PLE_resultaten_${new Date().toISOString().slice(0,10)}.csv`;
          a.click(); URL.revokeObjectURL(url);
        }} style={{
          padding: "10px 20px", background: "rgba(34,197,94,0.1)", border: `1px solid rgba(34,197,94,0.3)`,
          borderRadius: 8, color: css.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: css.mono,
        }} disabled={femResults.length === 0}>
          📊 CSV Export
        </button>

        {/* PDF Export */}
        <button onClick={async () => {
          try {
            // Dynamisch jsPDF laden
            const jspdfModule = await import("jspdf");
            const jsPDF = jspdfModule.default || jspdfModule.jsPDF;
            const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

            const pageW = 210, margin = 15;
            let y = 20;
            const addLine = (text: string, size = 10, bold = false, color = [30, 30, 30]) => {
              if (y > 270) { doc.addPage(); y = 20; }
              doc.setFontSize(size);
              doc.setFont("helvetica", bold ? "bold" : "normal");
              doc.setTextColor(color[0], color[1], color[2]);
              doc.text(text, margin, y);
              y += size * 0.5 + 2;
            };
            const addSep = () => { doc.setDrawColor(200); doc.line(margin, y, pageW - margin, y); y += 4; };

            // Header
            addLine("PLE Calculator — Spanningsrapport", 16, true, [30, 80, 200]);
            addLine(`Datum: ${new Date().toLocaleDateString("nl-NL")} ${new Date().toLocaleTimeString("nl-NL")}`, 9);
            addLine("NEN 3650-2:2020 / EN 13941-1:2019 — FEM Stijfheidsmatrix Analyse", 9, false, [100, 100, 100]);
            y += 4; addSep();

            // Projectgegevens
            addLine("1. Projectgegevens", 13, true);
            addLine(`Materiaal: ${matName}  |  E = ${m.E} MPa  |  SMYS = ${m.SMYS} MPa`);
            addLine(`Leiding: Ø${D} × ${t} mm  |  SDR = ${g.SDR.toFixed(1)}`);
            addLine(`Druk: Pi = ${Pi} bar  |  Pe = ${Pe} bar`);
            addLine(`Temperatuur: Top = ${Top}°C  |  Tinst = ${Tin}°C  |  ΔT = ${dT}°C`);
            addLine(`Grond: ${soilName}  |  Dekking: ${Hc} m`);
            if (importedMeta) {
              addLine(`Geïmporteerd model: ${importedMeta.nodeCount || "?"} knooppunten  |  ${(importedMeta.connects || []).length} T-stukken`);
            }
            y += 2; addSep();

            // Resultaten samenvatting
            addLine("2. Resultaten samenvatting", 13, true);
            addLine(`Ringspanning σh = ${s.sh.toFixed(2)} MPa  |  Toelaatbaar: ${n.sha.toFixed(1)} MPa  |  UC = ${n.hu.toFixed(3)} ${n.hp ? "✓" : "✗"}`);
            addLine(`Von Mises σvm = ${s.vm.toFixed(2)} MPa  |  Toelaatbaar: ${n.vma.toFixed(1)} MPa  |  UC = ${n.vu.toFixed(3)} ${n.vp ? "✓" : "✗"}`);
            addLine(`Thermische spanning σt = ${Math.abs(s.st).toFixed(2)} MPa`);
            addLine(`Totaal UC = ${n.cu.toFixed(3)}  →  ${n.ok ? "VOLDOET" : "VOLDOET NIET"}`, 11, true, n.ok ? [34, 197, 94] : [239, 68, 68]);
            y += 2; addSep();

            // FEM resultaten tabel
            if (femResults.length > 0) {
              addLine("3. FEM Resultaten per knooppunt", 13, true);
              y += 2;

              // Tabelheader
              const cols = ["Node", "σh", "σl", "σvm", "σb", "ux", "uy", "uz", "UC"];
              const colW = [22, 18, 18, 18, 18, 18, 18, 18, 18];
              doc.setFontSize(8); doc.setFont("helvetica", "bold");
              doc.setFillColor(240, 240, 245);
              doc.rect(margin, y - 3, pageW - 2 * margin, 5, "F");
              cols.forEach((c, ci) => {
                let cx = margin + 2;
                for (let j = 0; j < ci; j++) cx += colW[j];
                doc.text(c, cx, y);
              });
              y += 5;

              // Tabelrijen
              doc.setFont("helvetica", "normal"); doc.setFontSize(7);
              femResults.forEach((r: any, ri: number) => {
                if (y > 270) { doc.addPage(); y = 20; }
                if (ri % 2 === 0) {
                  doc.setFillColor(248, 248, 252);
                  doc.rect(margin, y - 3, pageW - 2 * margin, 4.5, "F");
                }
                const vals = [
                  r.nodeId || `N${ri}`,
                  r.sh.toFixed(1), r.sl.toFixed(1), r.vm.toFixed(1), (r.sb||0).toFixed(1),
                  (r.ux||0).toFixed(1), (r.uy||0).toFixed(1), (r.uz||0).toFixed(1),
                  r.uc.toFixed(3),
                ];
                // UC kleur
                doc.setTextColor(r.uc > 1 ? 220 : r.uc > 0.85 ? 180 : 30, r.uc > 1 ? 40 : r.uc > 0.85 ? 140 : 30, r.uc > 1 ? 40 : 30);
                vals.forEach((v, ci) => {
                  let cx = margin + 2;
                  for (let j = 0; j < ci; j++) cx += colW[j];
                  doc.text(v, cx, y);
                });
                doc.setTextColor(30, 30, 30);
                y += 4.5;
              });

              // Worst case
              y += 4;
              const worst = femResults.reduce((a: any, b: any) => b.uc > a.uc ? b : a, femResults[0]);
              addLine(`Maatgevend knooppunt: ${worst.nodeId}  |  UC = ${worst.uc.toFixed(3)}  |  σvm = ${worst.vm.toFixed(1)} MPa`, 10, true, worst.uc > 1 ? [220, 40, 40] : [34, 150, 70]);
              addSep();
            }

            // NEN 3650 toetsing
            addLine("4. NEN 3650-2 Toetsing", 13, true);
            addLine(`Ontwerpklasse: ${cls}  |  Ontwerpfactor f = ${n.df}  |  γm = ${n.gm}`);
            addLine(`Ringspanning: σh = ${Math.abs(s.sh).toFixed(1)} MPa ≤ ${n.sha.toFixed(1)} MPa  →  UC = ${n.hu.toFixed(3)}`);
            addLine(`Von Mises:    σvm = ${s.vm.toFixed(1)} MPa ≤ ${n.vma.toFixed(1)} MPa  →  UC = ${n.vu.toFixed(3)}`);
            addLine(`Conclusie: ${n.ok ? "LEIDING VOLDOET" : "LEIDING VOLDOET NIET"}`, 11, true, n.ok ? [34, 197, 94] : [239, 68, 68]);
            y += 4; addSep();

            // Footer
            addLine("PLE Calculator v2.0 — FEM Stijfheidsmatrix Solver", 8, false, [150, 150, 150]);
            addLine("Disclaimer: Indicatief resultaat. Gebruik gecertificeerde software voor definitief ontwerp.", 7, false, [150, 150, 150]);

            doc.save(`PLE_rapport_${new Date().toISOString().slice(0,10)}.pdf`);
          } catch (err) {
            console.error("PDF generatie mislukt:", err);
            alert("PDF generatie mislukt. Installeer jsPDF: npm install jspdf");
          }
        }} style={{
          padding: "10px 20px", background: "rgba(59,130,246,0.1)", border: `1px solid rgba(59,130,246,0.3)`,
          borderRadius: 8, color: css.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: css.mono,
        }}>
          📄 PDF Rapport
        </button>
      </div>
    </Card>
  );

  const tabImport = (
    <div>
    {/* ── IMPORT SECTIE — altijd bovenaan ── */}
    <Card>
      <div style={{ fontSize: 12, color: css.dim, marginBottom: 10 }}>Upload PLE4Win Excel om parameters over te nemen en 3D te visualiseren.</div>
      <input type="file" accept=".xlsx" onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return;
        setImportError(""); setImporting(true); setImportFileName(f.name);
        try {
          const parsed = await parsePLEFile(f);
          setImportedNodes(parsed.nodes);
          setImportedEls(parsed.elements);
          setImportedMeta(parsed.meta);

          // Bouw PleModel in-memory database uit de ruwe sheets (voor Editor)
          if (parsed.meta._rawSheets) {
            const model = parseSheetsToModel(parsed.meta._rawSheets);
            setPleModel(model);
            // Laad Soil Wizard resultaten als GENSOIL tab aanwezig was
            if (model.soilWizardResults && model.soilWizardResults.length > 0) {
              setSoilWizardResults(model.soilWizardResults);
            }
          }

          // FEM berekening uitvoeren (stijfheidsmatrix solver)
          try {
            const { solveFEM, solveAllLoadCases } = await import("@/lib/ple-fem");
            const mat = parsed.meta.matProps || {
              E: 207000, poisson: 0.3, alpha: 12e-6, SMYS: 235, density: 7850
            };
            const PiVal = parsed.meta.Pi || 2.5;
            const Toper = parsed.meta.Top || 100;
            const Tinstall = parsed.meta.Tinst || 10;
            const loadCases = parsed.meta.loadCases || [{ lc: 1, gloadF:1, pressF:1, tDifF:1, deadwF:1, setlF:1 }];
            const subsideMap = parsed.meta.subsideMap || {};

            const femNodes = parsed.nodes.map((n: any, i: number) => {
              const el = parsed.elements[i] || parsed.elements[i-1] || {};
              return { ...n, D: el.d || 139.7, t: el.t || 3.6, DPE: n.DPE || el.dc || 225 };
            });

            // Bouw boundary conditions uit ENDPTS + ELSPRS
            const bcs: any[] = [];
            const endptsMap = parsed.meta.endptsMap || {};
            const elsprsMap = parsed.meta.elsprsMap || {};
            Object.entries(endptsMap).forEach(([id, ep]: any) => {
              const cond = (ep.cond || "fixed").toLowerCase();
              if (cond === "fixed" || cond === "anchor") {
                bcs.push({ nodeId: id, type: "fixed" });
              } else if (cond === "free" || cond === "open") {
                bcs.push({ nodeId: id, type: "free" });
              } else if (cond === "guided") {
                bcs.push({ nodeId: id, type: "guided" });
              } else if (cond === "infin" || cond === "infinite") {
                // INFIN: half-oneindige balk (Hetényi) — PLE4Win default
                bcs.push({ nodeId: id, type: "infin" as any });
              } else if (cond === "spring" || cond === "elastic") {
                const spr = Object.values(elsprsMap).find((s: any) => s) as any;
                bcs.push({
                  nodeId: id, type: "spring",
                  kx: spr?.kx || 1e6, ky: spr?.ky || 1e6, kz: spr?.kz || 1e6,
                  krx: spr?.kphi || 0, kry: 0, krz: 0,
                });
              }
            });
            // Als er geen ENDPTS zijn: gebruik INFIN als default (ipv FIXED)
            if (bcs.length === 0 && parsed.nodes.length >= 2) {
              const firstId = parsed.nodes[0]?.id || "N0";
              const lastId = parsed.nodes[parsed.nodes.length - 1]?.id || `N${parsed.nodes.length - 1}`;
              bcs.push({ nodeId: firstId, type: "infin" as any });
              bcs.push({ nodeId: lastId, type: "infin" as any });
            }

            // Bouw grondveren — gebruik Soil Wizard resultaten als beschikbaar
            let soilSprings: any[] = [];
            const importedSwResults = parsed.meta.soilWizardResults || [];
            if (importedSwResults.length > 0) {
              // GENSOIL data uit Excel import
              soilSprings = wizardResultsToSoilSprings(importedSwResults);
            } else if (soilWizardResults.length > 0) {
              // Wizard resultaten uit eerdere berekening
              soilSprings = wizardResultsToSoilSprings(soilWizardResults);
            } else {
            // Fallback: globale grondveren uit SOIL_TYPES + G-LEVEL coverMap
            const coverMap = parsed.meta.coverMap || {};
            const globalCover = parsed.meta.cover || 500; // mm
            // Gebruik de geselecteerde grondsoort of default zand
            const soilKey = Object.keys(SOIL_TYPES)[0] as keyof typeof SOIL_TYPES;
            const soilProps = SOIL_TYPES[soilName as keyof typeof SOIL_TYPES] || SOIL_TYPES[soilKey];

            femNodes.forEach((node: any) => {
              const cover = coverMap[node.id] || globalCover; // mm dekking per node
              if (cover <= 0) return;
              // PLE4Win-stijl: grondveerstijfheid is ONAFHANKELIJK van dekking
              // Dekking beïnvloedt alleen de maximale grondreactie (RH, RVT, RVS)
              // Eenheden: soilProps.k_h in kN/m³, FEM in N/mm
              // Conversie: 1 kN/m³ = 1e-6 N/mm³
              const kh = soilProps.k_h * 1e-6;       // N/mm³
              const kv_up = soilProps.k_v_up * 1e-6;  // N/mm³
              const kv_down = soilProps.k_v_down * 1e-6; // N/mm³
              // PLE4Win-stijl: max grondreactie (RH, RVT, RVS) per lengte-eenheid
              // NEN 3650: RH = Kp × σk × D, RVT = γ × H × D, RVS = γ × (H + D/2) × D × Nγ
              const D_pipe = node.D || 139.7;
              const DPE = node.DPE || D_pipe * 1.6;
              const cover_m = cover / 1000; // dekking in m
              const DPE_m = DPE / 1000; // manteldiameter in m
              const Kp = 1 / Math.pow(Math.tan((Math.PI/4) - (soilProps.phi * Math.PI / 360)), 2);
              // σk = verticale korrelspanning op hart leiding
              const sigmaK = soilProps.gamma * cover_m; // kN/m²
              // RH = Kp × σk × D (kN/m)
              const RH = Kp * sigmaK * DPE_m;
              // RVS ≈ γ × (H + D/2) × D × 3 (neerwaarts, conservatief)
              const RVS = soilProps.gamma * (cover_m + DPE_m / 2) * DPE_m * 3;
              // RVT = γ × H × D (opwaarts = grondgewicht boven buis)
              const RVT = soilProps.gamma * cover_m * DPE_m;
              // Conversie kN/m → N/mm: 1 kN/m = 1 N/mm
              // MAAR: solver verwacht rMax als totale kracht (N), niet per lengte
              // Schat invloedslengte als gemiddelde elementlengte (~2000-5000 mm)
              // Gebruik een conservatieve waarde zodat nodes niet te snel plastisch worden
              const estInfluence = 3000; // mm (geschatte gemiddelde invloedslengte)
              const rMaxSide = RH * estInfluence; // N (totale kracht per node)
              const rMaxDown = RVS * estInfluence; // N
              const rMaxUp = RVT * estInfluence; // N
              soilSprings.push({
                nodeId: node.id,
                kh, kv_up, kv_down,
                kAxial: kh * 0.5,
              });
            });
            } // end else (fallback globale grondveren)

            // Prioriteit 4: per-element materiaal uit ISTROP
            const perElementMaterials = new Map<number, any>();
            const istropMap = parsed.meta.istropMap || {};
            if (Object.keys(istropMap).length > 0) {
              // Koppel materiaal per element via MATL sheet data
              parsed.elements.forEach((el: any, ei: number) => {
                // Zoek materiaal voor de nodes van dit element
                const n1Id = parsed.nodes[el.n1]?.id || "";
                const n2Id = parsed.nodes[el.n2]?.id || "";
                // Probeer MATL lookup (als er per-node materiaalverwijzingen zijn)
                for (const [matRef, matData] of Object.entries(istropMap)) {
                  if (matData) {
                    perElementMaterials.set(ei, matData as any);
                    break; // gebruik eerste beschikbare
                  }
                }
              });
            }

            // Prioriteit 5: steunpunten uit SUPPORT + ELSPRS
            const supportBCs: any[] = [];
            const supportList = parsed.meta.supportList || [];
            supportList.forEach((sup: any) => {
              const supRef = sup.supRef || "";
              const springData = elsprsMap[supRef] || {};
              const nodeId = sup.refIdent || "";
              if (!nodeId) return;
              // Als er verenstijfheden zijn, maak een spring BC
              if (springData.kx || springData.ky || springData.kz) {
                supportBCs.push({
                  nodeId, type: "spring",
                  kx: springData.kx || 0,
                  ky: springData.ky || 0,
                  kz: springData.kz || 0,
                  krx: springData.kphi || 0,
                });
              } else {
                // Default: vast steunpunt in verticale richting
                supportBCs.push({ nodeId, type: "spring", kx: 0, ky: 0, kz: 1e8 });
              }
            });

            // Multi-loadcase analyse
            // Bouw T-stuk SIF data voor de solver
            const teeSpecs: Record<string, any> = {};
            const teeNodeMap: Record<string, string> = {};
            if (parsed.meta.teeSpecData) {
              Object.entries(parsed.meta.teeSpecData).forEach(([ref, spec]: any) => {
                teeSpecs[ref] = {
                  type: spec.TYPE || spec.type || "Welded",
                  dRun: parseFloat(spec["D-RUN"]) || 273,
                  tRun: parseFloat(spec["T-RUN"]) || 8,
                  dBrn: parseFloat(spec["D-BRN"]) || 219,
                  tBrn: parseFloat(spec["T-BRN"]) || 6.3,
                  te: parseFloat(spec.TE) || 0,
                  r0: parseFloat(spec.R0) || 50,
                };
              });
            }
            if (parsed.meta.connects) {
              parsed.meta.connects.forEach((c: any) => {
                if (c.teeRef) {
                  teeNodeMap[c.id1] = c.teeRef;
                  teeNodeMap[c.id2] = c.teeRef;
                }
              });
            }

            if (loadCases.length > 1) {
              const result = solveAllLoadCases(
                femNodes, parsed.elements, mat, PiVal, Toper, Tinstall,
                loadCases, subsideMap, bcs.length > 0 ? bcs : undefined,
                soilSprings.length > 0 ? soilSprings : undefined,
                undefined, undefined, // designFactor, gammaM
                Object.keys(teeSpecs).length > 0 ? teeSpecs : undefined,
                Object.keys(teeNodeMap).length > 0 ? teeNodeMap : undefined,
              );
              setFemResults(result.envelope);
              setFemAllLC(result.perLC.map((r: any, i: number) => ({ lc: loadCases[i]?.lc || i + 1, results: r.nodeResults })));
              parsed.meta._femPerLC = result.perLC;
              parsed.meta._femEnvelope = result.envelope;
              parsed.meta._femConverged = result.perLC.every((r: any) => r.converged !== false);
              parsed.meta._soilIterations = result.perLC[0]?.soilIterations;
              parsed.meta._soilConverged = result.perLC[0]?.soilConverged;
              parsed.meta._plasticNodeCount = result.perLC[0]?.plasticNodeCount;
              // Element forces van het maatgevende lastgeval
              const worstLCIdx = result.perLC.reduce((best: number, lc: any, i: number) => {
                const maxUC = Math.max(...(lc.nodeResults || []).map((r: any) => r.uc || 0));
                const bestUC = Math.max(...(result.perLC[best]?.nodeResults || []).map((r: any) => r.uc || 0));
                return maxUC > bestUC ? i : best;
              }, 0);
              parsed.meta._femElementForces = result.perLC[worstLCIdx]?.elementForces;
            } else {
                // Bepaal of niet-lineaire analyse nodig is
                // Alleen bij significante belasting (druk of temperatuur)
                const lc0 = loadCases[0] || {};
                const hasSignificantLoad = (lc0.pressF || 0) > 0 || (lc0.tDifF || 0) > 0;

                const result = solveFEM({
                nodes: femNodes, elements: parsed.elements, mat,
                Pi_bar: PiVal, Toper, Tinstall,
                loadCase: loadCases[0] || { lc:1, gloadF:1, pressF:1, tDifF:1, deadwF:1, setlF:1 },
                subsideMap,
                boundaryConditions: bcs.length > 0 ? bcs : undefined,
                soilSprings: soilSprings.length > 0 ? soilSprings : undefined,
                perElementMaterials: perElementMaterials.size > 0 ? perElementMaterials : undefined,
                supportSprings: supportBCs.length > 0 ? supportBCs : undefined,
                geometricNonlinear: hasSignificantLoad,
                materialNonlinear: hasSignificantLoad,
                maxGeoIterations: parsed.meta.geomctl?.maxGeoIterations || 10,
                geoConvergenceTol: parsed.meta.geomctl?.geoConvergenceTol || 0.001,
                maxRotation: parsed.meta.geomctl?.maxRotation || 0.3,
                maxSoilIterations: parsed.meta.soilctl?.maxSoilIterations || 20,
                teeSpecs: Object.keys(teeSpecs).length > 0 ? teeSpecs : undefined,
                teeNodeMap: Object.keys(teeNodeMap).length > 0 ? teeNodeMap : undefined,
              });
              setFemResults(result.nodeResults);
              setFemAllLC([{ lc: loadCases[0]?.lc || 1, results: result.nodeResults }]);
              parsed.meta._femElementForces = result.elementForces;
              parsed.meta._femConverged = result.converged;
              parsed.meta._soilIterations = result.soilIterations;
              parsed.meta._soilConverged = result.soilConverged;
              parsed.meta._plasticNodeCount = result.plasticNodeCount;
              parsed.meta._geoIterations = result.geoIterations;
              parsed.meta._geoConverged = result.geoConverged;
              parsed.meta._matIterations = result.matIterations;
              parsed.meta._matConverged = result.matConverged;
              parsed.meta._yieldedElements = result.yieldedElementCount;
              parsed.meta._maxPlasticStrain = result.maxPlasticStrain;
              parsed.meta._localBuckled = result.localBuckledCount;
            }
          } catch (e) {
            console.error("FEM berekening mislukt:", e);
          }

          setTab("model3d");
          // Update basic geometry from import
          if (parsed.nodes.length > 1) {
            const last = parsed.nodes[parsed.nodes.length-1];
            setL(Math.max(10, Math.round(Math.hypot(last.x, last.y))));
          }
          if (parsed.meta?.D) setD(parsed.meta.D);
          if (parsed.meta?.t) setT(parsed.meta.t);
          // Gebruik RUWE waarden voor de state (niet LOCASE-gefactored)
          // De LOCASE factoren worden alleen in de FEM solver toegepast per lastgeval
          // Zo toont de Resultaten tab de werkelijke bedrijfscondities
          const rawPi = parsed.meta?.PiRaw ?? parsed.meta?.Pi ?? Pi;
          const rawTop = parsed.meta?.TopRaw ?? parsed.meta?.Top ?? Top;
          const rawTin = parsed.meta?.Tinst ?? Tin;
          setPi(rawPi > 0 ? rawPi * 10 : Pi); // N/mm² → bar
          setTop(rawTop);
          setTin(rawTin);
          if (parsed.meta?.mat) {
            const m = Object.keys(MATERIALS).find(k => k.toLowerCase().includes(parsed.meta.mat.toLowerCase()));
            if (m) setMatName(m);
          }
          if (parsed.meta?.cover) setHc(parsed.meta.cover/1000);
          if (parsed.meta?.water !== undefined) setPe(parsed.meta.water>0 ? 0.01 : 0);

          // Save upload for later reopen
          const fd = new FormData();
          fd.append("file", f);
          fd.append("meta", JSON.stringify({ fileName: f.name, size: f.size }));
          const api2 = (window as any).electronAPI;
          if (api2?.importsSave) {
            const file = fd.get("file") as File;
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)));
            }
            const b64 = btoa(binary);
            await api2.importsSave({ name: file.name, data: b64 });
          }
          const d = await ((window as any).electronAPI?.importsList?.() || Promise.resolve({ items: [] }));
          setSavedImports(d.items || []);
        } catch (err:any) {
          setImportError(err?.message || "Import mislukt");
        } finally {
          setImporting(false);
        }
      }} />
      {importing && <div style={{ marginTop: 8, fontSize: 12, color: css.dim }}>Import bezig…</div>}
      {importFileName && <div style={{ marginTop: 6, fontSize: 11, color: css.dim }}>Bestand: {importFileName}</div>}
      {importError && <div style={{ marginTop: 8, fontSize: 12, color: css.red }}>{importError}</div>}

      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700 }}>Opgeslagen bestanden</div>
      <div style={{ marginTop: 8, border: `1px solid ${css.border}`, borderRadius: 8, overflow: "auto", maxHeight: 200 }}>
        {(savedImports || []).map(it => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${css.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.filename}</div>
              <div style={{ fontSize: 10, color: css.dim }}>{new Date(it.createdAt).toLocaleString("nl-NL")}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <button onClick={async ()=>{
                try {
                  // Wis eerst alle oude model state
                  clearImportData();

                  const res = { ok: true, json: async () => await (window as any).electronAPI?.importsGet?.(it.id) || null } as any;
                  const blob = await res.blob();
                  const file = new File([blob], it.filename, { type: blob.type });
                  const parsed = await parsePLEFile(file);
                  setImportedNodes(parsed.nodes);
                  setImportedEls(parsed.elements);
                  setImportedMeta(parsed.meta);
                  setImportFileName(it.filename);

                  // Bouw PleModel in-memory database (voor Editor)
                  if (parsed.meta._rawSheets) {
                    const model = parseSheetsToModel(parsed.meta._rawSheets);
                    setPleModel(model);
                  }

                  // FEM berekening uitvoeren (stijfheidsmatrix solver)
                  try {
                    const { solveFEM, solveAllLoadCases } = await import("@/lib/ple-fem");
                    const mat = parsed.meta.matProps || {
                      E: 207000, poisson: 0.3, alpha: 12e-6, SMYS: 235, density: 7850
                    };
                    const PiVal = parsed.meta.Pi || 2.5;
                    const Toper = parsed.meta.Top || 100;
                    const Tinstall = parsed.meta.Tinst || 10;
                    const loadCases = parsed.meta.loadCases || [{ lc: 1, gloadF:1, pressF:1, tDifF:1, deadwF:1, setlF:1 }];
                    const subsideMap = parsed.meta.subsideMap || {};

                    const femNodes = parsed.nodes.map((n: any, i: number) => {
                      const el = parsed.elements[i] || parsed.elements[i-1] || {};
                      return { ...n, D: el.d || 139.7, t: el.t || 3.6, DPE: n.DPE || el.dc || 225 };
                    });

                    // Bouw boundary conditions uit ENDPTS + ELSPRS
                    const bcs: any[] = [];
                    const endptsMap = parsed.meta.endptsMap || {};
                    const elsprsMap = parsed.meta.elsprsMap || {};
                    Object.entries(endptsMap).forEach(([id, ep]: any) => {
                      const cond = (ep.cond || "fixed").toLowerCase();
                      if (cond === "fixed" || cond === "anchor") {
                        bcs.push({ nodeId: id, type: "fixed" });
                      } else if (cond === "free" || cond === "open") {
                        bcs.push({ nodeId: id, type: "free" });
                      } else if (cond === "guided") {
                        bcs.push({ nodeId: id, type: "guided" });
                      } else if (cond === "infin" || cond === "infinite") {
                        bcs.push({ nodeId: id, type: "infin" as any });
                      } else if (cond === "spring" || cond === "elastic") {
                        const spr = Object.values(elsprsMap).find((s: any) => s) as any;
                        bcs.push({
                          nodeId: id, type: "spring",
                          kx: spr?.kx || 1e6, ky: spr?.ky || 1e6, kz: spr?.kz || 1e6,
                          krx: spr?.kphi || 0, kry: 0, krz: 0,
                        });
                      }
                    });
                    if (bcs.length === 0 && parsed.nodes.length >= 2) {
                      const firstId = parsed.nodes[0]?.id || "N0";
                      const lastId = parsed.nodes[parsed.nodes.length - 1]?.id || `N${parsed.nodes.length - 1}`;
                      bcs.push({ nodeId: firstId, type: "infin" as any });
                      bcs.push({ nodeId: lastId, type: "infin" as any });
                    }

                    // Bouw grondveren — wizard override
                    let soilSprings: any[] = [];
                    const swRes2 = parsed.meta.soilWizardResults || soilWizardResults || [];
                    if (swRes2.length > 0) {
                      soilSprings = wizardResultsToSoilSprings(swRes2);
                    } else {
                    const coverMap = parsed.meta.coverMap || {};
                    const globalCover = parsed.meta.cover || 500;
                    const soilKey = Object.keys(SOIL_TYPES)[0] as keyof typeof SOIL_TYPES;
                    const soilProps = SOIL_TYPES[soilName as keyof typeof SOIL_TYPES] || SOIL_TYPES[soilKey];
                    femNodes.forEach((node: any) => {
                      const cover = coverMap[node.id] || globalCover;
                      if (cover <= 0) return;
                      const hFactor = Math.max(cover / 1000, 0.3);
                      const kh = (soilProps.k_h / 1000) * hFactor;
                      const kv_up = (soilProps.k_v_up / 1000) * hFactor;
                      const kv_down = (soilProps.k_v_down / 1000) * hFactor;
                      const D_pipe = node.D || 139.7;
                      const DPE = node.DPE || D_pipe * 1.6;
                      const Kp = 1 / Math.pow(Math.tan((Math.PI/4) - (soilProps.phi * Math.PI / 360)), 2);
                      const passivePressure = soilProps.gamma * (cover / 1000) * Kp;
                      soilSprings.push({
                        nodeId: node.id, kh, kv_up, kv_down,
                        kAxial: kh * 0.5,
                        rMaxSide: passivePressure * (DPE / 1000),
                        rMaxDown: soilProps.gamma * (cover / 1000 + DPE / 2000) * (DPE / 1000) * 3,
                        rMaxUp: soilProps.gamma * (cover / 1000) * (DPE / 1000),
                        rMaxAxial: passivePressure * (DPE / 1000) * 0.7,
                      });
                    });
                    } // end else fallback

                    if (loadCases.length > 1) {
                      const result = solveAllLoadCases(
                        femNodes, parsed.elements, mat, PiVal, Toper, Tinstall,
                        loadCases, subsideMap, bcs.length > 0 ? bcs : undefined,
                        soilSprings.length > 0 ? soilSprings : undefined,
                      );
                      setFemResults(result.envelope);
                      setFemAllLC(result.perLC.map((r: any, i: number) => ({ lc: loadCases[i]?.lc || i + 1, results: r.nodeResults })));
                      parsed.meta._femPerLC = result.perLC;
                      parsed.meta._femEnvelope = result.envelope;
                      parsed.meta._femConverged = result.perLC.every((r: any) => r.converged !== false);
                      parsed.meta._soilIterations = result.perLC[0]?.soilIterations;
                      parsed.meta._soilConverged = result.perLC[0]?.soilConverged;
                      parsed.meta._plasticNodeCount = result.perLC[0]?.plasticNodeCount;
                    } else {
                      const result = solveFEM({
                        nodes: femNodes, elements: parsed.elements, mat,
                        Pi_bar: PiVal, Toper, Tinstall,
                        loadCase: loadCases[0] || { lc:1, gloadF:1, pressF:1, tDifF:1, deadwF:1, setlF:1 },
                        subsideMap,
                        boundaryConditions: bcs.length > 0 ? bcs : undefined,
                        soilSprings: soilSprings.length > 0 ? soilSprings : undefined,
                      });
                      setFemResults(result.nodeResults);
                      setFemAllLC([{ lc: loadCases[0]?.lc || 1, results: result.nodeResults }]);
                      parsed.meta._femElementForces = result.elementForces;
                      parsed.meta._femConverged = result.converged;
                      parsed.meta._soilIterations = result.soilIterations;
                      parsed.meta._soilConverged = result.soilConverged;
                      parsed.meta._plasticNodeCount = result.plasticNodeCount;
                    }
                  } catch (e) {
                    console.error("FEM berekening mislukt:", e);
                  }

                  setTab("model3d");
                  if (parsed.meta?.D) setD(parsed.meta.D);
                  if (parsed.meta?.t) setT(parsed.meta.t);
                  const rawPi3 = parsed.meta?.PiRaw ?? parsed.meta?.Pi;
                  setPi(rawPi3 > 0 ? rawPi3 * 10 : Pi);
                  setTop(parsed.meta?.TopRaw ?? parsed.meta?.Top ?? Top);
                  setTin(parsed.meta?.Tinst ?? Tin);
                  if (parsed.meta?.mat) {
                    const m = Object.keys(MATERIALS).find(k => k.toLowerCase().includes(parsed.meta.mat.toLowerCase()));
                    if (m) setMatName(m);
                  }
                  if (parsed.meta?.cover) setHc(parsed.meta.cover/1000);
                  if (parsed.meta?.water !== undefined) setPe(parsed.meta.water>0 ? 0.01 : 0);
                } catch { setImportError("Kon bestand niet openen"); }
              }} style={{
                padding: "4px 10px", background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.2)`,
                borderRadius: 4, color: css.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: css.mono,
              }}>Heropen</button>
              <button onClick={async () => { const d = await (window as any).electronAPI?.importsGet?.(it.id); if (d?.data) { const blob = new Blob([Uint8Array.from(atob(d.data), c => c.charCodeAt(0))]); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = d.name || "import.xlsx"; a.click(); URL.revokeObjectURL(url); }}} style={{
                padding: "4px 10px", background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.2)`,
                borderRadius: 4, color: css.accent, fontSize: 11, fontWeight: 600, textDecoration: "none", fontFamily: css.mono,
                display: "inline-flex", alignItems: "center",
              }}>Open</button>
              <button onClick={async ()=>{
                if (!confirm("Verwijderen?")) return;
                // Als dit het actieve bestand is, wis de model state
                if (importFileName === it.filename) clearImportData();
                await (window as any).electronAPI?.importsDelete?.(it.id);
                const d=await ((window as any).electronAPI?.importsList?.() || Promise.resolve({ items: [] }));
                setSavedImports(d.items||[]);
              }} style={{
                padding: "4px 10px", background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.2)`,
                borderRadius: 4, color: css.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: css.mono,
              }}>Verwijder</button>
            </div>
          </div>
        ))}
        {(!savedImports || savedImports.length===0) && (
          <div style={{ padding: 10, fontSize: 11, color: css.dim }}>Nog geen opgeslagen bestanden.</div>
        )}
      </div>
    </Card>

    {/* ── MODEL EDITOR — bewerkbare tabellen onder de import ── */}
    {(pleModel || importedMeta?._rawSheets) && (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: css.text }}>📝 Model Editor</span>
            <span style={{ fontSize: 10, color: css.dim, marginLeft: 8 }}>Bewerk de invoerdata — klik Herberekenen om FEM opnieuw te draaien</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={async () => {
              if (!pleModel || pleModel.nodes.length < 2) { alert("Importeer eerst een model."); return; }
              try {
                // Herberekenen: PleModel → legacy (nodes/elements/meta) → FEM
                // Gebruik modelToLegacy zodat de FEM input EXACT gelijk is aan de import-path
                const legacy = modelToLegacy(pleModel);
                const legacyNodes = legacy.nodes;
                const legacyEls = legacy.elements;
                const legacyMeta = legacy.meta;

                // Sync naar React state
                setImportedNodes(legacyNodes);
                setImportedEls(legacyEls);
                setImportedMeta((prev: any) => ({ ...prev, ...legacyMeta }));

                const { solveFEM, solveAllLoadCases } = await import("@/lib/ple-fem");
                const mat = legacyMeta.matProps || { E: 207000, poisson: 0.3, alpha: 12e-6, SMYS: 235, density: 7850 };
                const PiVal = legacyMeta.Pi || 2.5;
                const ToperVal = legacyMeta.Top || 100;
                const TinstallVal = legacyMeta.Tinst || 10;
                const lcList = legacyMeta.loadCases || [{ lc: 1, gloadF:1, pressF:1, tDifF:1, deadwF:1, setlF:1 }];
                const subsideMapVal = legacyMeta.subsideMap || {};

                const femNodes = legacyNodes.map((n: any, i: number) => {
                  const el = legacyEls[i] || legacyEls[i-1] || {};
                  return { ...n, D: el.d || 139.7, t: el.t || 3.6, DPE: n.DPE || el.dc || 225 };
                });

                const bcs: any[] = [];
                const endptsMap = legacyMeta.endptsMap || {};
                const elsprsMap = legacyMeta.elsprsMap || {};
                Object.entries(endptsMap).forEach(([id, ep]: any) => {
                  const cond = (ep.cond || "fixed").toLowerCase();
                  if (cond === "fixed" || cond === "anchor") bcs.push({ nodeId: id, type: "fixed" });
                  else if (cond === "free" || cond === "open") bcs.push({ nodeId: id, type: "free" });
                  else if (cond === "guided") bcs.push({ nodeId: id, type: "guided" });
                  else if (cond === "infin" || cond === "infinite") bcs.push({ nodeId: id, type: "infin" as any });
                  else if (cond === "spring" || cond === "elastic") {
                    const spr = Object.values(elsprsMap).find((s: any) => s) as any;
                    bcs.push({ nodeId: id, type: "spring", kx: spr?.kx || 1e6, ky: spr?.ky || 1e6, kz: spr?.kz || 1e6, krx: spr?.kphi || 0, kry: 0, krz: 0 });
                  }
                });
                if (bcs.length === 0 && legacyNodes.length >= 2) {
                  bcs.push({ nodeId: legacyNodes[0]?.id || "N0", type: "infin" as any });
                  bcs.push({ nodeId: legacyNodes[legacyNodes.length - 1]?.id || `N${legacyNodes.length - 1}`, type: "infin" as any });
                }

                let soilSprings: any[] = [];
                const swRes3 = legacyMeta.soilWizardResults || soilWizardResults || [];
                if (swRes3.length > 0) {
                  soilSprings = wizardResultsToSoilSprings(swRes3);
                } else {
                const coverMap = legacyMeta.coverMap || {};
                const globalCover = legacyMeta.cover || 500;
                const soilKey = Object.keys(SOIL_TYPES)[0] as keyof typeof SOIL_TYPES;
                const soilPropsVal = SOIL_TYPES[soilName as keyof typeof SOIL_TYPES] || SOIL_TYPES[soilKey];
                femNodes.forEach((node: any) => {
                  const cover = coverMap[node.id] || globalCover;
                  if (cover <= 0) return;
                  const kh = soilPropsVal.k_h * 1e-6;
                  const kv_up = soilPropsVal.k_v_up * 1e-6;
                  const kv_down = soilPropsVal.k_v_down * 1e-6;
                  soilSprings.push({ nodeId: node.id, kh, kv_up, kv_down, kAxial: kh * 0.5 });
                });
                } // end else fallback

                const teeSpecsR: Record<string, any> = {};
                const teeNodeMapR: Record<string, string> = {};
                if (legacyMeta.teeSpecData) {
                  Object.entries(legacyMeta.teeSpecData).forEach(([ref, spec]: any) => {
                    teeSpecsR[ref] = {
                      type: spec.TYPE || spec.type || "Welded",
                      dRun: parseFloat(spec["D-RUN"]) || 273, tRun: parseFloat(spec["T-RUN"]) || 8,
                      dBrn: parseFloat(spec["D-BRN"]) || 219, tBrn: parseFloat(spec["T-BRN"]) || 6.3,
                      te: parseFloat(spec.TE) || 0, r0: parseFloat(spec.R0) || 50,
                    };
                  });
                }
                if (legacyMeta.connects) {
                  legacyMeta.connects.forEach((c: any) => {
                    if (c.teeRef) { teeNodeMapR[c.id1] = c.teeRef; teeNodeMapR[c.id2] = c.teeRef; }
                  });
                }

                const hasSignificantLoad = lcList.some((lc: any) => (lc.pressF || 0) > 0 || (lc.tDifF || 0) > 0);

                if (lcList.length > 1) {
                  const result = solveAllLoadCases(
                    femNodes, legacyEls, mat, PiVal, ToperVal, TinstallVal,
                    lcList, subsideMapVal,
                    bcs.length > 0 ? bcs : undefined,
                    soilSprings.length > 0 ? soilSprings : undefined,
                    undefined, undefined,
                    Object.keys(teeSpecsR).length > 0 ? teeSpecsR : undefined,
                    Object.keys(teeNodeMapR).length > 0 ? teeNodeMapR : undefined,
                  );
                  setFemResults(result.envelope);
                  setFemAllLC(result.perLC.map((r: any, i: number) => ({ lc: lcList[i]?.lc || i + 1, results: r.nodeResults })));
                  setImportedMeta((prev: any) => ({
                    ...prev,
                    _femConverged: result.perLC.every((r: any) => r.converged !== false),
                    _soilIterations: result.perLC[0]?.soilIterations,
                    _soilConverged: result.perLC[0]?.soilConverged,
                    _plasticNodeCount: result.perLC[0]?.plasticNodeCount,
                    _geoIterations: result.perLC[0]?.geoIterations,
                    _geoConverged: result.perLC[0]?.geoConverged,
                  }));
                } else {
                  const result = solveFEM({
                    nodes: femNodes, elements: legacyEls, mat,
                    Pi_bar: PiVal, Toper: ToperVal, Tinstall: TinstallVal,
                    loadCase: lcList[0] || { lc: 1, gloadF: 1, pressF: 1, tDifF: 1, deadwF: 1, setlF: 1 },
                    subsideMap: subsideMapVal,
                    boundaryConditions: bcs.length > 0 ? bcs : undefined,
                    soilSprings: soilSprings.length > 0 ? soilSprings : undefined,
                    geometricNonlinear: hasSignificantLoad,
                    materialNonlinear: hasSignificantLoad,
                    teeSpecs: Object.keys(teeSpecsR).length > 0 ? teeSpecsR : undefined,
                    teeNodeMap: Object.keys(teeNodeMapR).length > 0 ? teeNodeMapR : undefined,
                  });
                  setFemResults(result.nodeResults);
                  setFemAllLC([{ lc: lcList[0]?.lc || 1, results: result.nodeResults }]);
                  setImportedMeta((prev: any) => ({
                    ...prev,
                    _femConverged: result.converged,
                    _soilIterations: result.soilIterations,
                    _soilConverged: result.soilConverged,
                    _plasticNodeCount: result.plasticNodeCount,
                    _geoIterations: result.geoIterations,
                    _geoConverged: result.geoConverged,
                  }));
                }
              } catch (e) {
                console.error("Herberekening mislukt:", e);
                alert("Herberekening mislukt: " + (e as Error).message);
              }
            }} style={{
              padding: "4px 10px", fontSize: 10, fontFamily: css.mono,
              background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)",
              borderRadius: 4, color: "#eab308", cursor: "pointer",
            }}>⚡ Herberekenen</button>
          </div>
        </div>
        {pleModel ? (
          <PleEditor
            model={pleModel}
            onModelChange={(updated) => {
              setPleModel(updated);
              syncModelToLegacy(updated);
            }}
            onDataChanged={() => {
              // Toekomstig: auto-herberekening of "gewijzigd" indicator
            }}
          />
        ) : (
          <PleEditor
            rawSheets={importedMeta._rawSheets}
            onRawSheetsChange={(updated: Record<string, any[][]>) => {
              setImportedMeta((prev: any) => ({ ...prev, _rawSheets: updated }));
            }}
            onDataChanged={() => {}}
          />
        )}
      </Card>
    )}
  </div>
  );

  // ---- TAB: DIAGRAMMEN ----
  // Spannings-, verplaatsings- en krachtendiagrammen langs het tracé
  const tabDiagrams = (() => {
    if (!femResults || femResults.length === 0) {
      return (
        <Card>
          <div style={{ padding: 20, textAlign: "center", color: css.dim }}>
            Importeer eerst een PLE4Win bestand en voer de FEM berekening uit om diagrammen te bekijken.
          </div>
        </Card>
      );
    }

    // Actieve data: envelop (activeLoadCase=-1) of specifieke LC
    const activeData = activeLoadCase === -1
      ? femResults
      : (femAllLC[activeLoadCase]?.results || femResults);

    // Bereken cumulatieve afstand langs tracé
    const cumDist: number[] = [0];
    for (let i = 1; i < importedNodes.length; i++) {
      const p = importedNodes[i - 1];
      const c = importedNodes[i];
      const dx = (c.x || 0) - (p.x || 0);
      const dy = (c.y || 0) - (p.y || 0);
      const dz = (c.z || 0) - (p.z || 0);
      cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000);
    }
    const totalLength = cumDist[cumDist.length - 1] || 1;
    const matched = activeData.map((r: any, i: number) => ({ ...r, dist: cumDist[i] || 0, idx: i }));

    // SVG chart component met hover tooltips
    const DiagramChart = ({ title, series, yLabel, unit, height = 180, limitLine }: {
      title: string;
      series: { label: string; color: string; data: { x: number; y: number; nodeId?: string }[] }[];
      yLabel: string; unit: string; height?: number;
      limitLine?: { value: number; label: string; color: string };
    }) => {
      const W = mobile ? 340 : 640, H = height;
      const ml = 55, mr = 14, mt = 10, mb = 28;
      const pw = W - ml - mr, ph = H - mt - mb;
      let minY = 0, maxY = 1;
      series.forEach(s => s.data.forEach(d => { if (d.y < minY) minY = d.y; if (d.y > maxY) maxY = d.y; }));
      if (limitLine) { if (limitLine.value > maxY) maxY = limitLine.value * 1.1; }
      const yPad = Math.max(Math.abs(maxY - minY) * 0.1, 0.1);
      minY -= yPad; maxY += yPad;
      const yRange = maxY - minY || 1;
      const toX = (v: number) => ml + (v / totalLength) * pw;
      const toY = (v: number) => mt + ph - ((v - minY) / yRange) * ph;
      const yTicks = 5, yStep = yRange / yTicks;

      return (
        <Section icon="📈" title={title} sub={yLabel}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = ((e.clientX - rect.left) / rect.width) * W;
              const dist = ((mx - ml) / pw) * totalLength;
              const closest = matched.reduce((a: any, b: any) => Math.abs(b.dist - dist) < Math.abs(a.dist - dist) ? b : a, matched[0]);
              if (closest) setDiagramHover(closest.idx);
            }}
            onMouseLeave={() => setDiagramHover(null)}
          >
            {Array.from({ length: yTicks + 1 }, (_, i) => {
              const val = minY + i * yStep; const y = toY(val);
              return (<g key={i}><line x1={ml} y1={y} x2={W - mr} y2={y} stroke={css.border} strokeWidth={0.5} />
                <text x={ml - 4} y={y + 3} textAnchor="end" fill={css.faint} fontSize={8} fontFamily={css.mono}>{Math.abs(val) < 10 ? val.toFixed(1) : val.toFixed(0)}</text></g>);
            })}
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <text key={f} x={toX(totalLength * f)} y={H - 4} textAnchor="middle" fill={css.faint} fontSize={8} fontFamily={css.mono}>{(totalLength * f).toFixed(0)}m</text>
            ))}
            {minY < 0 && maxY > 0 && <line x1={ml} y1={toY(0)} x2={W - mr} y2={toY(0)} stroke={css.dim} strokeWidth={0.5} strokeDasharray="3,3" />}
            {limitLine && <line x1={ml} y1={toY(limitLine.value)} x2={W - mr} y2={toY(limitLine.value)} stroke={limitLine.color} strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />}
            {limitLine && <text x={W - mr - 2} y={toY(limitLine.value) - 4} textAnchor="end" fill={limitLine.color} fontSize={7} fontFamily={css.mono} opacity={0.8}>{limitLine.label}</text>}
            {series.map((s, si) => {
              if (s.data.length < 2) return null;
              const pts = s.data.map(d => `${toX(d.x)},${toY(d.y)}`).join(" ");
              const maxPt = s.data.reduce((a, b) => Math.abs(b.y) > Math.abs(a.y) ? b : a, s.data[0]);
              return (<g key={si}>
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.5} />
                <circle cx={toX(maxPt.x)} cy={toY(maxPt.y)} r={3} fill={s.color} />
                <text x={toX(maxPt.x)} y={toY(maxPt.y) - 7} textAnchor="middle" fill={s.color} fontSize={7} fontFamily={css.mono} fontWeight={600}>
                  {Math.abs(maxPt.y) < 10 ? maxPt.y.toFixed(2) : maxPt.y.toFixed(1)} {unit}
                </text>
              </g>);
            })}
            {/* Hover indicator */}
            {diagramHover !== null && matched[diagramHover] && (() => {
              const hp = matched[diagramHover];
              const hx = toX(hp.dist);
              return (<g>
                <line x1={hx} y1={mt} x2={hx} y2={mt + ph} stroke={css.accent} strokeWidth={0.5} strokeDasharray="2,2" opacity={0.6} />
                <circle cx={hx} cy={mt} r={2} fill={css.accent} />
                <text x={hx + 4} y={mt + 10} fill={css.accent} fontSize={7} fontFamily={css.mono}>{hp.nodeId || `N${hp.idx}`}</text>
              </g>);
            })()}
            {series.length > 1 && series.map((s, si) => (
              <g key={si}><line x1={ml + si * 80} y1={H - 16} x2={ml + si * 80 + 12} y2={H - 16} stroke={s.color} strokeWidth={2} />
                <text x={ml + si * 80 + 16} y={H - 13} fill={s.color} fontSize={8} fontFamily={css.mono}>{s.label}</text></g>
            ))}
          </svg>
        </Section>
      );
    };

    // Steunpunt reactiekrachten
    const bcNodes = Object.entries(importedMeta?.endptsMap || {});
    const reactions = bcNodes.map(([id, ep]: any) => {
      const r = activeData.find((r: any) => r.nodeId === id);
      return r ? { id, cond: ep.cond || "fixed", Fx: r.Fx || 0, My: r.My || 0, Mz: r.Mz || 0, uc: r.uc } : null;
    }).filter(Boolean);

    // Vermoeiing T-stukken
    const teeConfs = Object.entries(importedMeta?.teeconfMap || {});
    const SMYS_val = importedMeta?.matProps?.SMYS || m.SMYS;

    return (
      <div>
        {/* Loadcase selector */}
        {femAllLC.length > 1 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: css.muted, fontFamily: css.mono }}>Loadcase:</span>
            <button onClick={() => setActiveLoadCase(-1)} style={{
              padding: "4px 10px", border: `1px solid ${activeLoadCase === -1 ? css.accent : css.border}`, borderRadius: 6,
              background: activeLoadCase === -1 ? "rgba(59,130,246,0.12)" : css.card,
              color: activeLoadCase === -1 ? css.accent : css.muted, fontSize: 11, fontFamily: css.mono, cursor: "pointer",
            }}>Envelop</button>
            {femAllLC.map((lc: any, i: number) => (
              <button key={i} onClick={() => setActiveLoadCase(i)} style={{
                padding: "4px 10px", border: `1px solid ${activeLoadCase === i ? css.accent : css.border}`, borderRadius: 6,
                background: activeLoadCase === i ? "rgba(59,130,246,0.12)" : css.card,
                color: activeLoadCase === i ? css.accent : css.muted, fontSize: 11, fontFamily: css.mono, cursor: "pointer",
              }}>LC {lc.lc}</button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Badge pass={n.hp} label="Ring" unity={n.hu} compact={mobile} />
          <Badge pass={n.vp} label="VM" unity={n.vu} compact={mobile} />
          <Badge pass={n.ok} label="Totaal" unity={n.cu} compact={mobile} />
        </div>

        {/* Hover info bar */}
        {diagramHover !== null && matched[diagramHover] && (() => {
          const hp = matched[diagramHover];
          return (
            <div style={{ padding: "6px 12px", background: css.card, border: `1px solid ${css.border}`, borderRadius: 8, marginBottom: 12, fontFamily: css.mono, fontSize: 11, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ color: css.accent, fontWeight: 600 }}>{hp.nodeId || `N${hp.idx}`}</span>
              <span style={{ color: css.muted }}>σh={hp.sh?.toFixed(1)}</span>
              <span style={{ color: css.muted }}>σvm={hp.vm?.toFixed(1)}</span>
              <span style={{ color: css.muted }}>UC={hp.uc?.toFixed(3)}</span>
              <span style={{ color: css.muted }}>ux={hp.ux?.toFixed(1)}</span>
              <span style={{ color: css.muted }}>uy={hp.uy?.toFixed(1)}</span>
              <span style={{ color: css.muted }}>uz={hp.uz?.toFixed(1)} mm</span>
              <span style={{ color: css.dim }}>@ {hp.dist?.toFixed(1)}m</span>
            </div>
          );
        })()}

        <div style={grid2}>
          <DiagramChart title="Spanningen langs tracé" yLabel="σ [MPa]" unit="MPa"
            series={[
              { label: "σh", color: css.accent, data: matched.map((r: any) => ({ x: r.dist, y: r.sh, nodeId: r.nodeId })) },
              { label: "σl", color: css.green, data: matched.map((r: any) => ({ x: r.dist, y: r.sl, nodeId: r.nodeId })) },
              { label: "σvm", color: css.yellow, data: matched.map((r: any) => ({ x: r.dist, y: r.vm, nodeId: r.nodeId })) },
            ]}
          />
          <DiagramChart title="Unity check langs tracé" yLabel="UC [-]" unit=""
            series={[{ label: "UC", color: css.red, data: matched.map((r: any) => ({ x: r.dist, y: r.uc, nodeId: r.nodeId })) }]}
            limitLine={{ value: 1.0, label: "UC=1.0", color: css.red }}
          />
          <DiagramChart title="Verplaatsingen langs tracé" yLabel="u [mm]" unit="mm"
            series={[
              { label: "ux", color: css.accent, data: matched.map((r: any) => ({ x: r.dist, y: r.ux || 0 })) },
              { label: "uy", color: css.green, data: matched.map((r: any) => ({ x: r.dist, y: r.uy || 0 })) },
              { label: "uz", color: css.yellow, data: matched.map((r: any) => ({ x: r.dist, y: r.uz || 0 })) },
            ]}
          />
          <DiagramChart title="Buigspanning langs tracé" yLabel="σb [MPa]" unit="MPa"
            series={[{ label: "σb", color: css.orange, data: matched.map((r: any) => ({ x: r.dist, y: r.sb || 0 })) }]}
          />
          <DiagramChart title="Axiaalkracht langs tracé" yLabel="Fx [kN]" unit="kN"
            series={[{ label: "Fx", color: css.accent, data: matched.map((r: any) => ({ x: r.dist, y: (r.Fx || 0) / 1000 })) }]}
          />
          <DiagramChart title="Momenten langs tracé" yLabel="M [kNm]" unit="kNm"
            series={[
              { label: "My", color: css.green, data: matched.map((r: any) => ({ x: r.dist, y: (r.My || 0) / 1e6 })) },
              { label: "Mz", color: css.yellow, data: matched.map((r: any) => ({ x: r.dist, y: (r.Mz || 0) / 1e6 })) },
            ]}
          />
        </div>

        {/* Steunpunt reactiekrachten */}
        {reactions.length > 0 && (
          <Section icon="🔩" title="Steunpunt reactiekrachten" sub="Krachten bij vaste punten">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                    {["Node", "Type", "Fx (kN)", "My (kNm)", "Mz (kNm)", "UC"].map(h => (
                      <th key={h} style={{ padding: "4px 8px", textAlign: "right", color: css.muted, fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reactions.map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${css.border}22` }}>
                      <td style={{ padding: "3px 8px", color: css.accent }}>{r.id}</td>
                      <td style={{ padding: "3px 8px", color: css.text }}>{r.cond}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{(r.Fx / 1000).toFixed(1)}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{(r.My / 1e6).toFixed(2)}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: css.text }}>{(r.Mz / 1e6).toFixed(2)}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: r.uc > 1 ? css.red : r.uc > 0.85 ? css.yellow : css.green, fontWeight: 500 }}>{r.uc.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Vermoeiing T-stukken */}
        {teeConfs.length > 0 && (
          <Section icon="🔄" title="Vermoeiing T-stukken" sub="EN 13941-1 bijlage D">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: css.mono, fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                    {["TEE-REF", "SIF run", "SIF brn", "σ range (MPa)", "σ toelaat", "Cycli", "Status"].map(h => (
                      <th key={h} style={{ padding: "4px 8px", textAlign: "right", color: css.muted, fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teeConfs.map(([ref, conf]: any) => {
                    const spec = (importedMeta.teeSpecData || {})[ref] || {};
                    const dRun = spec["D-RUN"] || spec.dRun || 139.7;
                    const tRun = spec["T-RUN"] || spec.tRun || 3.6;
                    const dBrn = spec["D-BRN"] || spec.dBrn || 139.7;
                    const tBrn = spec["T-BRN"] || spec.tBrn || 3.6;
                    const teeType = spec.TYPE || "Reinforced";
                    const te = spec.TE || 4.5;
                    const r2 = dRun / 2 - tRun;
                    const T = teeType === "Welded" ? tRun : Math.max(tRun, te);
                    const h = (T / r2) * Math.pow(r2 / (dRun / 2), 2);
                    const sifRun = Math.max(0.9 / Math.pow(Math.max(h, 0.01), 2 / 3), 1.0);
                    const r2b = dBrn / 2 - tBrn;
                    const hb = (tBrn / r2b) * Math.pow(r2b / (dBrn / 2), 2);
                    const sifBrn = Math.max(0.9 / Math.pow(Math.max(hb, 0.01), 2 / 3), 1.0);
                    const cycles = conf.cycles || 2000;
                    // σ_range = thermische spanning range × SIF
                    const sigmaRange = sifRun * Math.abs(s.st) * 2;
                    // Toelaatbare spanning voor N cycli (vereenvoudigd: 0.35×SMYS voor 7000 cycli, schaal met N^-0.2)
                    const sigmaAllow = 0.35 * SMYS_val * Math.pow(7000 / Math.max(cycles, 100), 0.2);
                    const fatigueOk = sigmaRange < sigmaAllow;
                    return (
                      <tr key={ref} style={{ borderBottom: `1px solid ${css.border}22` }}>
                        <td style={{ padding: "3px 8px", color: css.muted }}>{ref}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right" }}>{sifRun.toFixed(2)}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right" }}>{sifBrn.toFixed(2)}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right", color: !fatigueOk ? css.red : css.text }}>{sigmaRange.toFixed(1)}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right" }}>{sigmaAllow.toFixed(1)}</td>
                        <td style={{ padding: "3px 8px", textAlign: "right" }}>{cycles.toLocaleString()}</td>
                        <td style={{ padding: "3px 8px", textAlign: "center", color: fatigueOk ? css.green : css.red }}>{fatigueOk ? "✓" : "✗"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ASME B31.8 normtoetsing */}
        <Section icon="🇺🇸" title="ASME B31.8" sub="Gas Transmission Pipeline stress check" defaultOpen={false}>
          {(() => {
            const SMYS_val = importedMeta?.matProps?.SMYS || m.SMYS;
            const Pi_val = (importedMeta?.Pi || Pi * 0.1);
            const D_val = importedMeta?.D || D;
            const t_val = importedMeta?.t || t;
            const hoopStress = (Pi_val * D_val) / (2 * t_val);
            const F_class: Record<number, number> = { 1: 0.72, 2: 0.60, 3: 0.50, 4: 0.40 };
            const F = F_class[cls] || 0.72;
            const allowHoop = F * 1.0 * 1.0 * SMYS_val;
            const allowLong = 0.75 * F * SMYS_val;
            const allowCombined = 0.90 * SMYS_val;
            const ucH = allowHoop > 0 ? hoopStress / allowHoop : 0;
            const ucL = allowLong > 0 ? Math.abs(s.sl) / allowLong : 0;
            const ucC = allowCombined > 0 ? s.vm / allowCombined : 0;
            const okASME = ucH <= 1 && ucL <= 1 && ucC <= 1;
            return (
              <div>
                <div style={{ fontSize: 11, color: css.muted, marginBottom: 8 }}>
                  Class {cls} | F = {F} | E = 1.0 (seamless) | T = 1.0
                </div>
                <Row label="§841.1 Hoop stress" value={hoopStress} unit="MPa" />
                <Row label="Allowable hoop (F×E×T×SMYS)" value={allowHoop} unit="MPa" hl />
                <Row label="UC hoop" value={ucH} warn={ucH > 1} />
                <div style={{ height: 6 }} />
                <Row label="§833.4 Longitudinal stress" value={Math.abs(s.sl)} unit="MPa" />
                <Row label="Allowable long (0.75×F×SMYS)" value={allowLong} unit="MPa" />
                <Row label="UC longitudinal" value={ucL} warn={ucL > 1} />
                <div style={{ height: 6 }} />
                <Row label="§833.6 Combined (Von Mises)" value={s.vm} unit="MPa" />
                <Row label="Allowable combined (0.9×SMYS)" value={allowCombined} unit="MPa" />
                <Row label="UC combined" value={ucC} warn={ucC > 1} />
                <div style={{ marginTop: 10, padding: 8, background: okASME ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", borderRadius: 6, border: `1px solid ${okASME ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <span style={{ fontSize: 12, color: okASME ? css.green : css.red, fontFamily: css.mono, fontWeight: 600 }}>
                    {okASME ? "✓ ASME B31.8 — PASS" : "✗ ASME B31.8 — FAIL"}
                    {" "}(UC max = {Math.max(ucH, ucL, ucC).toFixed(3)})
                  </span>
                </div>
              </div>
            );
          })()}
        </Section>
      </div>
    );
  })();

  // ---- TAB: TEKENING (PipeDraw) ----
  const tabTekening = importedNodes.length > 0 ? (
    <div>
      <div style={{ fontSize: 10, color: css.dim, fontFamily: css.mono, marginBottom: 8 }}>
        PipeDraw — Horizontaal en verticaal leidingprofiel. Gebruik de toggles om informatie aan/uit te zetten.
      </div>
      <PlePipeDraw
        nodes={importedNodes}
        elements={importedEls}
        boundaryConditions={[]}
        glevel={Object.entries(importedMeta?.coverMap || {}).map(([id, z]: any) => ({ nodeIndex: importedNodes.findIndex((n: any) => n.id === id), z: Number(z) })).filter((g: any) => g.nodeIndex >= 0)}
        wlevel={Object.entries(importedMeta?.waterMap || {}).map(([id, z]: any) => ({ nodeIndex: importedNodes.findIndex((n: any) => n.id === id), z: Number(z) })).filter((g: any) => g.nodeIndex >= 0)}
        projectName={importFileName}
        css={css}
      />
    </div>
  ) : (
    <div style={{ padding: 40, textAlign: "center", color: css.muted, fontFamily: css.mono, fontSize: 11, border: `1px dashed ${css.border}`, borderRadius: 8 }}>
      Importeer eerst een leidingmodel om de tekening te bekijken
    </div>
  );


  // ── Admin Panel (License Generator) ────────────────────────
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPlan, setAdminPlan] = useState("pro");
  const [adminDays, setAdminDays] = useState("365");
  const [generatedKey, setGeneratedKey] = useState("");
  const [adminKeys, setAdminKeys] = useState<Array<{email:string,name:string,plan:string,days:string,key:string,date:string}>>([]);

  const generateLicenseKey = async () => {
    if (!adminEmail) return;
    try {
      // Use Web Crypto API with the same Ed25519 approach
      // For desktop: call Electron IPC to generate with private key
      const payload = {
        email: adminEmail,
        name: adminName,
        plan: adminPlan,
        expiresAt: new Date(Date.now() + parseInt(adminDays) * 86400000).toISOString(),
      };
      // Send to main process for signing
      if (typeof window !== "undefined" && (window as any).electronAPI?.generateLicense) {
        const key = await (window as any).electronAPI.generateLicense(payload);
        setGeneratedKey(key);
        setAdminKeys(prev => [...prev, { email: adminEmail, name: adminName, plan: adminPlan, days: adminDays, key, date: new Date().toISOString().split("T")[0] }]);
      } else {
        setGeneratedKey("⚠️ Alleen beschikbaar in desktop app met admin rechten");
      }
    } catch (err: any) {
      setGeneratedKey("Fout: " + err.message);
    }
  };

  const tabAdmin = (
    <div>
      <Section icon="🛡️" title="Licentie Generator" sub="Genereer offline licenties voor klanten">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: css.dim, display: "block", marginBottom: 4 }}>Email *</label>
            <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="klant@email.com"
              style={{ width: "100%", padding: "8px 10px", background: css.card, border: `1px solid ${css.border}`, borderRadius: 6, color: css.text, fontSize: 12, fontFamily: css.mono, outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: css.dim, display: "block", marginBottom: 4 }}>Naam</label>
            <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Klantnaam"
              style={{ width: "100%", padding: "8px 10px", background: css.card, border: `1px solid ${css.border}`, borderRadius: 6, color: css.text, fontSize: 12, fontFamily: css.mono, outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: css.dim, display: "block", marginBottom: 4 }}>Plan</label>
            <select value={adminPlan} onChange={e => setAdminPlan(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: css.card, border: `1px solid ${css.border}`, borderRadius: 6, color: css.text, fontSize: 12, fontFamily: css.mono }}>
              <option value="trial">Trial (14 dagen)</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: css.dim, display: "block", marginBottom: 4 }}>Geldig (dagen)</label>
            <input value={adminDays} onChange={e => setAdminDays(e.target.value)} type="number"
              style={{ width: "100%", padding: "8px 10px", background: css.card, border: `1px solid ${css.border}`, borderRadius: 6, color: css.text, fontSize: 12, fontFamily: css.mono, outline: "none" }} />
          </div>
        </div>
        <button onClick={generateLicenseKey} style={{ marginTop: 12, padding: "10px 24px", background: css.accent, border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          🔑 Genereer Licentie
        </button>
        {generatedKey && (
          <div style={{ marginTop: 12, padding: 12, background: "rgba(34,197,94,0.06)", border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: css.green, fontWeight: 600, marginBottom: 6 }}>Gegenereerde Key:</div>
            <div style={{ fontSize: 10, fontFamily: css.mono, color: css.text, wordBreak: "break-all", userSelect: "all", cursor: "text", padding: 8, background: css.card, borderRadius: 4 }}>
              {generatedKey}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { ((window as any).electronAPI?.copyToClipboard || navigator.clipboard.writeText.bind(navigator.clipboard))(generatedKey); }} style={{ padding: "6px 14px", background: "rgba(59,130,246,0.1)", border: `1px solid ${css.border}`, borderRadius: 6, color: css.accent, fontSize: 11, cursor: "pointer", fontFamily: css.mono }}>
                📋 Kopieer
              </button>
              <button onClick={async () => {
                const api = (window as any).electronAPI;
                if (api?.exportLicenseFile) {
                  const endDate = new Date(Date.now() + parseInt(adminDays) * 86400000).toISOString();
                  await api.exportLicenseFile({ key: generatedKey, email: adminEmail, name: adminName, plan: adminPlan, days: adminDays, expiresAt: endDate });
                }
              }} style={{ padding: "6px 14px", background: "rgba(34,197,94,0.1)", border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 6, color: css.green, fontSize: 11, cursor: "pointer", fontFamily: css.mono }}>
                💾 Exporteer .txt
              </button>
            </div>
          </div>
        )}
      </Section>

      {adminKeys.length > 0 && (
        <Section icon="📋" title="Uitgegeven Licenties" sub={`${adminKeys.length} licentie(s) gegenereerd`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {adminKeys.map((k, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: css.card, borderRadius: 6, border: `1px solid ${css.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: css.text }}>{k.name || k.email}</div>
                  <div style={{ fontSize: 10, color: css.dim, fontFamily: css.mono }}>{k.email} · {k.plan} · {k.days}d · {k.date}</div>
                </div>
                <button onClick={() => ((window as any).electronAPI?.copyToClipboard || navigator.clipboard.writeText.bind(navigator.clipboard))(k.key)} style={{ padding: "4px 10px", background: "rgba(59,130,246,0.1)", border: `1px solid ${css.border}`, borderRadius: 4, color: css.accent, fontSize: 10, cursor: "pointer" }}>📋</button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );

  const tabContent: Record<string, React.ReactNode> = { input: tabInput, import: tabImport, model3d: tab3d, results: tabResults, diagrams: tabDiagrams, tekening: tabTekening, nen3650: tabNen, soil: tabSoil, report: tabReport, admin: tabAdmin };

  // ============================================================
  // Roadmap Sidebar Component
  // ============================================================
  const roadmapSidebar = (
    <div style={{
      width: mobile ? "100%" : 170,
      background: "rgba(15,23,42,0.6)",
      borderRight: mobile ? "none" : `1px solid ${css.border}`,
      borderBottom: mobile ? `1px solid ${css.border}` : "none",
      padding: mobile ? "8px 10px" : "10px 8px",
      flexShrink: 0,
      overflowY: "auto",
    }}>
      {/* Header met voortgang */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: mobile ? 8 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🗺️</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: css.text, letterSpacing: -0.3 }}>Roadmap</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontFamily: css.mono, color: css.muted }}>{completedSteps}/{totalSteps}</span>
          {mobile && (
            <button onClick={() => setShowRoadmap(!showRoadmap)} style={{ background: "none", border: "none", color: css.dim, cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>
              {showRoadmap ? "▼" : "▶"}
            </button>
          )}
        </div>
      </div>

      {/* Voortgangsbalk */}
      <div style={{ height: 3, background: css.border, borderRadius: 2, marginBottom: mobile ? 6 : 12, overflow: "hidden" }}>
        <div style={{ width: `${progressPct}%`, height: "100%", background: progressPct === 100 ? css.green : css.accent, borderRadius: 2, transition: "width 0.4s" }} />
      </div>

      {/* Stappen — op mobile inklapbaar */}
      {(showRoadmap || !mobile) && (
        <div style={{ display: "flex", flexDirection: mobile ? "row" : "column", gap: mobile ? 4 : 2, flexWrap: mobile ? "wrap" : "nowrap" }}>
          {ROADMAP_STEPS.map((step, i) => {
            const status = getStepStatus(step.id);
            const isActive = tab === step.tab;
            const isLocked = status === "locked";
            const color = stepStatusColor(status);

            return (
              <button
                key={step.id}
                onClick={() => {
                  if (!isLocked) setTab(step.tab);
                }}
                disabled={isLocked}
                style={{
                  display: "flex",
                  alignItems: mobile ? "center" : "flex-start",
                  gap: mobile ? 3 : 6,
                  padding: mobile ? "3px 6px" : "5px 8px",
                  background: isActive ? "rgba(59,130,246,0.1)" : "transparent",
                  border: isActive ? `1px solid rgba(59,130,246,0.25)` : "1px solid transparent",
                  borderRadius: 6,
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.4 : 1,
                  textAlign: "left",
                  width: mobile ? "auto" : "100%",
                  transition: "all 0.15s",
                  fontFamily: css.sans,
                  position: "relative" as const,
                }}
              >
                {/* Verbindingslijn (alleen desktop) */}
                {!mobile && i < ROADMAP_STEPS.length - 1 && (
                  <div style={{
                    position: "absolute",
                    left: 15,
                    top: 28,
                    width: 2,
                    height: 6,
                    background: getStepStatus(ROADMAP_STEPS[i + 1].id) === "locked" ? css.border : color,
                    opacity: 0.4,
                  }} />
                )}

                {/* Status indicator */}
                <div style={{
                  width: mobile ? 16 : 18,
                  height: mobile ? 16 : 18,
                  borderRadius: "50%",
                  border: `2px solid ${color}`,
                  background: status === "complete" ? color : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: mobile ? 8 : 9,
                  fontWeight: 700,
                  color: status === "complete" ? "#fff" : color,
                  flexShrink: 0,
                  fontFamily: css.mono,
                }}>
                  {stepStatusIcon(status)}
                </div>

                {/* Label + beschrijving (desktop only voor beschrijving) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: mobile ? 9 : 11,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? css.accent : isLocked ? css.faint : css.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    letterSpacing: -0.2,
                  }}>
                    {mobile ? step.icon : step.label}
                  </div>
                  {!mobile && (
                    <div style={{ fontSize: 9, color: css.dim, marginTop: 0, lineHeight: 1.2 }}>
                      {step.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: css.bg, color: css.text, fontFamily: css.sans, paddingBottom: mobile ? 72 : 0 }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{ padding: mobile ? "8px 12px" : "8px 16px", background: "rgba(15,23,42,0.97)", borderBottom: `1px solid ${css.border}`, position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: mobile?26:28, height: mobile?26:28, borderRadius: 8, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: mobile?14:18, fontWeight: 800, color: "#fff", flexShrink: 0 }}>P</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: mobile?13:14, fontWeight: 700, letterSpacing: -0.5 }}>PLE Calculator</div>
                {!mobile && <div style={{ fontSize: 11, color: css.dim }}>Pipeline Engineering — NEN 3650-2  •  v0.2.3  •  v0.2.0</div>}
              </div>
              {/* Bestandsnaam indicator + download knop */}
              {importFileName && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.2)`, borderRadius: 6, maxWidth: mobile ? 120 : 220 }}>
                    <span style={{ fontSize: 10, color: css.accent, fontFamily: css.mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      📁 {importFileName}
                    </span>
                    <button onClick={clearImportData} style={{ background: "none", border: "none", color: css.dim, cursor: "pointer", fontSize: 12, padding: "0 2px", flexShrink: 0 }} title="Import wissen">×</button>
                  </div>
                  {/* Opslaan als Excel knop */}
                  <button onClick={async () => {
                    try {
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const rawSheets = pleModel ? modelToRawSheets(pleModel) : (importedMeta?._rawSheets || {});
                      
                      // PLE4Win sheet volgorde + tab kleuren (uit screenshot)
                      const sheetDefs: [string, string][] = [
                        // [sheetName, tabColor hex]
                        // Blauw = geometrie/configuratie
                        ["ORIGIN",   "4472C4"],
                        ["POLYDIF",  "4472C4"],
                        // Groen = T-stukken/verbindingen
                        ["CONNECT",  "548235"],
                        ["TEECONF",  "548235"],
                        // Paars = steunpunten
                        ["SUPPORT",  "7030A0"],
                        // Cyaan = grondniveaus
                        ["G-LEVEL",  "00B0F0"],
                        ["W-LEVEL",  "00B0F0"],
                        // Geel = extra punten
                        ["ADIDENT",  "FFC000"],
                        ["GROUPS",   "FFC000"],
                        // Groen = materiaal
                        ["MATL",     "00B050"],
                        ["ISTROP",   "00B050"],
                        // Blauw = buisgegevens
                        ["DIAM",     "4472C4"],
                        ["WALL",     "4472C4"],
                        // Groen = T-stuk specs
                        ["TEESPEC",  "548235"],
                        // Rood = belastingen
                        ["DEADW",    "FF0000"],
                        // Oranje = coating
                        ["COATING",  "ED7D31"],
                        // Rood = randvoorwaarden
                        ["ENDPTS",   "FF0000"],
                        ["ELSPRS",   "FF0000"],
                        // Paars = druk/temp
                        ["PRESS",    "7030A0"],
                        ["TEMP",     "7030A0"],
                        // Lichtblauw = bodemdaling
                        ["SUBSIDE",  "00B0F0"],
                        // Groen = lastgevallen
                        ["LOCASE",   "548235"],
                        // Grijs = configuratie
                        ["SOILCTL",  "A5A5A5"],
                        ["GEOMCTL",  "A5A5A5"],
                        // Oranje = steunhoeken
                        ["SUPANG",   "ED7D31"],
                        // Blauw = secties
                        ["SECTION",  "4472C4"],
                        // Bruin = grondparameters (Soil Wizard output, PLE4Win DF3.2 formaat)
                        ["KLH",      "8B4513"],
                        ["KLS",      "8B4513"],
                        ["KLT",      "8B4513"],
                        ["RVS",      "8B4513"],
                        ["RVT",      "8B4513"],
                        ["RH",       "8B4513"],
                        ["F",        "8B4513"],
                        ["UF",       "8B4513"],
                        ["SOILNB",   "8B4513"],
                        ["GENSOIL",  "8B4513"],
                      ];
                      
                      for (const [name, color] of sheetDefs) {
                        const raw = rawSheets[name];
                        if (!raw || raw.length === 0) continue;
                        const ws = XLSX.utils.aoa_to_sheet(raw);
                        // Tab kleur instellen
                        if (!ws["!tabcolor"]) (ws as any)["!tabcolor"] = {};
                        (ws as any)["!tabcolor"] = { rgb: color };
                        // Kolombreedte automatisch aanpassen
                        const maxCols = Math.max(...raw.map((r: any[]) => (r || []).length));
                        ws["!cols"] = Array.from({ length: maxCols }, (_, i) => {
                          const maxW = Math.max(...raw.map((r: any[]) => {
                            const v = (r || [])[i];
                            return v != null ? String(v).length : 0;
                          }));
                          return { wch: Math.max(maxW + 2, 8) };
                        });
                        XLSX.utils.book_append_sheet(wb, ws, name);
                      }
                      
                      const baseName = importFileName.replace(/\.xlsx$/i, "");
                      XLSX.writeFile(wb, `${baseName}_edit.xlsx`);
                    } catch (err) {
                      console.error("Excel opslaan mislukt:", err);
                      alert("Excel opslaan mislukt: " + (err as Error).message);
                    }
                  }} style={{
                    padding: "3px 8px", background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.2)", borderRadius: 6,
                    color: "#22c55e", fontSize: 10, fontFamily: css.mono,
                    cursor: "pointer", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 3,
                  }} title="Opslaan als PLE4Win Excel">
                    💾 Opslaan
                  </button>
                </div>
              )}
              {isAdmin && (
                <button onClick={() => console.log("navigate")} style={{ display: "flex", alignItems: "center", gap: 8, padding: mobile?"4px 8px":"6px 12px", background: "rgba(59,130,246,0.1)", border: `1px solid ${css.border}`, borderRadius: 8, cursor: "pointer" }}>
                  <div style={{ width: mobile?22:26, height: mobile?22:26, borderRadius: 6, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: mobile?10:12, fontWeight: 800, color: "#fff" }}>DH</div>
                  {!mobile && <span style={{ fontSize: 12, fontWeight: 700, color: css.text }}>DHStress</span>}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Voortgangsindicator in header */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "rgba(30,41,59,0.5)", borderRadius: 6 }}>
              <span style={{ fontSize: 10, color: css.dim, fontFamily: css.mono }}>{completedSteps}/{totalSteps}</span>
              <div style={{ width: 40, height: 3, background: css.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: progressPct === 100 ? css.green : css.accent, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: mobile?"4px 10px":"6px 14px", background: n.ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)", border: `1px solid ${n.ok?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)"}`, borderRadius: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: n.ok?css.green:css.red }} />
              <span style={{ fontSize: mobile?11:12, fontWeight: 600, color: n.ok?css.green:css.red, fontFamily: css.mono }}>UC={n.cu.toFixed(3)}</span>
            </div>
          </div>
        </div>
        {/* Desktop tabs */}
        {!mobile && (
          <div style={{ display: "flex", gap: 1, marginTop: 6 }}>
            {tabs.map(tb => (
              <button key={tb.id} onClick={() => {
                if (tb.id === "dhstress") { console.log("navigate"); return; }
                setTab(tb.id);
              }} style={{ padding: "5px 10px", border: "none", borderRadius: "5px 5px 0 0", background: tab===tb.id?css.border:"transparent", color: tab===tb.id?css.text:css.dim, fontSize: 11, fontWeight: tab===tb.id?600:400, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontFamily: css.sans }}>
                <span style={{ fontSize: 11 }}>{tb.icon}</span>{tb.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MAIN LAYOUT: Roadmap sidebar + content */}
      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row" }}>
        {/* Roadmap sidebar (desktop: links, mobile: boven) */}
        {roadmapSidebar}

        {/* CONTENT */}
        <div style={{ flex: 1, padding: mobile?10:16, maxWidth: 1200, minWidth: 0 }}>
          {tabContent[tab]}
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      {mobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: "rgba(15,23,42,0.98)", borderTop: `1px solid ${css.border}`, display: "flex", backdropFilter: "blur(12px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => {
              if (tb.id === "dhstress") { console.log("navigate"); return; }
              setTab(tb.id);
            }} style={{ flex: 1, border: "none", background: "transparent", padding: "8px 0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", color: tab===tb.id?css.accent:css.dim, transition: "color 0.15s" }}>
              <span style={{ fontSize: 18 }}>{tb.icon}</span>
              <span style={{ fontSize: 9, fontWeight: tab===tb.id?600:400, fontFamily: css.sans }}>{tb.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <PLECalculator />;
}
