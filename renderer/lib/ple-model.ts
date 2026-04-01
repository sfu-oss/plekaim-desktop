// src/lib/ple-model.ts
// PLE Model — In-memory database voor pipeline stress analyse
// ============================================================
// Centrale datastructuur die alle PLE4Win invoerdata bevat.
// Dit is de "single source of truth" — de Editor wijzigt dit object direct,
// de FEM solver leest ervan, en rawSheets worden er *van* afgeleid.
//
// Architectuur:
//   Excel → parsePLEtoModel() → PleModel
//   Editor → mutatiefuncties → PleModel (gewijzigd)
//   PleModel → buildFemInput() → FemSolverInput
//   PleModel → modelToRawSheets() → rawSheets (voor Excel export)
//
// Dit repliceert hoe PLE4Win intern werkt: tabellen zijn views op een
// in-memory database, niet de database zelf.

import type { FemNode, FemElement, MatProps, LoadCase, BoundaryCondition, FemSolverInput } from "./ple-fem";

// ============================================================
// Data types — één per PLE4Win sheet
// ============================================================

export interface PleNode {
  id: string;
  x: number;          // mm (RD, origin afgetrokken)
  y: number;
  z: number;
  dxN?: number | null;
  dyN?: number | null;
  dzN?: number | null;
  bendEl?: number | null;
  pipeEl?: number | null;
  ext?: number | null;
  nKink?: number | null;
  lSegm?: number | null;
  bendR: number | null;
  etyp: string;       // "BEND" | "" | etc
  D0: number | null;   // buitendiameter (uit POLYDIF)
  DPE: number | null;  // manteldiameter
  mediumWeight?: number;
  _isAdident?: boolean;
}

export interface PleDiam {
  ident?: string;
  dout1: number;
  dout2: number | null;
  ioval1?: number | null;
  ioval2?: number | null;
}

export interface PleWall {
  ident?: string;
  tnom1: number;
  tnom2: number | null;
  corAl1?: number | null;
  rtol1?: number | null;
  atol1?: number | null;
  corAl2?: number | null;
  rtol2?: number | null;
  atol2?: number | null;
}

export interface PleMatl {
  ident?: string;
  matRef: string;
  fabmet: string;
  matfact: number;
}

export interface PleIstrop {
  matRef: string;
  E: number;
  nu: number;
  alpha: number;
  Re: number;       // SMYS
  ReT: number;
  weight: number;   // N/mm³
  matCat?: string;
}

export interface PleEndpt {
  ident: string;
  cond: string;     // "fixed" | "free" | "spring" | "guided" | "infin"
  state: string;    // "open" | "closed"
}

export interface PleSupport {
  refIdent: string;
  deltaAxL: number;
  cosys: string;
  supRef: string;
  supLeng: number;
  supAngle: number;
  added?: string;
  distance?: number | null;
  _resolvedNodeId?: string;
  _resolvedNodeIdx?: number;
}

export interface PleSpring {
  sprRef: string;
  kx: number;
  ky: number;
  kz: number;
  kphi: number;
  kpsi: number;
  keta: number;
}

export interface PleConnect {
  ident1: string;
  ident2: string;
  conname: string;
  teeRef: string;
}

export interface PleTeeSpec {
  teeRef: string;
  type: string;     // "WELD" | "REIN" | "UNRE" | "EXTR" | "W-IN" | "W-ON"
  matRef: string;
  matBrn: string;
  dRun: number;
  tRun: number;
  dBrn: number;
  tBrn: number;
  te: number;
  r0: number;
}

export interface PleTeeConf {
  teeRef: string;
  lRun: number;
  lBrn: number;
  cycles: number;
}

export interface PleCoating {
  startIdent: string;
  endIdent: string;
  name: string;
  type: string;     // "External" | "Medium" | "Internal"
  thick: number;    // mm
  weight: number;   // N/mm³
}

export interface PleGLevel {
  ident: string;
  ground1: number;
  uncv1: number;
  ground2: number | null;
  uncv2: number | null;
}

export interface PleWLevel {
  ident: string;
  water1: number;
  uncv1: number;
  water2: number | null;
  uncv2: number | null;
  weight: number;   // N/mm³
}

export interface PleTopload {
  tglDbl?: number | null;
  tglInt?: number | null;
  tglTxt?: string;
  topload1: number;
  loadf1: number;
  topload2: number | null;
  loadf2: number | null;
}

export interface PleSoilsup {
  tglDbl?: number | null;
  tglInt?: number | null;
  tglTxt?: string;
  hor1: number;
  uncf1: number;
  loadf1: number;
  hor2: number | null;
  uncf2: number | null;
  loadf2: number | null;
}

export interface PlePress {
  ident: string;
  press1: number;   // N/mm²
  press2: number | null;
}

export interface PleTemp {
  ident: string;
  tabs1: number;    // °C
  tref1: number;    // °C
  tabs2: number | null;
  tref2: number | null;
}

export interface PleLoadCase {
  lc: string;
  gloadF: number;
  pressF: number;
  tDifF: number;
  deadwF: number;
  setlF: number;
  nodalF: number;
  elbndF: number;
  wavcF: number;
}

export interface PleSubside {
  ident: string;
  subzMax: number;
  uncF: number;
  length: number;
  shape: string;    // "Double" | "Right" | "Left"
}

export interface PleAdident {
  refIdent: string;
  deltaAxL: number;
  newIdent: string;
}

export interface PleSupang {
  ident: string;
  angMin: number;
  angMax: number;
  rvsl: number;
  rvsh: number;
  curve: string;
}

export interface PleSection {
  ident: string;
  sectRef: string;
}

export interface PleOrigin {
  x: number;
  y: number;
  z: number;
}

export interface PleGeomctl {
  maxGeoIterations: number;
  geoConvergenceTol: number;
  maxRotation: number;
}

export interface PleSoilctl {
  maxSoilIterations: number;
}

export interface PleWeld {
  lngtWeld: number;   // lasnaadlengte (mm) — LNGT-WELD
  lwFac:    number;   // lasnaad factor longitudinaal — LW-FAC (default 1.0)
  circWeld: number;   // omtreklas (mm) — CIRC-WELD
  cwFac:    number;   // lasnaad factor omtreklas — CW-FAC (default 1.0)
}

// ============================================================
// Het centrale PleModel
// ============================================================

// ── Soil Wizard types (voor opslag in PleModel) ──

export interface SoilWizardLayer {
  soilTypeId: string;
  thickness: number;  // mm
}

export interface SoilWizardProfile {
  id: string;
  name: string;
  layers: SoilWizardLayer[];
}

export interface SoilWizardLocation {
  nodeId: string;
  nodeIndex: number;
  profileId: string;
  profileIdAfter?: string;
  isStepChange?: boolean;
  stepReason?: string;
  isInterpolated?: boolean;
}

export interface SoilWizardSettings {
  gammaWater: number;
  installMethod: "trench_uncompressed" | "trench_compressed" | "boring" | "hdd";
  nenVersion: "2020" | "1992";
  useRealTopsoil: boolean;
}

export interface SoilWizardResult {
  nodeId: string;
  nodeIndex: number;
  KLH: number;    // kN/m²
  KLS: number;    // kN/m²
  KLT: number;    // kN/m²
  RVS: number;    // kN/m
  RVT: number;    // kN/m
  RH: number;     // kN/m
  F: number;      // kN/m²
  UF: number;     // mm
  sigmaK: number; // kN/m²
  H_cover: number; // mm
}

// ============================================================

export interface PleModel {
  // Structurele data (bewerkbaar via Editor)
  nodes: PleNode[];
  diameters: PleDiam[];
  walls: PleWall[];
  materials: PleMatl[];
  materialProps: PleIstrop[];
  endpts: PleEndpt[];
  supports: PleSupport[];
  springs: PleSpring[];
  connects: PleConnect[];
  teeSpecs: PleTeeSpec[];
  teeConfs: PleTeeConf[];
  coatings: PleCoating[];
  gLevels: PleGLevel[];
  wLevels: PleWLevel[];
  topLoads: PleTopload[];
  soilSupports: PleSoilsup[];
  press: PlePress[];
  temp: PleTemp[];
  loadCases: PleLoadCase[];
  subside: PleSubside[];
  adidents: PleAdident[];
  supangs: PleSupang[];
  sections: PleSection[];
  welds: PleWeld[];

  // Configuratie
  origin: PleOrigin;
  geomctl: PleGeomctl;
  soilctl: PleSoilctl;

  // Soil Wizard data (optioneel — als gebruiker de wizard heeft gedraaid)
  soilWizardProfiles?: SoilWizardProfile[];
  soilWizardLocations?: SoilWizardLocation[];
  soilWizardSettings?: SoilWizardSettings;
  soilWizardResults?: SoilWizardResult[];

  // Afgeleid (wordt geregenereerd door rebuildTopology)
  _elements: FemElement[];
  _endpointSet: Set<string>;
  _teeWeldMap: Map<string, string>;

  // Meta-info (van parse, niet bewerkbaar)
  _globalD: number;
  _globalT: number;
  _globalPi: number;    // N/mm²
  _globalPiRaw: number; // N/mm² (ongeschaald)
  _globalTop: number;   // °C
  _globalTopRaw: number;
  _globalTinst: number; // °C
  _globalMat: string;   // materiaal naam
  _globalCover: number; // mm
  _globalWater: number; // mm
  _matProps: MatProps | null;

  // Bewaar originele units rij voor S1 node reconstructie
  _polydifUnitsRow: any[] | null;
  _polydifHeader: string[] | null;
}

// ============================================================
// Helper functies
// ============================================================

const toNum = (v: any): number => {
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

const normalizeId = (id: any): string => (id || "").toString().trim();

const getNum = (obj: Record<string, any>, keys: string[]): number | null => {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v !== null && v !== undefined && v !== "") return toNum(v);
    }
  }
  return null;
};

function sheetToObjects(rows: any[][]): Record<string, any>[] {
  if (!rows?.length) return [];
  const h = (rows[0] || []).map((x: any) => (x || "").toString().trim());
  const out: Record<string, any>[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const obj: Record<string, any> = {};
    let hasData = false;
    const seen = new Set<string>(); // voorkom dat dubbele kolomnamen eerder gezette waarden overschrijven
    h.forEach((k: string, j: number) => {
      if (k && k !== " ") {
        // Eerste kolom met deze naam wint — duplicaten worden geskipt
        // Dit voorkomt dat de tweede "IDENT" kolom in POLYDIF de eerste overschrijft
        if (!seen.has(k)) {
          obj[k] = row[j];
          seen.add(k);
        }
        if (row[j] != null && row[j] !== "") hasData = true;
      }
    });
    if (hasData) out.push(obj);
  }
  return out;
}

// ============================================================
// parseSheetsToModel — Bouwt PleModel uit ruwe sheet data
// ============================================================
// Dit vervangt zowel parsePLEFile (voor import) als rebuildModelFromRawSheets (voor herberekenen).
// Het kan aangeroepen worden met sheets die direct uit Excel komen,
// OF met sheets die door de Editor zijn gewijzigd.

export function parseSheetsToModel(sheets: Record<string, any[][]>): PleModel {
  const polydifObjs = sheetToObjects(sheets.POLYDIF || []);

  // S1 startnode uit units-rij
  // PLE4Win: S1 data staat in de units-rij (index 1) van POLYDIF
  // Kolom 17 = IDENT, 18 = X-N, 19 = Y-N, 20 = Z-N (standaard)
  // Sommige modellen hebben een kolom-offset → probeer ook kolom 18 als IDENT
  const polydifRaw = sheets.POLYDIF || [];
  const polydifHeader = (polydifRaw[0] || []).map((x: any) => (x || "").toString().trim());
  const unitsRow = (polydifRaw[1] as any[]) || null;
  if (unitsRow) {
    // Zoek de S1 ident: probeer kolom 17, 18 (voor offset-varianten)
    let s1Col = -1;
    for (const tryCol of [17, 18, 16]) {
      const val = unitsRow[tryCol];
      if (val && typeof val === "string" && val.trim().length > 0 && val.trim() !== " ") {
        // Check of de volgende 2 kolommen numeriek zijn (X-N, Y-N)
        const xCol = tryCol + 1;
        const yCol = tryCol + 2;
        if (typeof unitsRow[xCol] === "number" && typeof unitsRow[yCol] === "number") {
          s1Col = tryCol;
          break;
        }
      }
    }
    if (s1Col >= 0) {
      polydifObjs.unshift({
        IDENT: normalizeId(unitsRow[s1Col]),
        "X-N": unitsRow[s1Col + 1],
        "Y-N": unitsRow[s1Col + 2],
        "Z-N": unitsRow[s1Col + 3] ?? 0,
        BENDRAD: null,
        ETYP: "",
        D0: unitsRow[s1Col + 6] ?? null,
        DPE: unitsRow[s1Col + 7] ?? null,
      });
    }
  }

  // Origin
  const originObjs = sheetToObjects(sheets.ORIGIN || []);
  const originRow = originObjs[0] || {};
  const origin: PleOrigin = {
    x: toNum(originRow["X-S"]) || 0,
    y: toNum(originRow["Y-S"]) || 0,
    z: toNum(originRow["Z-S"]) || 0,
  };

  // Nodes
  const nodes: PleNode[] = [];
  polydifObjs.forEach((p, idx) => {
    const id = normalizeId(p.IDENT || p["IDENT"]) || `N${idx + 1}`;
    const xN = toNum(p["X-N"]);
    const yN = toNum(p["Y-N"]);
    const zN = toNum(p["Z-N"]) ?? 0;
    if (!Number.isFinite(xN) || !Number.isFinite(yN)) return;
    nodes.push({
      id,
      x: xN - origin.x,
      y: yN - origin.y,
      z: zN - origin.z,
      dxN: getNum(p, ["d(X-N)", "D(X-N)", "DX-N", "dX-N"]) ?? null,
      dyN: getNum(p, ["d(Y-N)", "D(Y-N)", "DY-N", "dY-N"]) ?? null,
      dzN: getNum(p, ["d(Z-N)", "D(Z-N)", "DZ-N", "dZ-N"]) ?? null,
      bendEl: getNum(p, ["BEND_EL", "BEND-EL", "BEND EL"]) ?? null,
      pipeEl: getNum(p, ["PIPE_EL", "PIPE-EL", "PIPE EL"]) ?? null,
      ext: getNum(p, ["EXT"]) ?? null,
      nKink: getNum(p, ["N-KINK", "N KINK", "NKINK"]) ?? null,
      lSegm: getNum(p, ["L-SEGM", "L SEGM", "LSEGM"]) ?? null,
      bendR: toNum(p.BENDRAD) || null,
      etyp: (p.ETYP || p.BEND_EL || p.PIPE_EL || "").toString(),
      D0: toNum(p.D0) || null,
      DPE: toNum(p.DPE) || null,
    });
  });

  // Diameters
  const diameters: PleDiam[] = sheetToObjects(sheets.DIAM || []).map(d => ({
    ident: normalizeId(d.Identifier || d.IDENT),
    dout1: toNum(d.DOUT1) || 0,
    dout2: toNum(d.DOUT2) || null,
    ioval1: toNum(d.IOVAL1) || null,
    ioval2: toNum(d.IOVAL2) || null,
  }));

  // Walls
  const walls: PleWall[] = sheetToObjects(sheets.WALL || []).map(w => ({
    ident: normalizeId(w.Identifier || w.IDENT),
    tnom1: toNum(w["T-NOM1"]) || 0,
    tnom2: toNum(w["T-NOM2"]) || null,
    corAl1: toNum(w["COR-AL1"]) || null,
    rtol1: toNum(w.RTOL1) || null,
    atol1: toNum(w.ATOL1) || null,
    corAl2: toNum(w["COR-AL2"]) || null,
    rtol2: toNum(w.RTOL2) || null,
    atol2: toNum(w.ATOL2) || null,
  }));

  // Materials
  const materials: PleMatl[] = sheetToObjects(sheets.MATL || []).map(m => ({
    ident: normalizeId(m.Identifier || m.IDENT),
    matRef: normalizeId(m.MATREF),
    fabmet: (m.FABMET || "none").toString().trim(),
    matfact: toNum(m.MATFACT) || 1,
  }));

  // ISTROP
  const materialProps: PleIstrop[] = sheetToObjects(sheets.ISTROP || []).map(m => ({
    matRef: normalizeId(m.MATREF),
    E: toNum(m.Emod) || 207000,
    nu: toNum(m.Nu) || 0.3,
    alpha: toNum(m.ALPHA) || 12e-6,
    Re: toNum(m.Re) || 235,
    ReT: toNum(m.ReT) || 0,
    weight: toNum(m.WEIGHT) || 0,
    matCat: normalizeId(m.MATCAT) || undefined,
  }));

  // ENDPTS
  const endpts: PleEndpt[] = sheetToObjects(sheets.ENDPTS || []).map(e => ({
    ident: normalizeId(e.IDENT),
    cond: (e.COND || "fixed").toString().trim(),
    state: (e.STATE || "open").toString().trim(),
  }));

  // CONNECT
  const connects: PleConnect[] = sheetToObjects(sheets.CONNECT || []).map(c => ({
    ident1: normalizeId(c.IDENT1),
    ident2: normalizeId(c.IDENT2),
    conname: normalizeId(c.CONNAME),
    teeRef: normalizeId(c["TEE-REF"]),
  }));

  // TEESPEC
  const teeSpecs: PleTeeSpec[] = sheetToObjects(sheets.TEESPEC || []).map(t => ({
    teeRef: normalizeId(t["TEE-REF"] || t.TEEREF),
    type: (t.TYPE || "WELD").toString().trim(),
    matRef: normalizeId(t.MATREF),
    matBrn: normalizeId(t.MATBRN),
    dRun: toNum(t["D-RUN"]) || 0,
    tRun: toNum(t["T-RUN"]) || 0,
    dBrn: toNum(t["D-BRN"]) || 0,
    tBrn: toNum(t["T-BRN"]) || 0,
    te: toNum(t.TE) || 0,
    r0: toNum(t.R0) || 0,
  }));

  // TEECONF
  const teeConfs: PleTeeConf[] = sheetToObjects(sheets.TEECONF || []).map(t => ({
    teeRef: normalizeId(t["TEE-REF"]),
    lRun: toNum(t["L-RUN"]) || 700,
    lBrn: toNum(t["L-BRN"]) || 363,
    cycles: toNum(t.CYCLES) || 2000,
  }));

  // SUPPORT
  const supports: PleSupport[] = sheetToObjects(sheets.SUPPORT || []).map(s => ({
    refIdent: normalizeId(s.REFIDENT),
    deltaAxL: toNum(s["∆AX-L"]) || 0,
    cosys: (s.COSYS || "LOCAL").toString().trim(),
    supRef: normalizeId(s.SUPREF),
    supLeng: toNum(s.SUPPLENG) || 0,
    supAngle: toNum(s.SUPANGLE) || 0,
    added: normalizeId(s.ADDED) || undefined,
    distance: toNum(s.DISTANCE) || null,
  }));

  // ELSPRS
  const springs: PleSpring[] = sheetToObjects(sheets.ELSPRS || []).map(s => ({
    sprRef: normalizeId(s.SPRREF),
    kx: toNum(s.XX) || 0,
    ky: toNum(s.YY) || 0,
    kz: toNum(s.ZZ) || 0,
    kphi: toNum(s["PHI-PHI"]) || 0,
    kpsi: toNum(s["PSI-PSI"]) || 0,
    keta: toNum(s["ETA-ETA"]) || 0,
  }));

  // COATING
  const coatings: PleCoating[] = sheetToObjects(sheets.COATING || []).map(c => ({
    startIdent: normalizeId(c["Start Identifier"]),
    endIdent: normalizeId(c["End Identifier"]),
    name: (c.NAME || "").toString().trim(),
    type: (c.TYPE || "").toString().trim(),
    thick: toNum(c.THICK) || 0,
    weight: toNum(c.WEIGHT) || 0,
  }));

  // G-LEVEL
  const gLevels: PleGLevel[] = sheetToObjects(sheets["G-LEVEL"] || []).map(g => ({
    ident: normalizeId(g.Identifier || g.IDENT),
    ground1: toNum(g.GROUND1) || 0,
    uncv1: toNum(g.UNCV1) || 0,
    ground2: toNum(g.GROUND2) || null,
    uncv2: toNum(g.UNCV2) || null,
  }));

  // W-LEVEL
  const wLevels: PleWLevel[] = sheetToObjects(sheets["W-LEVEL"] || []).map(w => ({
    ident: normalizeId(w.Identifier || w.IDENT),
    water1: toNum(w.WATER1) || 0,
    uncv1: toNum(w.UNCV1) || 0,
    water2: toNum(w.WATER2) || null,
    uncv2: toNum(w.UNCV2) || null,
    weight: toNum(w.WEIGHT) || 0,
  }));

  // TOPLOAD
  const topLoads: PleTopload[] = sheetToObjects(sheets.TOPLOAD || []).map(t => ({
    tglDbl: toNum(t.TGL_DBL) || null,
    tglInt: toNum(t.TGL_INT) || null,
    tglTxt: normalizeId(t.TGL_TXT) || undefined,
    topload1: toNum(t.TOPLOAD1) || 0,
    loadf1: toNum(t.LOADF1) || 1.35,
    topload2: toNum(t.TOPLOAD2) || null,
    loadf2: toNum(t.LOADF2) || null,
  }));

  // SOILSUP
  const soilSupports: PleSoilsup[] = sheetToObjects(sheets.SOILSUP || []).map(s => ({
    tglDbl: toNum(s.TGL_DBL) || null,
    tglInt: toNum(s.TGL_INT) || null,
    tglTxt: normalizeId(s.TGL_TXT) || undefined,
    hor1: toNum(s.HOR1) || 0,
    uncf1: toNum(s.UNCF1) || 1.0,
    loadf1: toNum(s.LOADF1) || 1.0,
    hor2: toNum(s.HOR2) || null,
    uncf2: toNum(s.UNCF2) || null,
    loadf2: toNum(s.LOADF2) || null,
  }));

  // PRESS
  const press: PlePress[] = sheetToObjects(sheets.PRESS || []).map(p => ({
    ident: normalizeId(p.Identifier || p.IDENT),
    press1: toNum(p.PRESS1) || 0,
    press2: toNum(p.PRESS2) || null,
  }));

  // TEMP
  const temp: PleTemp[] = sheetToObjects(sheets.TEMP || []).map(t => ({
    ident: normalizeId(t.Identifier || t.IDENT),
    tabs1: toNum(t["T-ABS1"]) || 0,
    tref1: toNum(t["T-REF1"]) || 10,
    tabs2: toNum(t["T-ABS2"]) || null,
    tref2: toNum(t["T-REF2"]) || null,
  }));

  // LOCASE — NEN 3650-1:2020 standaard lastfactoren als fallback voor lege cellen
  // Conform PLE4Win CheckLoadcaseNen: als een factor leeg/nul is maar het lastgeval
  // heeft druk of temperatuur, dan worden de NEN 3650 standaardwaarden gebruikt.
  let loadCases: PleLoadCase[] = sheetToObjects(sheets.LOCASE || []).map(l => {
    const lcId = (l.LC || "").toString().trim();
    const pressF = toNum(l["PRESS-F"]) ?? 0;
    const tDifF  = toNum(l["T-DIF-F"]) ?? 0;
    const isEigengewicht = pressF === 0 && tDifF === 0;
    const lcName = (lcId === "-" || lcId === "" || lcId === "–")
      ? (isEigengewicht ? "Eigengewicht" : "Bedrijf")
      : lcId;

    // NEN 3650 defaults voor ontbrekende factoren (alleen bij bedrijfslastgevallen)
    const nen = !isEigengewicht;
    const rawDeadwF = toNum(l["DEADW-F"]);
    const rawSetlF  = toNum(l["SETL-F"]);
    const rawGloadF = toNum(l.GLOADF);

    return {
      lc: lcName,
      gloadF:  !isNaN(rawGloadF) ? rawGloadF : 1.0,
      pressF,
      tDifF,
      deadwF:  !isNaN(rawDeadwF) && rawDeadwF !== 0 ? rawDeadwF : (nen ? 1.1  : 0),
      setlF:   !isNaN(rawSetlF)  && rawSetlF  !== 0 ? rawSetlF  : (nen ? 1.1  : 0),
      nodalF:  toNum(l["NODAL-F"]) ?? 0,
      elbndF:  toNum(l["ELBND-F"]) ?? 0,
      wavcF:   toNum(l["WAVC-F"])  ?? 0,
    };
  });
  if (loadCases.length === 0) {
    loadCases.push({ lc: "Bedrijf", gloadF: 1, pressF: 1, tDifF: 1, deadwF: 1, setlF: 1, nodalF: 0, elbndF: 0, wavcF: 0 });
  }
  const hasFullLC = loadCases.some(lc => lc.pressF > 0 || lc.tDifF > 0);
  if (!hasFullLC) {
    loadCases.push({ lc: "Bedrijf", gloadF: 1, pressF: 1, tDifF: 1, deadwF: 1, setlF: 1, nodalF: 0, elbndF: 0, wavcF: 0 });
  }

  // SUBSIDE
  const subside: PleSubside[] = sheetToObjects(sheets.SUBSIDE || []).map(s => ({
    ident: normalizeId(s.Identifier),
    subzMax: toNum(s.SUBZMAX) || 0,
    uncF: toNum(s.UNCF) || 1.0,
    length: toNum(s.LENGTH) || 3000,
    shape: (s.SINESHAPE || "Double").toString().trim(),
  }));

  // ADIDENT
  const adidents: PleAdident[] = sheetToObjects(sheets.ADIDENT || []).map(a => ({
    refIdent: normalizeId(a.REFIDENT),
    deltaAxL: toNum(a["∆AX-L"]) || 0,
    newIdent: normalizeId(a.NEWIDENT),
  }));

  // SUPANG
  const supangs: PleSupang[] = sheetToObjects(sheets.SUPANG || []).map(s => ({
    ident: normalizeId(s.Identifier),
    angMin: toNum(s.ANGMIN) || 122,
    angMax: toNum(s.ANGMAX) || 180,
    rvsl: toNum(s.RVSL) || 50,
    rvsh: toNum(s.RVSH) || 100,
    curve: (s.CURVE || "Sinus").toString().trim(),
  }));

  // SECTION
  const sections: PleSection[] = sheetToObjects(sheets.SECTION || []).map(s => ({
    ident: normalizeId(s.Identifier || s.IDENT),
    sectRef: normalizeId(s.SECTREF),
  }));

  // WELD — lasnaadcorrectie factor (PLE4Win WELD tabel, AddWeld uit Function6.dll)
  // LW-FAC < 1.0 verlaagt toelaatbare spanning bij längsnaden (bv. spiraalgelaste buis)
  const welds: PleWeld[] = sheetToObjects(sheets.WELD || []).map(w => ({
    lngtWeld: toNum(w['LNGT-WELD']) || 0,
    lwFac:    toNum(w['LW-FAC'])    ?? 1.0,
    circWeld: toNum(w['CIRC-WELD']) || 0,
    cwFac:    toNum(w['CW-FAC'])    ?? 1.0,
  }));

  // GEOMCTL
  let geomctl: PleGeomctl = { maxGeoIterations: 10, geoConvergenceTol: 0.001, maxRotation: 0.3 };
  try {
    const gc = sheetToObjects(sheets.GEOMCTL || []);
    if (gc.length > 0) {
      geomctl = {
        maxGeoIterations: toNum(gc[0].MAXGIT) || 10,
        geoConvergenceTol: toNum(gc[0].RELDISEQ) || 0.001,
        maxRotation: toNum(gc[0].ROTINCR) || 0.3,
      };
    }
  } catch { /* niet beschikbaar */ }

  // SOILCTL
  let soilctl: PleSoilctl = { maxSoilIterations: 20 };
  try {
    const sc = sheetToObjects(sheets.SOILCTL || []);
    if (sc.length > 0) {
      soilctl = { maxSoilIterations: toNum(sc[0].MAXSIT) || 20 };
    }
  } catch { /* niet beschikbaar */ }

  // ── ADIDENT insertie ──
  if (adidents.length > 0) {
    const insertions: { refIdx: number; delta: number; newId: string }[] = [];
    adidents.forEach(ad => {
      const refIdx = nodes.findIndex(n => n.id === ad.refIdent);
      if (refIdx < 0) return;
      insertions.push({ refIdx, delta: ad.deltaAxL, newId: ad.newIdent });
    });
    insertions.sort((a, b) => a.refIdx - b.refIdx || a.delta - b.delta);

    const grouped = new Map<number, typeof insertions>();
    insertions.forEach(ins => {
      if (!grouped.has(ins.refIdx)) grouped.set(ins.refIdx, []);
      grouped.get(ins.refIdx)!.push(ins);
    });

    const sortedRefIdxs = [...grouped.keys()].sort((a, b) => b - a);
    for (const refIdx of sortedRefIdxs) {
      const group = grouped.get(refIdx)!;
      const refNode = nodes[refIdx];

      for (const ins of group.reverse()) {
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

        const absDelta = Math.abs(ins.delta);
        const frac = Math.min(absDelta / segLen, 0.99);
        const t_frac = ins.delta < 0 ? (1 - frac) : frac;

        const newNode: PleNode = {
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

        const insertAt = ins.delta < 0 ? refIdx : refIdx + 1;
        nodes.splice(insertAt, 0, newNode);
      }
    }
  }

  // ── Coating: DPE per node ──
  if (coatings.length > 0) {
    const nodeIdList = nodes.map(n => n.id);
    nodes.forEach((node, ni) => {
      let totalCoatingThick = 0;
      let hasCoating = false;
      coatings.forEach(cs => {
        if (cs.type !== "External") return;
        const startIdx = nodeIdList.indexOf(cs.startIdent);
        const endIdx = nodeIdList.indexOf(cs.endIdent);
        if (startIdx < 0 || endIdx < 0) return;
        if (ni >= Math.min(startIdx, endIdx) && ni <= Math.max(startIdx, endIdx)) {
          totalCoatingThick += cs.thick;
          hasCoating = true;
        }
      });
      if (hasCoating) {
        const D_pipe = node.D0 || 139.7;
        node.DPE = D_pipe + 2 * totalCoatingThick;
      }

      // Medium coating weight
      coatings.forEach(cs => {
        if (cs.type !== "Medium") return;
        const startIdx = nodeIdList.indexOf(cs.startIdent);
        const endIdx = nodeIdList.indexOf(cs.endIdent);
        if (startIdx < 0 || endIdx < 0) return;
        if (ni >= Math.min(startIdx, endIdx) && ni <= Math.max(startIdx, endIdx)) {
          node.mediumWeight = cs.weight;
        }
      });
    });
  }

  // ── Globale meta berekenen ──
  const pressRow = press[0];
  const tempRow = temp[0];
  const matlRow = materials[0];
  const diamRow = diameters[0];
  const wallRow = walls[0];
  const gLevelRow = gLevels[0];
  const wLevelRow = wLevels[0];

  const globalD = diamRow?.dout1 || 139.7;
  const globalT = wallRow?.tnom1 || 3.6;
  const globalPiRaw = pressRow?.press1 || 0;
  const globalTopRaw = tempRow?.tabs1 || 100;
  const globalTinst = tempRow?.tref1 || 10;
  const globalMat = matlRow?.matRef || "";
  const globalCover = gLevelRow?.ground1 || 500;
  const globalWater = wLevelRow?.water1 || 0;

  // LOCASE factoren toepassen op globale waarden
  let globalPi = globalPiRaw;
  let globalTop = globalTopRaw;
  if (loadCases.length > 0) {
    const lc0 = loadCases[0];
    globalPi = globalPiRaw * (lc0.pressF ?? 1);
    globalTop = globalTinst + (globalTopRaw - globalTinst) * (lc0.tDifF ?? 1);
  }

  // MatProps uit ISTROP
  let matProps: MatProps | null = null;
  if (materialProps.length > 0 && globalMat) {
    const istrop = materialProps.find(m => m.matRef === globalMat) || materialProps[0];
    matProps = {
      E: istrop.E,
      poisson: istrop.nu,
      alpha: istrop.alpha,
      SMYS: istrop.Re,
      density: istrop.weight ? Math.round(istrop.weight * 1e9 / 9.81) : 7850,
      type: "steel",
      name: istrop.matRef,
    };
  }

  // ── SUPPORT met ΔAX-L resolutie ──
  supports.forEach(sup => {
    if (sup.deltaAxL && Math.abs(sup.deltaAxL) > 1) {
      const nearestAdident = nodes.findIndex(n => {
        if (!n._isAdident) return false;
        const refIdx = nodes.findIndex(rn => rn.id === sup.refIdent);
        if (refIdx < 0) return false;
        const ref = nodes[refIdx];
        const dx = n.x - ref.x;
        const dy = n.y - ref.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.abs(dist - Math.abs(sup.deltaAxL)) < 100;
      });
      if (nearestAdident >= 0) {
        sup._resolvedNodeId = nodes[nearestAdident].id;
        sup._resolvedNodeIdx = nearestAdident;
      }
    }
  });

  // Bouw het model
  const model: PleModel = {
    nodes, diameters, walls, materials, materialProps,
    endpts, supports, springs, connects, teeSpecs, teeConfs,
    coatings, gLevels, wLevels, topLoads, soilSupports, press, temp, loadCases,
    subside, adidents, supangs, sections, welds,
    origin, geomctl, soilctl,
    _elements: [],
    _endpointSet: new Set(endpts.map(e => e.ident)),
    _teeWeldMap: new Map(connects.map(c => [c.ident2, c.ident1])),
    _globalD: globalD,
    _globalT: globalT,
    _globalPi: globalPi,
    _globalPiRaw: globalPiRaw,
    _globalTop: globalTop,
    _globalTopRaw: globalTopRaw,
    _globalTinst: globalTinst,
    _globalMat: globalMat,
    _globalCover: globalCover,
    _globalWater: globalWater,
    _matProps: matProps,
    _polydifUnitsRow: unitsRow,
    _polydifHeader: polydifHeader.length > 0 ? polydifHeader : null,
  };

  // Importeer GENSOIL resultaten als die bestaan
  const gensoilRows = sheetToObjects(sheets["GENSOIL"] || []);
  if (gensoilRows.length > 0) {
    model.soilWizardResults = gensoilRows.map((r, i) => ({
      nodeId: normalizeId(r.IDENT),
      nodeIndex: i,
      KLH: toNum(r.KLH) || 0,
      KLS: toNum(r.KLS) || 0,
      KLT: toNum(r.KLT) || 0,
      RVS: toNum(r.RVS) || 0,
      RVT: toNum(r.RVT) || 0,
      RH: toNum(r.RH) || 0,
      F: toNum(r.F) || 0,
      UF: toNum(r.UF) || 0,
      sigmaK: toNum(r.SIGMAK) || 0,
      H_cover: toNum(r.H_COVER) || 0,
    }));
  }

  // Bouw element topologie
  rebuildTopology(model);

  return model;
}

// ============================================================
// rebuildTopology — Herbouw _elements uit nodes + connects
// ============================================================
// Wordt aangeroepen na elke structurele wijziging (node add/remove, connect wijziging)

export function rebuildTopology(model: PleModel): void {
  const { nodes, diameters, walls, connects, teeSpecs } = model;
  const diamMap = new Map(diameters.map(d => [d.ident, d]));
  const wallMap = new Map(walls.map(w => [w.ident, w]));
  const teeSpecMap = new Map(teeSpecs.map(t => [t.teeRef, t]));

  model._endpointSet = new Set(model.endpts.map(e => e.ident));
  model._teeWeldMap = new Map(connects.map(c => [c.ident2, c.ident1]));

  const elements: FemElement[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const n1 = nodes[i];
    const n2 = nodes[i + 1];
    const n1IsEndpoint = model._endpointSet.has(n1.id) && i > 0;
    const n2IsBranchStart = model._teeWeldMap.has(n2.id);
    if (n1IsEndpoint && n2IsBranchStart) continue;

    const dRow = diamMap.get(n1.id) || diamMap.get(n2.id);
    const wRow = wallMap.get(n1.id) || wallMap.get(n2.id);
    const d = dRow?.dout1 || dRow?.dout2 || n1.D0 || 139.7;
    const t = wRow?.tnom1 || wRow?.tnom2 || 3.6;
    const isBend = !!(n1.bendR || n2.bendR || (n1.etyp || "").toLowerCase().includes("bend"));

    elements.push({
      n1: i,
      n2: i + 1,
      d,
      t,
      dc: d + 2 * (n1.DPE || 0),
      type: isBend ? "bend" : "straight",
      R: n1.bendR || n2.bendR || d * 3,
    });
  }

  // Mark T-stukken
  connects.forEach(c => {
    const nIdx1 = nodes.findIndex(n => n.id === c.ident1);
    const nIdx2 = nodes.findIndex(n => n.id === c.ident2);
    if (nIdx1 >= 0 && nIdx2 >= 0) {
      const elIdx = elements.findIndex(e =>
        (e.n1 === nIdx1 && e.n2 === nIdx2) || (e.n1 === nIdx2 && e.n2 === nIdx1)
      );
      if (elIdx >= 0) {
        elements[elIdx].type = "tee";
        const tspec = teeSpecMap.get(c.teeRef);
        if (tspec?.dRun) elements[elIdx].d = tspec.dRun;
        if (tspec?.tRun) elements[elIdx].t = tspec.tRun;
      }
    }
  });

  // Update coating DPE op elementen
  elements.forEach(el => {
    const n1 = nodes[el.n1];
    if (n1?.DPE) el.dc = n1.DPE;
  });

  model._elements = elements;
}

// ============================================================
// buildFemInput — PleModel → FemSolverInput
// ============================================================
// Dit vervangt de ~100 regels assemblage-code die 3x gedupliceerd is in page.tsx

export interface BuildFemOptions {
  soilType: { k_h: number; k_v_up: number; k_v_down: number; phi: number; gamma: number };
}

export function buildFemInput(
  model: PleModel,
  opts: BuildFemOptions,
): {
  femNodes: FemNode[];
  elements: FemElement[];
  mat: MatProps;
  Pi_bar: number;
  Toper: number;
  Tinstall: number;
  loadCases: LoadCase[];
  subsideMap: Record<string, { subzMax: number; uncF: number; length: number; shape: string }>;
  bcs: BoundaryCondition[];
  soilSprings: any[];
  teeSpecs: Record<string, any>;
  teeNodeMap: Record<string, string>;
  weldFactor: number;
  supportBCs: BoundaryCondition[];
  geomctl: PleGeomctl;
  soilctl: PleSoilctl;
} {
  const { nodes } = model;
  const elements = model._elements;
  const springsMap = new Map(model.springs.map(s => [s.sprRef, s]));

  // Mat
  const mat: MatProps = model._matProps || {
    E: 207000, poisson: 0.3, alpha: 12e-6, SMYS: 235, density: 7850, type: "steel",
  };

  // Pi en temperatuur
  // Originele code stuurt parsed.meta.Pi (LOCASE-geschaald, in N/mm²) als Pi_bar.
  // De solver noemt het Pi_bar maar deelt intern door 10 (Pi_bar * 0.1).
  // Dit is een historische quirk: de solver verwacht de waarde in N/mm² maar noemt het "bar".
  // We moeten EXACT hetzelfde doen: stuur de LOCASE-geschaalde N/mm² waarde.
  const PiVal = model._globalPi || 0; // N/mm² (LOCASE-geschaald, zelfde als parsed.meta.Pi)
  const Toper = model._globalTop || 100; // LOCASE-geschaald (zelfde als parsed.meta.Top)
  const Tinstall = model._globalTinst || 10;

  // FEM nodes: voeg D, t, DPE toe per node
  const femNodes: FemNode[] = nodes.map((n, i) => {
    const el = elements[i] || elements[i - 1] || { d: 139.7, t: 3.6, dc: 225 };
    return {
      id: n.id,
      x: n.x, y: n.y, z: n.z,
      bendR: n.bendR,
      D: el.d || 139.7,
      t: el.t || 3.6,
      DPE: n.DPE || el.dc || 225,
    };
  });

  // Loadcases
  const loadCases: LoadCase[] = model.loadCases.map(lc => ({
    lc: lc.lc,
    gloadF: lc.gloadF,
    pressF: lc.pressF,
    tDifF: lc.tDifF,
    deadwF: lc.deadwF,
    setlF: lc.setlF,
  }));

  // SubsideMap
  const subsideMap: Record<string, any> = {};
  model.subside.forEach(s => {
    subsideMap[s.ident] = { subzMax: s.subzMax, uncF: s.uncF, length: s.length, shape: s.shape };
  });

  // Boundary conditions uit ENDPTS + ELSPRS
  const bcs: BoundaryCondition[] = [];
  model.endpts.forEach(ep => {
    const cond = ep.cond.toLowerCase();
    if (cond === "fixed" || cond === "anchor") {
      bcs.push({ nodeId: ep.ident, type: "fixed" });
    } else if (cond === "free" || cond === "open") {
      bcs.push({ nodeId: ep.ident, type: "free" });
    } else if (cond === "guided") {
      bcs.push({ nodeId: ep.ident, type: "guided" });
    } else if (cond === "infin" || cond === "infinite") {
      bcs.push({ nodeId: ep.ident, type: "infin" as any });
    } else if (cond === "spring" || cond === "elastic") {
      const spr = model.springs[0]; // fallback
      bcs.push({
        nodeId: ep.ident, type: "spring",
        kx: spr?.kx || 1e6, ky: spr?.ky || 1e6, kz: spr?.kz || 1e6,
        krx: spr?.kphi || 0, kry: 0, krz: 0,
      });
    }
  });
  // Default: INFIN als geen eindpunten
  if (bcs.length === 0 && nodes.length >= 2) {
    bcs.push({ nodeId: nodes[0].id, type: "infin" as any });
    bcs.push({ nodeId: nodes[nodes.length - 1].id, type: "infin" as any });
  }

  // Grondveren
  const soilSprings: any[] = [];
  const coverMap = new Map(model.gLevels.map(g => [g.ident, g.ground1]));
  const globalCover = model._globalCover || 500;
  const sp = opts.soilType;

  femNodes.forEach(node => {
    const cover = coverMap.get(node.id) || globalCover;
    if (cover <= 0) return;
    const kh = sp.k_h * 1e-6;
    const kv_up = sp.k_v_up * 1e-6;
    const kv_down = sp.k_v_down * 1e-6;
    soilSprings.push({
      nodeId: node.id, kh, kv_up, kv_down,
      kAxial: kh * 0.5,
    });
  });

  // Support BCs
  const supportBCs: BoundaryCondition[] = [];
  model.supports.forEach(sup => {
    const springData = springsMap.get(sup.supRef);
    const nodeId = sup.refIdent;
    if (!nodeId) return;
    if (springData && (springData.kx || springData.ky || springData.kz)) {
      supportBCs.push({
        nodeId, type: "spring",
        kx: springData.kx || 0,
        ky: springData.ky || 0,
        kz: springData.kz || 0,
        krx: springData.kphi || 0,
      });
    } else {
      supportBCs.push({ nodeId, type: "spring", kx: 0, ky: 0, kz: 1e8 });
    }
  });

  // Tee specs + node map
  const teeSpecsR: Record<string, any> = {};
  model.teeSpecs.forEach(ts => {
    teeSpecsR[ts.teeRef] = {
      type: ts.type, dRun: ts.dRun, tRun: ts.tRun,
      dBrn: ts.dBrn, tBrn: ts.tBrn, te: ts.te, r0: ts.r0,
    };
  });

  const teeNodeMap: Record<string, string> = {};
  model.connects.forEach(c => {
    if (c.teeRef) {
      teeNodeMap[c.ident1] = c.teeRef;
      teeNodeMap[c.ident2] = c.teeRef;
    }
  });

  // Lasnaadcorrectie factor z_w (PLE4Win WELD tabel / AddWeld uit Function6.dll)
  // LW-FAC is de maatgevende factor voor längsnaden — gebruik de laagste waarde
  // als er meerdere WELD-rijen zijn (conservatief).
  const weldFactor = model.welds && model.welds.length > 0
    ? Math.min(...model.welds.map(w => w.lwFac ?? 1.0))
    : 1.0;

  return {
    femNodes, elements, mat, Pi_bar: PiVal, Toper, Tinstall,
    loadCases, subsideMap, bcs, soilSprings,
    teeSpecs: teeSpecsR, teeNodeMap,
    weldFactor,
    supportBCs, geomctl: model.geomctl, soilctl: model.soilctl,
  };
}

// ============================================================
// modelToRawSheets — PleModel → rawSheets (voor Excel export)
// ============================================================

function arrayToRaw(
  data: Record<string, any>[],
  columns: { key: string; unit?: string }[],
): any[][] {
  if (data.length === 0) return [];
  const header = [" ", ...columns.map(c => c.key)];
  const unitRow = [" ", ...columns.map(c => c.unit || " ")];
  const dataRows = data.map((obj, i) => [
    i + 1,
    ...columns.map(c => obj[c.key] ?? null),
  ]);
  return [header, unitRow, ...dataRows];
}

export function modelToRawSheets(model: PleModel): Record<string, any[][]> {
  const sheets: Record<string, any[][]> = {};

  // ORIGIN
  sheets.ORIGIN = [
    [" ", "Identifier", "X-S", "Y-S", "Z-S"],
    [" ", " ", "mm", "mm", "mm"],
    [1, "ORIGIN", model.origin.x, model.origin.y, model.origin.z],
  ];

  // POLYDIF — bewaar S1 node in units-rij
  const defaultPolydifHeader = [" ", "Rij", "Status", "d(X-N)", "d(Y-N)", "d(Z-N)", "BEND_EL", "PIPE_EL",
    "EXT", "N-KINK", "L-SEGM", "INTSL", "INTSH", "INT_GRP", "INTGRSPC", "RTYP", "BENDRAD", "LTYP",
    "ETYP", "INSTYP", "IDENT", "X-N", "Y-N", "Z-N", "AX-L", "CUM-L", "D0", "DPE"];
  const polydifHeader = (model._polydifHeader && model._polydifHeader.length > 0)
    ? model._polydifHeader
    : defaultPolydifHeader;
  const polydifUnits = model._polydifUnitsRow || [" "];
  const idx = (name: string) => polydifHeader.findIndex(h => h === name);
  // Data rijen: skip S1 (die zit in units-rij) als _polydifUnitsRow beschikbaar is
  const startIdx = model._polydifUnitsRow ? 1 : 0;
  const polydifData: any[][] = model.nodes.slice(startIdx).map((n, i) => {
    const row: any[] = new Array(polydifHeader.length).fill(null);
    const set = (key: string, value: any) => {
      const iKey = idx(key);
      if (iKey >= 0) row[iKey] = value;
    };
    set("Rij", i + 1);
    set("d(X-N)", n.dxN);
    set("d(Y-N)", n.dyN);
    set("d(Z-N)", n.dzN);
    set("BEND_EL", n.bendEl);
    set("PIPE_EL", n.pipeEl);
    set("EXT", n.ext);
    set("N-KINK", n.nKink);
    set("L-SEGM", n.lSegm);
    set("BENDRAD", n.bendR);
    set("ETYP", n.etyp);
    set("IDENT", n.id);
    set("X-N", n.x + model.origin.x);
    set("Y-N", n.y + model.origin.y);
    set("Z-N", n.z + model.origin.z);
    set("D0", n.D0);
    set("DPE", n.DPE);
    return row;
  });
  sheets.POLYDIF = [polydifHeader, polydifUnits, ...polydifData];

  // DIAM
  sheets.DIAM = arrayToRaw(
    model.diameters.map(d => ({ Identifier: d.ident, DOUT1: d.dout1, DOUT2: d.dout2, IOVAL1: d.ioval1, IOVAL2: d.ioval2 })),
    [{ key: "Identifier" }, { key: "DOUT1", unit: "mm" }, { key: "DOUT2", unit: "mm" }, { key: "IOVAL1" }, { key: "IOVAL2" }],
  );

  // WALL
  sheets.WALL = arrayToRaw(
    model.walls.map(w => ({ Identifier: w.ident, "T-NOM1": w.tnom1, "COR-AL1": w.corAl1, RTOL1: w.rtol1, ATOL1: w.atol1, "T-NOM2": w.tnom2, "COR-AL2": w.corAl2, RTOL2: w.rtol2, ATOL2: w.atol2 })),
    [{ key: "Identifier" }, { key: "T-NOM1", unit: "mm" }, { key: "COR-AL1", unit: "mm" }, { key: "RTOL1", unit: "%" }, { key: "ATOL1", unit: "mm" }, { key: "T-NOM2", unit: "mm" }, { key: "COR-AL2", unit: "mm" }, { key: "RTOL2", unit: "%" }, { key: "ATOL2", unit: "mm" }],
  );

  // MATL
  sheets.MATL = arrayToRaw(
    model.materials.map(m => ({ Identifier: m.ident, MATREF: m.matRef, FABMET: m.fabmet, MATFACT: m.matfact })),
    [{ key: "Identifier" }, { key: "MATREF" }, { key: "FABMET" }, { key: "MATFACT" }],
  );

  // ISTROP
  sheets.ISTROP = arrayToRaw(
    model.materialProps.map(m => ({ MATREF: m.matRef, Emod: m.E, Nu: m.nu, ALPHA: m.alpha, Re: m.Re, ReT: m.ReT, WEIGHT: m.weight, MATCAT: m.matCat })),
    [{ key: "MATREF" }, { key: "Emod", unit: "MPa" }, { key: "Nu" }, { key: "ALPHA", unit: "1/°C" }, { key: "Re", unit: "MPa" }, { key: "ReT", unit: "MPa" }, { key: "WEIGHT", unit: "N/mm³" }, { key: "MATCAT" }],
  );

  // ENDPTS
  sheets.ENDPTS = arrayToRaw(
    model.endpts.map(e => ({ IDENT: e.ident, COND: e.cond, STATE: e.state })),
    [{ key: "IDENT" }, { key: "COND" }, { key: "STATE" }],
  );

  // CONNECT
  sheets.CONNECT = arrayToRaw(
    model.connects.map(c => ({ IDENT1: c.ident1, IDENT2: c.ident2, CONNAME: c.conname, "TEE-REF": c.teeRef })),
    [{ key: "IDENT1" }, { key: "IDENT2" }, { key: "CONNAME" }, { key: "TEE-REF" }],
  );

  // TEESPEC
  sheets.TEESPEC = arrayToRaw(
    model.teeSpecs.map(t => ({ "TEE-REF": t.teeRef, TYPE: t.type, MATREF: t.matRef, MATBRN: t.matBrn, "D-RUN": t.dRun, "T-RUN": t.tRun, "D-BRN": t.dBrn, "T-BRN": t.tBrn, TE: t.te, R0: t.r0 })),
    [{ key: "TEE-REF" }, { key: "TYPE" }, { key: "MATREF" }, { key: "MATBRN" }, { key: "D-RUN", unit: "mm" }, { key: "T-RUN", unit: "mm" }, { key: "D-BRN", unit: "mm" }, { key: "T-BRN", unit: "mm" }, { key: "TE", unit: "mm" }, { key: "R0", unit: "mm" }],
  );

  // TEECONF
  sheets.TEECONF = arrayToRaw(
    model.teeConfs.map(t => ({ "TEE-REF": t.teeRef, "L-RUN": t.lRun, "L-BRN": t.lBrn, CYCLES: t.cycles })),
    [{ key: "TEE-REF" }, { key: "L-RUN", unit: "mm" }, { key: "L-BRN", unit: "mm" }, { key: "CYCLES" }],
  );

  // SUPPORT
  sheets.SUPPORT = arrayToRaw(
    model.supports.map(s => ({ REFIDENT: s.refIdent, "∆AX-L": s.deltaAxL, COSYS: s.cosys, SUPREF: s.supRef, SUPPLENG: s.supLeng, SUPANGLE: s.supAngle, ADDED: s.added, DISTANCE: s.distance })),
    [{ key: "REFIDENT" }, { key: "∆AX-L", unit: "mm" }, { key: "COSYS" }, { key: "SUPREF" }, { key: "SUPPLENG", unit: "mm" }, { key: "SUPANGLE", unit: "deg" }, { key: "ADDED" }, { key: "DISTANCE", unit: "mm" }],
  );

  // ELSPRS
  sheets.ELSPRS = arrayToRaw(
    model.springs.map(s => ({ SPRREF: s.sprRef, XX: s.kx, YY: s.ky, ZZ: s.kz, "PHI-PHI": s.kphi, "PSI-PSI": s.kpsi, "ETA-ETA": s.keta })),
    [{ key: "SPRREF" }, { key: "XX", unit: "N/mm" }, { key: "YY", unit: "N/mm" }, { key: "ZZ", unit: "N/mm" }, { key: "PHI-PHI", unit: "Nmm/rad" }, { key: "PSI-PSI", unit: "Nmm/rad" }, { key: "ETA-ETA", unit: "Nmm/rad" }],
  );

  // COATING
  sheets.COATING = arrayToRaw(
    model.coatings.map(c => ({ "Start Identifier": c.startIdent, "End Identifier": c.endIdent, NAME: c.name, TYPE: c.type, THICK: c.thick, WEIGHT: c.weight })),
    [{ key: "Start Identifier" }, { key: "End Identifier" }, { key: "NAME" }, { key: "TYPE" }, { key: "THICK", unit: "mm" }, { key: "WEIGHT", unit: "N/mm³" }],
  );

  // G-LEVEL
  sheets["G-LEVEL"] = arrayToRaw(
    model.gLevels.map(g => ({ Identifier: g.ident, GROUND1: g.ground1, UNCV1: g.uncv1, GROUND2: g.ground2, UNCV2: g.uncv2 })),
    [{ key: "Identifier" }, { key: "GROUND1", unit: "mm" }, { key: "UNCV1", unit: "mm" }, { key: "GROUND2", unit: "mm" }, { key: "UNCV2", unit: "mm" }],
  );

  // W-LEVEL
  sheets["W-LEVEL"] = arrayToRaw(
    model.wLevels.map(w => ({ Identifier: w.ident, WATER1: w.water1, UNCV1: w.uncv1, WATER2: w.water2, UNCV2: w.uncv2, WEIGHT: w.weight })),
    [{ key: "Identifier" }, { key: "WATER1", unit: "mm" }, { key: "UNCV1", unit: "mm" }, { key: "WATER2", unit: "mm" }, { key: "UNCV2", unit: "mm" }, { key: "WEIGHT", unit: "N/mm³" }],
  );

  // TOPLOAD
  sheets.TOPLOAD = arrayToRaw(
    model.topLoads.map(t => ({ TGL_DBL: t.tglDbl, TGL_INT: t.tglInt, TGL_TXT: t.tglTxt, TOPLOAD1: t.topload1, LOADF1: t.loadf1, TOPLOAD2: t.topload2, LOADF2: t.loadf2 })),
    [{ key: "TGL_DBL", unit: "mm" }, { key: "TGL_INT" }, { key: "TGL_TXT" }, { key: "TOPLOAD1", unit: "N/mm²" }, { key: "LOADF1" }, { key: "TOPLOAD2", unit: "N/mm²" }, { key: "LOADF2" }],
  );

  // SOILSUP
  sheets.SOILSUP = arrayToRaw(
    model.soilSupports.map(s => ({ TGL_DBL: s.tglDbl, TGL_INT: s.tglInt, TGL_TXT: s.tglTxt, HOR1: s.hor1, UNCF1: s.uncf1, LOADF1: s.loadf1, HOR2: s.hor2, UNCF2: s.uncf2, LOADF2: s.loadf2 })),
    [{ key: "TGL_DBL", unit: "mm" }, { key: "TGL_INT" }, { key: "TGL_TXT" }, { key: "HOR1", unit: "N/mm²" }, { key: "UNCF1" }, { key: "LOADF1" }, { key: "HOR2", unit: "N/mm²" }, { key: "UNCF2" }, { key: "LOADF2" }],
  );

  // PRESS
  sheets.PRESS = arrayToRaw(
    model.press.map(p => ({ Identifier: p.ident, PRESS1: p.press1, PRESS2: p.press2 })),
    [{ key: "Identifier" }, { key: "PRESS1", unit: "N/mm²" }, { key: "PRESS2", unit: "N/mm²" }],
  );

  // TEMP
  sheets.TEMP = arrayToRaw(
    model.temp.map(t => ({ Identifier: t.ident, "T-ABS1": t.tabs1, "T-REF1": t.tref1, "T-ABS2": t.tabs2, "T-REF2": t.tref2 })),
    [{ key: "Identifier" }, { key: "T-ABS1", unit: "°C" }, { key: "T-REF1", unit: "°C" }, { key: "T-ABS2", unit: "°C" }, { key: "T-REF2", unit: "°C" }],
  );

  // LOCASE
  sheets.LOCASE = arrayToRaw(
    model.loadCases.map(l => ({ LC: l.lc, GLOADF: l.gloadF, "PRESS-F": l.pressF, "T-DIF-F": l.tDifF, "DEADW-F": l.deadwF, "SETL-F": l.setlF })),
    [{ key: "LC" }, { key: "GLOADF" }, { key: "PRESS-F" }, { key: "T-DIF-F" }, { key: "DEADW-F" }, { key: "SETL-F" }],
  );

  // SUBSIDE
  sheets.SUBSIDE = arrayToRaw(
    model.subside.map(s => ({ Identifier: s.ident, SUBZMAX: s.subzMax, UNCF: s.uncF, LENGTH: s.length, SINESHAPE: s.shape })),
    [{ key: "Identifier" }, { key: "SUBZMAX", unit: "mm" }, { key: "UNCF" }, { key: "LENGTH", unit: "mm" }, { key: "SINESHAPE" }],
  );

  // ADIDENT
  sheets.ADIDENT = arrayToRaw(
    model.adidents.map(a => ({ REFIDENT: a.refIdent, "∆AX-L": a.deltaAxL, NEWIDENT: a.newIdent })),
    [{ key: "REFIDENT" }, { key: "∆AX-L", unit: "mm" }, { key: "NEWIDENT" }],
  );

  // SUPANG
  sheets.SUPANG = arrayToRaw(
    model.supangs.map(s => ({ Identifier: s.ident, ANGMIN: s.angMin, ANGMAX: s.angMax, RVSL: s.rvsl, RVSH: s.rvsh, CURVE: s.curve })),
    [{ key: "Identifier" }, { key: "ANGMIN" }, { key: "ANGMAX" }, { key: "RVSL" }, { key: "RVSH" }, { key: "CURVE" }],
  );

  // SECTION
  sheets.SECTION = arrayToRaw(
    model.sections.map(s => ({ Identifier: s.ident, SECTREF: s.sectRef })),
    [{ key: "Identifier" }, { key: "SECTREF" }],
  );

  // WELD — lasnaadcorrectie factoren
  if (model.welds && model.welds.length > 0) {
    sheets.WELD = arrayToRaw(
      model.welds.map(w => ({ "LNGT-WELD": w.lngtWeld, "LW-FAC": w.lwFac, "CIRC-WELD": w.circWeld, "CW-FAC": w.cwFac })),
      [{ key: "LNGT-WELD", unit: "mm" }, { key: "LW-FAC" }, { key: "CIRC-WELD", unit: "mm" }, { key: "CW-FAC" }],
    );
  }

  // GENSOIL — Soil Wizard resultaten als PLE4Win-compatibele tabellen
  // PLE4Win Design Function 3.2 verwacht aparte polygon-tabellen per parameter
  // Elke tabel heeft: Identifier, VALUE1 (vóór punt), VALUE2 (ná punt), UNCF-L, UNCF-H
  if (model.soilWizardResults && model.soilWizardResults.length > 0) {
    const swRes = model.soilWizardResults;
    
    // Helper: maak een PLE4Win soil polygon-tabel
    const soilTable = (param: string, unit: string, getValue: (r: typeof swRes[0]) => number, uncf = 1.7) => {
      return [
        [" ", "Identifier", `${param}1`, `${param}2`, "UNCF-L", "UNCF-H"],
        [" ", " ", unit, unit, " ", " "],
        ...swRes.map((r, i) => [
          i + 1, r.nodeId,
          +getValue(r).toFixed(4), null, uncf, uncf,
        ]),
      ];
    };
    
    // KLH — Horizontale grondveerstijfheid [kN/m²]
    sheets.KLH = soilTable("KLH", "kN/m²", r => r.KLH);
    
    // KLS — Verticale neerwaartse stijfheid [kN/m²]
    sheets.KLS = soilTable("KLS", "kN/m²", r => r.KLS);
    
    // KLT — Verticale opwaartse stijfheid [kN/m²]
    sheets.KLT = soilTable("KLT", "kN/m²", r => r.KLT);
    
    // RVS — Draagkracht onderzijde [kN/m]
    sheets.RVS = soilTable("RVS", "kN/m", r => r.RVS);
    
    // RVT — Maximale opwaartse reactie [kN/m]
    sheets.RVT = soilTable("RVT", "kN/m", r => r.RVT);
    
    // RH — Maximale horizontale reactie [kN/m]
    sheets.RH = soilTable("RH", "kN/m", r => r.RH);
    
    // F — Buis-grondwrijving [kN/m²]
    sheets.F = soilTable("F", "kN/m²", r => r.F);
    
    // UF — Verplaatsing bij max wrijving [mm]
    sheets.UF = soilTable("UF", "mm", r => r.UF, 1.0);
    
    // SOILNB — Neutrale bovengrondbelasting [kN/m]
    // SOILNB = γ × H × D (neutrale grondbelasting per lengte-eenheid)
    sheets.SOILNB = [
      [" ", "Identifier", "SOILNB1", "SOILNB2"],
      [" ", " ", "kN/m", "kN/m"],
      ...swRes.map((r, i) => {
        // Zoek de node in het model om D te bepalen
        const node = model.nodes.find(n => n.id === r.nodeId);
        const D_m = ((node?.D0 || model._globalD || 219.1) / 1000);
        const soilnb = r.sigmaK * D_m;  // σk × D ≈ γ × H × D
        return [i + 1, r.nodeId, +soilnb.toFixed(4), null];
      }),
    ];
    
    // GENSOIL samenvattingstabel (voor KaimPLE intern gebruik)
    sheets.GENSOIL = [
      [" ", "IDENT", "KLH", "KLS", "KLT", "RVS", "RVT", "RH", "F", "UF", "SIGMAK", "H_COVER"],
      [" ", " ", "kN/m²", "kN/m²", "kN/m²", "kN/m", "kN/m", "kN/m", "kN/m²", "mm", "kN/m²", "mm"],
      ...swRes.map((r, i) => [
        i + 1, r.nodeId,
        +r.KLH.toFixed(1), +r.KLS.toFixed(1), +r.KLT.toFixed(1),
        +r.RVS.toFixed(2), +r.RVT.toFixed(2), +r.RH.toFixed(2),
        +r.F.toFixed(2), +r.UF.toFixed(1), +r.sigmaK.toFixed(1), +r.H_cover.toFixed(0),
      ]),
    ];
  }

  return sheets;
}

// ============================================================
// Mutatie functies — Editor wijzigt PleModel direct
// ============================================================
// Alle functies retourneren een nieuw PleModel object (immutable update pattern)
// zodat React state updates correct werken.

export function updateModelTable<K extends keyof PleModel>(
  model: PleModel,
  table: K,
  newData: PleModel[K],
): PleModel {
  const updated = { ...model, [table]: newData };
  // Structurele tabellen: herbouw topologie
  if (table === "nodes" || table === "connects" || table === "diameters" ||
      table === "walls" || table === "endpts" || table === "teeSpecs") {
    rebuildTopology(updated);
  }
  return updated;
}

// Convenience: update een enkele rij in een tabel
export function updateModelRow<K extends keyof PleModel>(
  model: PleModel,
  table: K,
  index: number,
  patch: Partial<PleModel[K] extends (infer U)[] ? U : never>,
): PleModel {
  const arr = model[table] as any[];
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) return model;
  const newArr = [...arr];
  newArr[index] = { ...newArr[index], ...patch };
  return updateModelTable(model, table, newArr as any);
}

// Convenience: voeg een rij toe
export function addModelRow<K extends keyof PleModel>(
  model: PleModel,
  table: K,
  row: PleModel[K] extends (infer U)[] ? U : never,
  atIndex?: number,
): PleModel {
  const arr = model[table] as any[];
  if (!Array.isArray(arr)) return model;
  const newArr = [...arr];
  if (atIndex !== undefined && atIndex >= 0 && atIndex <= newArr.length) {
    newArr.splice(atIndex, 0, row);
  } else {
    newArr.push(row);
  }
  return updateModelTable(model, table, newArr as any);
}

// Convenience: verwijder een rij
export function removeModelRow<K extends keyof PleModel>(
  model: PleModel,
  table: K,
  index: number,
): PleModel {
  const arr = model[table] as any[];
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) return model;
  const newArr = [...arr];
  newArr.splice(index, 1);
  return updateModelTable(model, table, newArr as any);
}

// ============================================================
// Compatibiliteitslaag — bouw de legacy meta/nodes/elements structuur
// ============================================================
// Dit wordt gebruikt door de bestaande page.tsx code die nog importedNodes/importedEls/importedMeta verwacht
// zodat we stapsgewijs kunnen migreren.

export function modelToLegacy(model: PleModel): {
  nodes: any[];
  elements: any[];
  meta: any;
} {
  const nodes = model.nodes.map(n => ({
    id: n.id,
    x: n.x, y: n.y, z: n.z,
    bendR: n.bendR,
    etyp: n.etyp,
    D0: n.D0,
    DPE: n.DPE,
    mediumWeight: n.mediumWeight,
    _isAdident: n._isAdident,
  }));

  const elements = model._elements.map(e => ({ ...e }));

  // Bouw meta die backward-compatible is met de bestaande code
  const meta: any = {
    D: model._globalD,
    t: model._globalT,
    Pi: model._globalPi,
    PiRaw: model._globalPiRaw,
    Top: model._globalTop,
    TopRaw: model._globalTopRaw,
    Tinst: model._globalTinst,
    mat: model._globalMat,
    matProps: model._matProps,
    cover: model._globalCover,
    water: model._globalWater,
    nodeCount: model.nodes.length,

    // Maps die de bestaande code verwacht
    endptsMap: Object.fromEntries(model.endpts.map(e => [e.ident, { cond: e.cond, state: e.state }])),
    elsprsMap: Object.fromEntries(model.springs.map(s => [s.sprRef, { kx: s.kx, ky: s.ky, kz: s.kz, kphi: s.kphi }])),
    supportList: model.supports,
    loadCases: model.loadCases.map(lc => ({
      lc: lc.lc, gloadF: lc.gloadF, pressF: lc.pressF, tDifF: lc.tDifF,
      deadwF: lc.deadwF, setlF: lc.setlF, nodalF: lc.nodalF, elbndF: lc.elbndF, wavcF: lc.wavcF,
    })),
    subsideMap: Object.fromEntries(model.subside.map(s => [s.ident, { subzMax: s.subzMax, uncF: s.uncF, length: s.length, shape: s.shape }])),
    coverMap: Object.fromEntries(model.gLevels.map(g => [g.ident, g.ground1])),
    waterMap: Object.fromEntries(model.wLevels.map(w => [w.ident, w.water1])),
    istropMap: Object.fromEntries(model.materialProps.map(m => [m.matRef, { E: m.E, poisson: m.nu, alpha: m.alpha, SMYS: m.Re, density: m.weight ? Math.round(m.weight * 1e9 / 9.81) : 7850, type: "steel" as const }])),
    supangMap: Object.fromEntries(model.supangs.map(s => [s.ident, { angMin: s.angMin, angMax: s.angMax, rvsl: s.rvsl, rvsh: s.rvsh, curve: s.curve }])),
    connects: model.connects.map(c => ({ id1: c.ident1, id2: c.ident2, name: c.conname, teeRef: c.teeRef })),
    teeSpecData: Object.fromEntries(model.teeSpecs.map(t => [t.teeRef, { "TEE-REF": t.teeRef, TYPE: t.type, MATREF: t.matRef, MATBRN: t.matBrn, "D-RUN": t.dRun, "T-RUN": t.tRun, "D-BRN": t.dBrn, "T-BRN": t.tBrn, TE: t.te, R0: t.r0 }])),
    teeconfMap: Object.fromEntries(model.teeConfs.map(t => [t.teeRef, { lRun: t.lRun, lBrn: t.lBrn, cycles: t.cycles }])),
    coatingSegments: model.coatings.map(c => ({ start: c.startIdent, end: c.endIdent, name: c.name, type: c.type, thick: c.thick, weight: c.weight })),
    adidentList: model.adidents,
    adidentCount: model.adidents.length,
    adidentInserted: model.nodes.filter(n => n._isAdident).length,
    sectionList: model.sections,
    geomctl: model.geomctl,
    soilctl: model.soilctl,

    // rawSheets worden afgeleid van het model
    _rawSheets: modelToRawSheets(model),
    soilWizardResults: model.soilWizardResults || [],
  };

  return { nodes, elements, meta };
}
