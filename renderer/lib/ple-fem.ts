// src/lib/ple-fem.ts
// PLE FEM solver — beam-element stijfheidsmatrix solver voor ingegraven leidingen
// Gebaseerd op PLE4Win methodiek: EN 13941-1:2019, AGFW FW 401, NEN 3650-2
//
// Architectuur:
//   1. Per element: 12×12 lokale stijfheidsmatrix (Euler-Bernoulli 3D balk)
//   2. Coördinaattransformatie lokaal → globaal
//   3. Assemblage tot globale stijfheidsmatrix K
//   4. Belastingsvector F opbouwen (thermisch, druk, eigengewicht, zakking)
//   5. Randvoorwaarden toepassen (fixed, free, spring)
//   6. Oplossen K·u = F (banded Cholesky / Gauss-eliminatie)
//   7. Terugrekenen elementkrachten, momenten, spanningen, unity checks

// =============================================================================
// Interfaces (backward-compatible met bestaande page.tsx)
// =============================================================================

export interface FemNode {
  id: string;
  x: number; y: number; z: number;       // mm (RD-coördinaten, origin al afgetrokken)
  bendR?: number | null;                  // mm — bochtradius
  D: number; t: number; DPE: number;      // mm
}

export interface FemElement {
  n1: number; n2: number;                 // node indices
  d: number; t: number; dc: number;       // mm — buitendiameter, wanddikte, casingdiameter
  type: "straight" | "bend" | "tee";
  R?: number;                             // mm — bochtradius
  uc?: number;                            // wordt ingevuld door solver
}

export interface MatProps {
  E: number;          // N/mm² (MPa)
  poisson: number;
  alpha: number;      // 1/°C
  SMYS: number;       // N/mm² (MPa)
  density: number;    // kg/m³
  type?: string;
  name?: string;
  // Elasto-plastisch materiaalmodel (M0)
  Etan?: number;           // N/mm² — tangent modulus na yielding (default E/100)
  epsYield?: number;       // — rek bij vloeigrens (default SMYS/E)
  epsUltimate?: number;    // — maximale toelaatbare rek (default 0.05 = 5%)
  hardeningType?: "bilinear" | "ramberg-osgood";  // default bilinear
  SMTS?: number;           // N/mm² — treksterkte (voor Ramberg-Osgood)
}

export interface LoadCase {
  lc: number | string;
  gloadF: number;     // zwaartekracht factor
  pressF: number;     // druk factor
  tDifF: number;      // temperatuur factor
  deadwF: number;     // eigengewicht factor
  setlF: number;      // zakking factor
}

export interface BoundaryCondition {
  nodeId: string;
  type: "fixed" | "free" | "spring" | "guided" | "anchor" | "infin";
  // Spring stijfheden (N/mm voor translatie, N·mm/rad voor rotatie)
  kx?: number; ky?: number; kz?: number;
  krx?: number; kry?: number; krz?: number;
  // INFIN-specifiek: grondveerstijfheden voor Hetényi-berekening
  soilKh?: number;       // horizontale grondveer (N/mm²)
  soilKv?: number;       // verticale grondveer (N/mm²)
  soilKaxial?: number;   // axiale wrijving (N/mm²)
}

/**
 * Hetényi half-oneindige balk op elastische bedding.
 * Berekent equivalente veerstijfheden voor een INFIN eindpunt.
 *
 * Theorie: Hetényi (1946) — "Beams on Elastic Foundation"
 * Een half-oneindige balk op Winkler-bedding geeft aan het vrije uiteinde:
 *   - Laterale veerstijfheid:  k_lat = 2 × E × I × β³
 *   - Rotatieveerstijfheid:    k_rot = 2 × E × I × β
 *   - Koppelterm:              k_cross = 2 × E × I × β²
 *   - Axiale veerstijfheid:    k_ax = √(E × A × k_soil_axial × D)
 *
 * waarbij β = ⁴√(k_soil × D / (4 × E × I)) — de karakteristieke golflengte-parameter
 */
export function calcInfinSpring(
  E: number, I: number, A: number, D: number, DPE: number,
  soilKh: number, soilKv: number, soilKaxial: number
): { kx: number; ky: number; kz: number; krx: number; kry: number; krz: number } {
  // Laterale bedding (gemiddelde van horizontaal en verticaal)
  const k_lat = (soilKh + soilKv) / 2;  // N/mm² (kracht per oppervlak per verplaatsing)

  // Beddingsconstante per eenheidslengte: k_bed = k_lat × D_PE (N/mm per mm)
  const k_bed = k_lat * DPE;

  // Karakteristieke parameter β (1/mm)
  // β⁴ = k_bed / (4 × E × I)
  const beta = Math.pow(k_bed / (4 * E * I), 0.25);

  // Hetényi veerstijfheden voor half-oneindige balk
  const EI = E * I;
  const k_trans = 2 * EI * Math.pow(beta, 3);  // N/mm (translatie)
  const k_rot = 2 * EI * beta;                  // N·mm/rad (rotatie)

  // Axiale veerstijfheid: F = √(EA × k_ax_per_mm) × u
  // k_axial_per_mm = soilKaxial × π × D (wrijving rond omtrek)
  const k_ax_per_mm = soilKaxial * Math.PI * DPE;
  const k_axial = Math.sqrt(E * A * k_ax_per_mm);  // N/mm

  // Torsieveerstijfheid: benadering als fractie van laterale rotatie
  const k_torsion = k_rot * 0.5;

  return {
    kx: k_axial,       // axiaal (langs de buis)
    ky: k_trans,        // lateraal horizontaal
    kz: k_trans,        // lateraal verticaal
    krx: k_torsion,     // torsie
    kry: k_rot,         // rotatie om y
    krz: k_rot,         // rotatie om z
  };
}

export interface SoilSpring {
  nodeId: string;
  kh: number;       // N/mm² — horizontale grondveerwaarde
  kv_up: number;    // N/mm² — verticale opwaarts
  kv_down: number;  // N/mm² — verticale neerwaarts
  kAxial?: number;  // N/mm² — axiale grondwrijving
  // Bilineair model: maximale grondreactie per richting (N/mm)
  rMaxUp?: number;
  rMaxDown?: number;
  rMaxSide?: number;
  rMaxAxial?: number;
  // Curve type: bilinear (default) of tanh (geleidelijker voor zand/klei)
  curveType?: "bilinear" | "tanh";
}

/**
 * Tanh soil reaction curve (PLE4Win module C)
 * R(δ) = R_max × tanh(k × δ / R_max)
 * - Bij kleine δ: R ≈ k × δ (lineair, stijfheid = k)
 * - Bij grote δ: R → R_max (asymptotisch, plastisch)
 * - Overgang is geleidelijk (geen scherpe knik zoals bilineair)
 */
export function tanhSoilReaction(k: number, rMax: number, displacement: number): number {
  if (rMax <= 0 || k <= 0) return 0;
  return rMax * Math.tanh((k * Math.abs(displacement)) / rMax) * Math.sign(displacement);
}

/** Effectieve stijfheid bij tanh-curve: dR/dδ = k × (1 - tanh²(k·δ/Rmax)) */
export function tanhEffectiveStiffness(k: number, rMax: number, displacement: number): number {
  if (rMax <= 0 || k <= 0) return k;
  const arg = (k * Math.abs(displacement)) / rMax;
  const th = Math.tanh(arg);
  return k * (1 - th * th);
}

// =============================================================================
// Upheaval Buckling Check (PLE4Win module Z)
// EN 13941-1:2019 bijlage E — opwaartse knikanalyse
// =============================================================================

export interface UpheavalBucklingResult {
  criticalForce: number;     // N — kritische kracht (Euler)
  actualForce: number;       // N — werkelijke axiaalkracht
  safetyFactor: number;      // Ncrit / Nactual
  coverRequired: number;     // mm — vereiste gronddekking
  coverActual: number;       // mm — werkelijke gronddekking
  ok: boolean;
}

/**
 * Upheaval buckling check — bepaalt of de leiding omhoog kan komen
 * door thermische expansie tegen onvoldoende grondgewicht.
 *
 * Kritische axiaaldruk voor upheaval: N_cr = π² × E × I / L_buckle²
 * Weerstand: gewicht grond boven leiding + eigen gewicht
 */
export function calcUpheavalBuckling(
  E: number, I: number, A: number, D: number, DPE: number,
  alpha: number, dT: number, Pi: number,
  cover: number, gammaSoil: number,
  imperfectionLength?: number
): UpheavalBucklingResult {
  // Werkelijke axiaalkracht door thermische expansie + druk
  const Ftherm = E * A * alpha * Math.abs(dT);
  const Ab = Math.PI * ((D / 2 - (DPE - D) / 2) ** 2); // vereenvoudigd
  const Fpress = Pi * Math.PI * (D / 2) ** 2;
  const actualForce = Ftherm + Fpress;

  // Knik lengte: L = π × √(E·I / q) waar q = grondgewicht per mm
  // q = γ_soil × cover × D_PE (N/mm)
  const qSoil = gammaSoil * 1e-6 * cover * DPE; // kN/m³ → N/mm³ × mm × mm = N/mm
  const eigenWeight = 7850 * 9.81e-9 * A; // N/mm

  const qTotal = qSoil + eigenWeight;
  const Lbuckle = imperfectionLength || (qTotal > 0 ? Math.PI * Math.sqrt(E * I / qTotal) : 10000);

  // Kritische kracht (Euler met verdeelde tegenlast)
  const criticalForce = qTotal > 0
    ? Math.PI * Math.PI * E * I / (Lbuckle * Lbuckle) + qTotal * Lbuckle / Math.PI
    : Math.PI * Math.PI * E * I / (Lbuckle * Lbuckle);

  const sf = actualForce > 0 ? criticalForce / actualForce : 999;

  // Vereiste dekking voor SF > 1.5
  const coverRequired = actualForce > 0
    ? (actualForce * 1.5) / (gammaSoil * 1e-6 * DPE * Lbuckle) - eigenWeight / (gammaSoil * 1e-6 * DPE)
    : 0;

  return {
    criticalForce,
    actualForce,
    safetyFactor: sf,
    coverRequired: Math.max(coverRequired, 0),
    coverActual: cover,
    ok: sf >= 1.5,
  };
}

// =============================================================================
// ASME B31.8 normtoetsing
// =============================================================================

export interface ASMEB318Result {
  hoopStress: number;        // MPa
  allowableHoop: number;     // MPa
  longitudinalStress: number; // MPa
  allowableLong: number;     // MPa
  combinedStress: number;    // MPa
  allowableCombined: number; // MPa
  ucHoop: number;
  ucLong: number;
  ucCombined: number;
  designFactor: string;      // class location
  ok: boolean;
}

/**
 * ASME B31.8 Gas Transmission Pipeline stress check
 * §841.1: Hoop stress ≤ F × E × T × SMYS
 * §833.4: Combined stress (von Mises) ≤ k × SMYS × T
 */
export function calcASMEB318(
  Pi: number, D: number, t: number, SMYS: number,
  sigmaLong: number, sigmaVM: number,
  locationClass: 1 | 2 | 3 | 4 = 1,
  jointFactor = 1.0,    // E — weld joint factor
  tempFactor = 1.0      // T — temperature derating
): ASMEB318Result {
  // Design factor F per location class
  const designFactors: Record<number, number> = { 1: 0.72, 2: 0.60, 3: 0.50, 4: 0.40 };
  const F = designFactors[locationClass] || 0.72;

  // §841.1.1: S_h = P × D / (2 × t) ≤ F × E × T × SMYS
  const hoopStress = (Pi * D) / (2 * t);
  const allowableHoop = F * jointFactor * tempFactor * SMYS;

  // §833.4: Longitudinal stress ≤ 0.75 × F × E × T × SMYS
  const allowableLong = 0.75 * F * jointFactor * tempFactor * SMYS;

  // §833.6: Combined stress (von Mises equivalent) ≤ k × SMYS × T
  // k = 0.90 for restrained pipe
  const allowableCombined = 0.90 * SMYS * tempFactor;

  return {
    hoopStress,
    allowableHoop,
    longitudinalStress: Math.abs(sigmaLong),
    allowableLong,
    combinedStress: sigmaVM,
    allowableCombined,
    ucHoop: allowableHoop > 0 ? hoopStress / allowableHoop : 0,
    ucLong: allowableLong > 0 ? Math.abs(sigmaLong) / allowableLong : 0,
    ucCombined: allowableCombined > 0 ? sigmaVM / allowableCombined : 0,
    designFactor: `Class ${locationClass} (F=${F})`,
    ok: hoopStress <= allowableHoop && Math.abs(sigmaLong) <= allowableLong && sigmaVM <= allowableCombined,
  };
}

export interface PerElementMaterial {
  E: number;
  poisson: number;
  alpha: number;
  SMYS: number;
  density: number;
  Etan?: number;
  epsYield?: number;
  epsUltimate?: number;
}

// =============================================================================
// Elasto-Plastisch Materiaalmodel (PLE4Win module M0)
// Bilineaire σ-ε relatie met strain hardening
// =============================================================================

export interface PlasticState {
  plasticStrain: number;    // permanente rek (positief)
  totalStrain: number;      // totale rek (elastisch + plastisch)
  isYielded: boolean;       // true als σ > SMYS bereikt
  effectiveE: number;       // huidige effectieve stijfheid (E of Etan)
  stress: number;           // huidige spanning (MPa)
  localBuckled: boolean;    // lokale knik gedetecteerd
}

/**
 * Bilineaire σ-ε relatie:
 *   - σ < SMYS → σ = E × ε (elastisch)
 *   - σ ≥ SMYS → σ = SMYS + Etan × (ε - ε_yield) (plastisch hardening)
 *
 * Geeft de spanning terug voor een gegeven totale rek.
 */
export function bilinearStress(eps: number, E: number, SMYS: number, Etan?: number): number {
  const epsY = SMYS / E;
  const Et = Etan ?? E / 100; // default tangent modulus = E/100
  const absEps = Math.abs(eps);
  if (absEps <= epsY) {
    return E * eps; // elastisch
  }
  // Plastisch: σ = sign(ε) × (SMYS + Etan × (|ε| - εy))
  return Math.sign(eps) * (SMYS + Et * (absEps - epsY));
}

/**
 * Effectieve (tangent) stijfheid bij gegeven rek.
 * In de elastische zone: E. In de plastische zone: Etan.
 */
export function tangentModulus(eps: number, E: number, SMYS: number, Etan?: number): number {
  const epsY = SMYS / E;
  const Et = Etan ?? E / 100;
  return Math.abs(eps) <= epsY ? E : Et;
}

/**
 * Update de plastische toestand van een dwarsdoorsnedepunt.
 * 
 * Input: totale rek (uit FEM verplaatsingen)
 * Output: spanning, plastische rek, effectieve stijfheid
 *
 * Lokale knik check: als compressieve rek > kritische rek voor lokale knik
 * ε_cr = t / (2 × r) voor dunwandige buizen (Timoshenko)
 */
export function updatePlasticState(
  totalStrain: number, mat: MatProps, D: number, t: number,
  prevState?: PlasticState
): PlasticState {
  const E = mat.E;
  const SMYS = mat.SMYS;
  const Etan = mat.Etan ?? E / 100;
  const epsY = mat.epsYield ?? SMYS / E;
  const epsUlt = mat.epsUltimate ?? 0.05;

  // Spanning uit bilineaire relatie
  const stress = bilinearStress(totalStrain, E, SMYS, Etan);
  const absStress = Math.abs(stress);

  // Plastische rek = totale rek - elastische rek
  const elasticStrain = absStress / E;
  const plasticStrain = Math.max(Math.abs(totalStrain) - elasticStrain, 0);

  // Yielding check
  const isYielded = Math.abs(totalStrain) > epsY;

  // Effectieve E voor stijfheidsmatrix
  const effectiveE = isYielded ? Etan : E;

  // Lokale knik check (compressief): ε_cr = t / (2r) voor dunwandige buis
  const r = D / 2;
  const epsCritical = r > 0 ? t / (2 * r) : 0.05;
  const localBuckled = totalStrain < -epsCritical;

  return {
    plasticStrain,
    totalStrain,
    isYielded,
    effectiveE,
    stress: Math.abs(totalStrain) > epsUlt ? Math.sign(totalStrain) * (SMYS + Etan * (epsUlt - epsY)) : stress,
    localBuckled,
  };
}

/**
 * Ramberg-Osgood σ-ε relatie (alternatief voor bilineair):
 *   ε = σ/E + 0.002 × (σ/SMYS)^n
 *   waar n = ln(ε_ult/ε_y) / ln(SMTS/SMYS)
 *
 * Geeft een geleidelijke overgang rond de vloeigrens — realistischer
 * dan bilineair voor staal met micro-yielding.
 */
export function rambergOsgoodStrain(stress: number, E: number, SMYS: number, SMTS?: number): number {
  const n = SMTS && SMTS > SMYS ? Math.log(0.2 / (SMYS / E)) / Math.log(SMTS / SMYS) : 15;
  return stress / E + 0.002 * Math.pow(Math.abs(stress) / SMYS, n) * Math.sign(stress);
}

// =============================================================================
// Steel-in-Steel (SiS) module — thermische voorspanning
// PLE4Win module H: district heating pipelines met voorverwarming
// =============================================================================

export interface SteelInSteelConfig {
  // Mediumleiding (binnenste buis)
  dMedium: number;       // mm — buitendiameter mediumbuis
  tMedium: number;       // mm — wanddikte mediumbuis
  eMedium: number;       // N/mm² — E-modulus mediumbuis
  alphaMedium: number;   // 1/°C — thermische uitzettingscoëfficiënt mediumbuis
  smysMedium: number;    // N/mm² — vloeigrens mediumbuis
  // Mantelbuis (buitenste buis)
  dCasing: number;       // mm — buitendiameter mantelbuis
  tCasing: number;       // mm — wanddikte mantelbuis
  eCasing: number;       // N/mm² — E-modulus mantelbuis
  alphaCasing: number;   // 1/°C — thermische uitzettingscoëfficiënt mantelbuis
  smysCasing: number;    // N/mm² — vloeigrens mantelbuis
  // Temperaturen
  tPreheat: number;      // °C — voorverwarmingstemperatuur (fixeertemperatuur)
  tInstall: number;      // °C — installatietemperatuur (afkoeling na fixeren)
  tOperate: number;      // °C — bedrijfstemperatuur
  // Druk
  piOperate: number;     // N/mm² — bedrijfsdruk mediumbuis
}

export interface SteelInSteelResult {
  // Voorspanningsfase (na afkoeling van tPreheat naar tInstall)
  prestressMedium: number;   // MPa — trekspanning in mediumbuis (positief = trek)
  prestressCasing: number;   // MPa — drukspanning in mantelbuis (negatief = druk)
  prestressForce: number;    // N — voorspankracht
  // Bedrijfsfase (bij tOperate)
  stressMediumAxial: number; // MPa — axiaalspanning mediumbuis in bedrijf
  stressMediumHoop: number;  // MPa — hoopspanning mediumbuis in bedrijf
  stressMediumVM: number;    // MPa — Von Mises mediumbuis in bedrijf
  stressCasingAxial: number; // MPa — axiaalspanning mantelbuis in bedrijf
  stressCasingVM: number;    // MPa — Von Mises mantelbuis in bedrijf
  // Unity checks
  ucMedium: number;          // UC mediumbuis
  ucCasing: number;          // UC mantelbuis
  ucTotal: number;           // max van beide
  ok: boolean;
  // Vergelijking: met vs. zonder voorspanning
  stressWithoutPrestress: number;  // MPa — spanning zonder voorspanning
  stressReduction: number;         // % — spanningsreductie door voorspanning
}

/**
 * Berekent de spanning in een steel-in-steel configuratie met thermische voorspanning.
 *
 * Proces:
 * 1. Mediumbuis wordt verwarmd naar tPreheat
 * 2. Mediumbuis wordt bij tPreheat vastgelast aan de mantelbuis
 * 3. Geheel koelt af naar tInstall
 *    → mediumbuis wil krimpen maar wordt tegengehouden door mantelbuis
 *    → mediumbuis krijgt trekspanning, mantelbuis drukspanning
 * 4. In bedrijf: temperatuur stijgt naar tOperate
 *    → thermische spanning mediumbuis = -E·α·(tOperate - tInstall) + voorspanning
 *    → netto spanning is lager dan zonder voorspanning
 *
 * EN 13941-1:2019 §11 — Steel-in-steel pipelines
 */
export function calcSteelInSteel(config: SteelInSteelConfig): SteelInSteelResult {
  const {
    dMedium, tMedium, eMedium, alphaMedium, smysMedium,
    dCasing, tCasing, eCasing, alphaCasing, smysCasing,
    tPreheat, tInstall, tOperate, piOperate,
  } = config;

  // Doorsnede-eigenschappen
  const aMedium = Math.PI * ((dMedium / 2) ** 2 - ((dMedium / 2) - tMedium) ** 2);
  const aCasing = Math.PI * ((dCasing / 2) ** 2 - ((dCasing / 2) - tCasing) ** 2);

  // ─── Fase 1: Voorspanning (afkoeling van tPreheat naar tInstall) ───
  // Vrije krimp mediumbuis: ΔL/L = αm × (tPreheat - tInstall)
  // Vrije krimp mantelbuis: ΔL/L = αc × (tPreheat - tInstall)
  // Verschil in vrije krimp → voorspankracht
  const dTpre = tPreheat - tInstall;
  const deltaAlpha = alphaMedium - alphaCasing; // verschil in α
  const freeStrainDiff = deltaAlpha * dTpre;

  // Compatibiliteitsvoorwaarde: mediumbuis en mantelbuis vervormen even veel
  // F_pre / (Em·Am) + F_pre / (Ec·Ac) = freeStrainDiff × L
  // → F_pre = freeStrainDiff / (1/(Em·Am) + 1/(Ec·Ac))
  const stiffnessSum = 1 / (eMedium * aMedium) + 1 / (eCasing * aCasing);
  const prestressForce = stiffnessSum > 0 ? freeStrainDiff / stiffnessSum : 0;

  // Spanningen door voorspanning
  const prestressMedium = aMedium > 0 ? prestressForce / aMedium : 0;  // trek in mediumbuis
  const prestressCasing = aCasing > 0 ? -prestressForce / aCasing : 0; // druk in mantelbuis

  // ─── Fase 2: Bedrijfsfase ───
  // Thermische spanning mediumbuis (ingeklemd): σ_th = -E·α·(tOperate - tInstall)
  const sigmaThermMedium = -eMedium * alphaMedium * (tOperate - tInstall);

  // Axiaalspanning mediumbuis = thermische spanning + voorspanning
  const stressMediumAxial = sigmaThermMedium + prestressMedium;

  // Hoopspanning mediumbuis (Barlow)
  const stressMediumHoop = (piOperate * dMedium) / (2 * tMedium);

  // Von Mises mediumbuis
  const stressMediumVM = Math.sqrt(
    stressMediumHoop ** 2
    - stressMediumHoop * stressMediumAxial
    + stressMediumAxial ** 2
  );

  // Mantelbuis: thermische spanning + voorspanning (mantelbuis draagt geen druk)
  const sigmaThermCasing = -eCasing * alphaCasing * (tOperate - tInstall);
  const stressCasingAxial = sigmaThermCasing + prestressCasing;
  const stressCasingVM = Math.abs(stressCasingAxial); // geen hoopspanning

  // UC
  const ucMedium = smysMedium > 0 ? stressMediumVM / (0.85 * smysMedium / 1.1) : 0;
  const ucCasing = smysCasing > 0 ? stressCasingVM / (0.85 * smysCasing / 1.1) : 0;
  const ucTotal = Math.max(ucMedium, ucCasing);

  // Vergelijking: zonder voorspanning
  const stressWithoutPrestress = Math.sqrt(
    stressMediumHoop ** 2
    - stressMediumHoop * sigmaThermMedium
    + sigmaThermMedium ** 2
  );
  const stressReduction = stressWithoutPrestress > 0
    ? ((stressWithoutPrestress - stressMediumVM) / stressWithoutPrestress) * 100
    : 0;

  return {
    prestressMedium, prestressCasing, prestressForce,
    stressMediumAxial, stressMediumHoop, stressMediumVM,
    stressCasingAxial, stressCasingVM,
    ucMedium, ucCasing, ucTotal,
    ok: ucTotal <= 1.0,
    stressWithoutPrestress, stressReduction,
  };
}

export interface NodeResult {
  nodeId: string;
  // Spanningen (N/mm² = MPa) — beam model maxima
  sh: number;       // hoopspanning (Barlow)
  sl: number;       // longitudinale spanning (totaal)
  vm: number;       // Von Mises equivalent
  st: number;       // thermische spanning component
  sb: number;       // buigspanning component
  slp: number;      // Poisson-component van sl
  // Krachten en momenten (N, N·mm)
  Fx: number;       // axiaalkracht
  My: number;       // buigmoment om y-as
  Mz: number;       // buigmoment om z-as
  // Verplaatsingen (mm, rad)
  ux: number; uy: number; uz: number;
  rx: number; ry: number; rz: number;
  // Unity checks
  uc: number; ucRing: number; ucVM: number;
  // Ring model — 48-punts circumferentiële spanningsverdeling
  ring?: RingStressResult;
  // Grondreacties (N) — output van solver
  soilRx?: number; soilRy?: number; soilRz?: number;
}

/** Resultaat van ring model berekening per dwarsdoorsnede */
export interface RingStressResult {
  nPoints: number;              // 48
  angles: number[];             // hoek in radialen [0, 2π)
  // Per omtrekspunt: spanning inner/outer wall (MPa)
  sxInner: number[];            // longitudinaal inner wall
  sxOuter: number[];            // longitudinaal outer wall
  sfInner: number[];            // circumferentieel inner wall
  sfOuter: number[];            // circumferentieel outer wall
  vmInner: number[];            // Von Mises inner wall
  vmOuter: number[];            // Von Mises outer wall
  // Maxima over omtrek
  sxInnerMax: number; sxOuterMax: number;
  sfInnerMax: number; sfOuterMax: number;
  vmInnerMax: number; vmOuterMax: number;
  // Ovalisatie
  ovalisation: number;          // mm (maximale diameter verandering)
  ovalisationPct: number;       // % van D
}

// =============================================================================
// Dichte matrix utilities (voor stijfheidsmatrix operaties)
// =============================================================================

/** Maak een n×n nulmatrix */
function zeros(n: number): Float64Array {
  return new Float64Array(n * n);
}

/** Maak een n-vector van nullen */
function zvec(n: number): Float64Array {
  return new Float64Array(n);
}

/** Haal element (i,j) op uit rijvolgorde-matrix van grootte n×n */
function mget(m: Float64Array, n: number, i: number, j: number): number {
  return m[i * n + j];
}

/** Stel element (i,j) in voor rijvolgorde-matrix */
function mset(m: Float64Array, n: number, i: number, j: number, v: number): void {
  m[i * n + j] = v;
}

/** Tel v op bij element (i,j) */
function madd(m: Float64Array, n: number, i: number, j: number, v: number): void {
  m[i * n + j] += v;
}

/** Matrix-vector vermenigvuldiging: result = M * v */
function mvmul(M: Float64Array, n: number, v: Float64Array, result: Float64Array): void {
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += mget(M, n, i, j) * v[j];
    result[i] = s;
  }
}

/** Matrix-matrix vermenigvuldiging: C = A * B (alle n×n) */
function mmmul(A: Float64Array, B: Float64Array, n: number): Float64Array {
  const C = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += mget(A, n, i, k) * mget(B, n, k, j);
      mset(C, n, i, j, s);
    }
  }
  return C;
}

/** Transponeer n×n matrix in-place naar nieuwe matrix */
function mtranspose(M: Float64Array, n: number): Float64Array {
  const T = zeros(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      mset(T, n, i, j, mget(M, n, j, i));
  return T;
}

// =============================================================================
// Lineaire oplosser: Gauss-eliminatie met gedeeltelijke pivotering
// =============================================================================

/** Los K·u = F op, overschrijft K en F. Retourneert u = F na oplossing. */
function solveLinear(K: Float64Array, F: Float64Array, n: number): Float64Array {
  // Forward elimination met gedeeltelijke pivotering
  for (let col = 0; col < n; col++) {
    // Zoek pivot
    let maxVal = Math.abs(mget(K, n, col, col));
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(mget(K, n, row, col));
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }

    // Wissel rijen als nodig
    if (maxRow !== col) {
      for (let j = col; j < n; j++) {
        const tmp = mget(K, n, col, j);
        mset(K, n, col, j, mget(K, n, maxRow, j));
        mset(K, n, maxRow, j, tmp);
      }
      const tmpF = F[col]; F[col] = F[maxRow]; F[maxRow] = tmpF;
    }

    const pivot = mget(K, n, col, col);
    if (Math.abs(pivot) < 1e-20) {
      // Singuliere matrix — sla kolom over (vaste DOF)
      continue;
    }

    // Elimineer kolom
    for (let row = col + 1; row < n; row++) {
      const factor = mget(K, n, row, col) / pivot;
      if (factor === 0) continue;
      for (let j = col; j < n; j++) {
        madd(K, n, row, j, -factor * mget(K, n, col, j));
      }
      F[row] -= factor * F[col];
    }
  }

  // Back substitution
  for (let i = n - 1; i >= 0; i--) {
    const pivot = mget(K, n, i, i);
    if (Math.abs(pivot) < 1e-20) { F[i] = 0; continue; }
    let s = F[i];
    for (let j = i + 1; j < n; j++) {
      s -= mget(K, n, i, j) * F[j];
    }
    F[i] = s / pivot;
  }

  return F;
}

// =============================================================================
// Geometrie per doorsnede
// =============================================================================

export function calcGeomSection(D: number, t: number) {
  const Di = D - 2 * t;
  const ro = D / 2, ri = Di / 2;
  const As = Math.PI * (ro * ro - ri * ri);
  const I = (Math.PI / 64) * (Math.pow(D, 4) - Math.pow(Di, 4));
  const Ab = Math.PI * ri * ri;
  // Torsie traagheidsmoment (dunwandige buis benadering)
  const J = 2 * I;
  return { Di, ro, ri, As, I, J, W: I / ro, Ab, SDR: D / t, A: As };
}

// =============================================================================
// Spanning formules (EN 13941-1:2019)
// =============================================================================

/** Hoopspanning Barlow (EN 13941-1 §10.2) */
export function calcHoopStress(Pi_Nmm2: number, D: number, t: number): number {
  return (Pi_Nmm2 * D) / (2 * t);
}

/** Thermische spanning (EN 13941-1 §10.4) — restrained thermal stress */
export function calcThermalStress(E: number, alpha: number, Toper: number, Tinstall: number): number {
  return -E * alpha * (Toper - Tinstall);
}

/** Von Mises spanning (EN 13941-1 §10.5) */
export function calcVonMises(sh: number, sl: number): number {
  return Math.sqrt(sh * sh - sh * sl + sl * sl);
}

/** Unity check EN 13941-1 tabel 3 klasse 1 (staal) */
export function calcUC(
  sh: number, vm: number, SMYS: number,
  designFactor = 0.72, gammaM = 1.1,
  weldFactor = 1.0   // z_w lasnaadcorrectie factor (PLE4Win WELD tabel)
): { ucRing: number; ucVM: number; uc: number; ok: boolean } {
  const sha = designFactor * SMYS * weldFactor;
  const vma = 0.85 * SMYS / gammaM * weldFactor;
  const ucRing = sha > 0 ? Math.abs(sh) / sha : 0;
  const ucVM = vma > 0 ? vm / vma : 0;
  const uc = Math.max(ucRing, ucVM);
  return { ucRing, ucVM, uc, ok: uc <= 1.0 };
}

// =============================================================================
// NEN 3650 lastfactor validatie (CheckLoadcaseNen uit PLE.Edu.Calc.Function5)
// =============================================================================

/** NEN 3650-1:2020 tabel 1 — standaard lastfactoren voor bedrijfssituatie */
export const NEN3650_STANDARD_FACTORS = {
  gloadF:  1.0,   // Zwaartekracht
  pressF:  1.15,  // Interne druk (gunstig: 0.9)
  tDifF:   1.1,   // Temperatuurverschil
  deadwF:  1.1,   // Eigengewicht buis + inhoud
  setlF:   1.1,   // Zakking
  nodalF:  1.1,   // Puntlasten
} as const;

export interface LoadcaseNenWarning {
  lc: string;
  field: string;
  value: number;
  expected: number;
  severity: 'warning' | 'info';
  message: string;
}

/**
 * Valideert LOCASE lastfactoren conform NEN 3650-1:2020.
 * Gebaseerd op PLE4Win CheckLoadcaseNen functie in Function5.dll.
 *
 * Geeft waarschuwingen terug voor afwijkende factoren —
 * dit blokkeert de berekening NIET maar informeert de gebruiker.
 */
export function checkLoadcaseNen(loadCases: LoadCase[]): LoadcaseNenWarning[] {
  const warnings: LoadcaseNenWarning[] = [];
  const std = NEN3650_STANDARD_FACTORS;

  for (const lc of loadCases) {
    // Skip eigengewicht-only lastgevallen (pressF=0 en tDifF=0)
    if (lc.pressF === 0 && lc.tDifF === 0) continue;

    const checks: Array<{ field: keyof typeof std; label: string; val: number }> = [
      { field: 'pressF',  label: 'PRESS-F',  val: lc.pressF  },
      { field: 'tDifF',   label: 'T-DIF-F',  val: lc.tDifF   },
      { field: 'deadwF',  label: 'DEADW-F',  val: lc.deadwF  },
      { field: 'setlF',   label: 'SETL-F',   val: lc.setlF   },
      { field: 'gloadF',  label: 'GLOADF',   val: lc.gloadF  },
    ];

    for (const { field, label, val } of checks) {
      const expected = std[field];
      if (val === 0) continue; // niet ingevuld, geen warning

      // Afwijking > 1% → waarschuwing
      if (Math.abs(val - expected) / expected > 0.01) {
        warnings.push({
          lc: String(lc.lc),
          field: label,
          value: val,
          expected,
          severity: val < expected ? 'warning' : 'info',
          message: val < expected
            ? `LC "${lc.lc}": ${label} = ${val} is LAGER dan NEN 3650 standaard (${expected}) — conservativiteit verminderd`
            : `LC "${lc.lc}": ${label} = ${val} wijkt af van NEN 3650 standaard (${expected})`,
        });
      }
    }
  }

  return warnings;
}

// =============================================================================
// Ring model — 48-punts dwarsdoorsnede spanningsberekening
// Gebaseerd op PLE4Win methodiek: beam + ring integratie
// EN 13941-1:2019 bijlage B (ringbelasting) en bijlage C (ovalisatie)
// =============================================================================

const RING_N_POINTS = 48; // 48 equidistante punten over de omtrek

/**
 * Berekent de volledige spanningsverdeling over de omtrek van een buisdoorsnede.
 *
 * Het ring model combineert:
 *   1. Beam-spanningen (uniform of sinusvormig over omtrek)
 *      - Axiale kracht → uniforme σx
 *      - Buigmoment → sinusvormige σx (cos θ verdeling)
 *   2. Ring-spanningen (uit laterale grond/drukbelasting)
 *      - Interne druk → uniforme σf (hoopspanning)
 *      - Grondbelasting → hogere harmonische σf (ovalisatie)
 *   3. Combinatie inner/outer wall
 *      - Membraanspanning = gemiddeld over wanddikte
 *      - Buigspanning = lineair over wanddikte (inner ≠ outer)
 *
 * @param D       Buitendiameter (mm)
 * @param t       Wanddikte (mm)
 * @param E       E-modulus (N/mm²)
 * @param nu      Poisson ratio
 * @param Pi      Interne druk (N/mm²)
 * @param Fx      Axiaalkracht (N) uit beam model
 * @param My      Buigmoment om y-as (N·mm)
 * @param Mz      Buigmoment om z-as (N·mm)
 * @param Mx      Torsiemoment (N·mm)
 * @param qSoilV  Verticale gronddruk op buis (N/mm²) — PLE4Win: γ × H
 * @param qSoilH  Horizontale gronddruk op buis (N/mm²) — PLE4Win: K0 × γ × H
 * @param sif     Stress Intensification Factor voor bochten
 */
export function calcRingStress(
  D: number, t: number, E: number, nu: number,
  Pi: number, Fx: number, My: number, Mz: number, Mx: number,
  qSoilV: number, qSoilH: number, sif: number
): RingStressResult {
  const r = D / 2;                    // buitenstraal
  const ri = r - t;                   // binnenstraal
  const rm = (r + ri) / 2;           // gemiddelde straal
  const geo = calcGeomSection(D, t);
  const nPts = RING_N_POINTS;
  const dTheta = (2 * Math.PI) / nPts;

  // Resultaat arrays
  const angles = new Array(nPts);
  const sxInner = new Array(nPts);
  const sxOuter = new Array(nPts);
  const sfInner = new Array(nPts);
  const sfOuter = new Array(nPts);
  const vmInner = new Array(nPts);
  const vmOuter = new Array(nPts);

  // ─── 1. Beam-spanningen (per omtrekspunt) ───

  // Axiaalspanning (uniform over omtrek)
  const sigmaAxial = geo.As > 0 ? Fx / geo.As : 0;

  // Buigspanning verdeling: σ_bending(θ) = (My·cos(θ) + Mz·sin(θ)) / W × SIF
  // Dit is de kern: buigmoment geeft een sinusvormige verdeling over de omtrek
  const Mresultant = Math.sqrt(My * My + Mz * Mz);
  // Hoek van het resulterende moment t.o.v. y-as
  const momentAngle = Mresultant > 0 ? Math.atan2(Mz, My) : 0;

  // ─── 2. Ring-spanningen (uit laterale belasting) ───

  // Hoopspanning door interne druk (uniform, membraan)
  const sigmaHoop = (Pi * D) / (2 * t);

  // Ring buigmoment door grondbelasting (PLE4Win/NEN 3650 ring model)
  // qSoilV en qSoilH zijn DRUK (N/mm²), niet lijnlast
  // Membraan ringspanning: σf = p_avg × rm / t
  // Buigspanning: Fourier cos(2θ) term door verschil verticaal-horizontaal
  // M_ring(θ) = Δp × rm² / 6 × cos(2θ)  (Timoshenko ring onder drukverschil)
  const pAvg = (qSoilV + qSoilH) / 2;        // gemiddelde druk (N/mm²)
  const deltaP = qSoilV - qSoilH;             // drukverschil (N/mm²)
  const sfSoilMembrane = pAvg * rm / t;        // membraan ringspanning (N/mm²)
  const MringMax = Math.abs(deltaP) * rm * rm / 6; // ring buigmoment (N·mm/mm)

  // Traagheidsmoment van de wand per eenheidslengte
  const Iwall = t * t * t / 12; // mm⁴/mm

  // ─── 3. Per-punt berekening ───

  let maxOval = 0;

  for (let i = 0; i < nPts; i++) {
    const theta = i * dTheta;
    angles[i] = theta;

    // Beam buigspanning op dit punt (sinusvormig)
    // cos(θ - momentAngle) geeft de projectie op het momentvlak
    const sigmaBendBeam = geo.W > 0 ? (Mresultant / geo.W) * Math.cos(theta - momentAngle) * sif : 0;

    // Longitudinale spanning (beam model)
    // Inner wall: membraan + buiging (buiging is lineair over wanddikte)
    const sxMembrane = sigmaAxial + nu * sigmaHoop;
    const sxBend = sigmaBendBeam;
    sxInner[i] = sxMembrane + sxBend;  // inner wall = trek-zijde
    sxOuter[i] = sxMembrane - sxBend;  // outer wall = druk-zijde

    // Circumferentiële spanning (ring model)
    // Membraan: hoopspanning (interne druk) + gronddruk membraan
    const sfMembrane = sigmaHoop + sfSoilMembrane;

    // Ring buiging: cos(2θ) verdeling door gronddruk-verschil
    const MringTheta = MringMax * Math.cos(2 * theta);
    const sfRingBend = Iwall > 0 ? MringTheta * (t / 2) / Iwall : 0;

    // Ovalisatie-bijdrage aan circumferentiële spanning
    sfInner[i] = sfMembrane + sfRingBend;   // inner wall
    sfOuter[i] = sfMembrane - sfRingBend;   // outer wall

    // Ovalisatie: radiale verplaatsing δ(θ) = -Δp × rm³ / (4 × E × Iwall) × cos(2θ)
    if (E > 0 && Iwall > 0) {
      const deltaR = Math.abs(deltaP) * rm * rm * rm / (4 * E * Iwall) * Math.cos(2 * theta);
      if (Math.abs(deltaR) > maxOval) maxOval = Math.abs(deltaR);
    }

    // Von Mises per punt (plane stress: σvm = √(σx² - σx·σf + σf²))
    // Inclusief schuifspanning van torsie
    const tauTorsion = Mx / (2 * Math.PI * rm * rm * t); // dunwandige buis
    vmInner[i] = Math.sqrt(
      sxInner[i] * sxInner[i]
      - sxInner[i] * sfInner[i]
      + sfInner[i] * sfInner[i]
      + 3 * tauTorsion * tauTorsion
    );
    vmOuter[i] = Math.sqrt(
      sxOuter[i] * sxOuter[i]
      - sxOuter[i] * sfOuter[i]
      + sfOuter[i] * sfOuter[i]
      + 3 * tauTorsion * tauTorsion
    );
  }

  // Maxima
  const sxInnerMax = Math.max(...sxInner.map(Math.abs));
  const sxOuterMax = Math.max(...sxOuter.map(Math.abs));
  const sfInnerMax = Math.max(...sfInner.map(Math.abs));
  const sfOuterMax = Math.max(...sfOuter.map(Math.abs));
  const vmInnerMax = Math.max(...vmInner);
  const vmOuterMax = Math.max(...vmOuter);

  return {
    nPoints: nPts,
    angles,
    sxInner, sxOuter,
    sfInner, sfOuter,
    vmInner, vmOuter,
    sxInnerMax, sxOuterMax,
    sfInnerMax, sfOuterMax,
    vmInnerMax, vmOuterMax,
    ovalisation: maxOval * 2,  // diameter verandering = 2 × radiale verplaatsing
    ovalisationPct: D > 0 ? (maxOval * 2 / D) * 100 : 0,
  };
}

// =============================================================================
// SIF (Stress Intensification Factor) — bochten en T-stukken
// =============================================================================

/** SIF voor bocht (EN 13941-1 bijlage C, ASME B31.1 benadering) */
export function calcBendSIF(D: number, t: number, R: number): number {
  const r2 = D / 2 - t;       // gemiddelde straal
  const h = (t * R) / (r2 * r2);
  return Math.max(0.9 / Math.pow(Math.max(h, 0.01), 2 / 3), 1.0);
}

/** Flexibility factor voor bocht (vergroot effectieve buiglengte) */
export function calcBendFlexFactor(D: number, t: number, R: number, Pi_Nmm2 = 0, E = 210000): number {
  const r2 = D / 2 - t;
  const h = (t * R) / (r2 * r2);
  let kFlex = Math.max(1.65 / Math.max(h, 0.01), 1.0);
  // Drukstijfheidsreductie (EN 13941-1 §C.3): interne druk vermindert ovalisatie
  if (Pi_Nmm2 > 0 && E > 0 && h > 0) {
    const pressureStiffening = 1 + 6 * (Pi_Nmm2 * r2 * r2) / (E * t * t) * (1 + 1.5 / (h * h));
    kFlex = kFlex / Math.max(pressureStiffening, 1.0);
  }
  return Math.max(kFlex, 1.0);
}

/** SIF T-stukken (EN 13941-1 bijlage D, ASME B31.3 benadering) */
export function calcTeeSIF(
  dRun: number, tRun: number,
  dBrn: number, tBrn: number,
  teeType: string, te: number
): { sifRun: number; sifBrn: number } {
  const T = teeType === "Welded" ? tRun : Math.max(tRun, te);
  const r2 = dRun / 2 - tRun;
  const h = (T / r2) * (r2 / (dRun / 2)) ** 2;
  const sifRun = Math.max(0.9 / Math.pow(Math.max(h, 0.01), 2 / 3), 1.0);
  const r2b = dBrn / 2 - tBrn;
  const hb = (tBrn / r2b) * (r2b / (dBrn / 2)) ** 2;
  const sifBrn = Math.max(0.9 / Math.pow(Math.max(hb, 0.01), 2 / 3), 1.0);
  return { sifRun, sifBrn };
}

// =============================================================================
// Zakking-buigmoment (SUBSIDE sheet — legacy, nog gebruikt als fallback)
// =============================================================================

export function calcSubsideMoment(
  E: number, I: number,
  subzMax: number, uncF: number, length: number, setlF: number
): number {
  const delta = Math.abs(subzMax) * uncF * setlF;
  return E * I * 12 * delta / (length * length);
}

// =============================================================================
// 3D Euler-Bernoulli balkelement — lokale stijfheidsmatrix
// =============================================================================

/**
 * Bouw de 12×12 lokale stijfheidsmatrix voor een 3D Euler-Bernoulli balkelement.
 *
 * DOF-volgorde per knoop: [ux, uy, uz, rx, ry, rz]
 * Element: knoop 1 (DOF 0-5) → knoop 2 (DOF 6-11)
 *
 * Parameters:
 *   E   — elasticiteitsmodulus (N/mm²)
 *   G   — afschuifmodulus (N/mm²)
 *   A   — doorsnede-oppervlak (mm²)
 *   Iy  — traagheidsmoment om lokale y-as (mm⁴)
 *   Iz  — traagheidsmoment om lokale z-as (mm⁴) — voor cirkelvormige buis: Iy = Iz
 *   J   — polair traagheidsmoment (mm⁴)
 *   L   — elementlengte (mm)
 *   flexFactor — flexibility factor voor bochten (default 1.0)
 */
function buildLocalK(
  E: number, G: number, A: number,
  Iy: number, Iz: number, J: number,
  L: number, flexFactor = 1.0
): Float64Array {
  const K = zeros(12);
  const n = 12;

  // Effectieve traagheid (bochten: vermenigvuldig met flex factor)
  const Iy_eff = Iy * flexFactor;
  const Iz_eff = Iz * flexFactor;

  const EA_L = E * A / L;
  const GJ_L = G * J / L;
  const L2 = L * L;
  const L3 = L * L * L;

  // Axiale stijfheid: DOF 0 (ux1) en DOF 6 (ux2)
  mset(K, n, 0, 0, EA_L);
  mset(K, n, 0, 6, -EA_L);
  mset(K, n, 6, 0, -EA_L);
  mset(K, n, 6, 6, EA_L);

  // Buiging in xz-vlak (uy, rz):
  // DOF 1 (uy1), 5 (rz1), 7 (uy2), 11 (rz2)
  const EIz = E * Iz_eff;
  const a1 = 12 * EIz / L3;
  const a2 = 6 * EIz / L2;
  const a3 = 4 * EIz / L;
  const a4 = 2 * EIz / L;

  mset(K, n, 1, 1, a1);    mset(K, n, 1, 5, a2);    mset(K, n, 1, 7, -a1);   mset(K, n, 1, 11, a2);
  mset(K, n, 5, 1, a2);    mset(K, n, 5, 5, a3);    mset(K, n, 5, 7, -a2);   mset(K, n, 5, 11, a4);
  mset(K, n, 7, 1, -a1);   mset(K, n, 7, 5, -a2);   mset(K, n, 7, 7, a1);    mset(K, n, 7, 11, -a2);
  mset(K, n, 11, 1, a2);   mset(K, n, 11, 5, a4);   mset(K, n, 11, 7, -a2);  mset(K, n, 11, 11, a3);

  // Buiging in xy-vlak (uz, ry):
  // DOF 2 (uz1), 4 (ry1), 8 (uz2), 10 (ry2)
  const EIy = E * Iy_eff;
  const b1 = 12 * EIy / L3;
  const b2 = 6 * EIy / L2;
  const b3 = 4 * EIy / L;
  const b4 = 2 * EIy / L;

  mset(K, n, 2, 2, b1);    mset(K, n, 2, 4, -b2);   mset(K, n, 2, 8, -b1);   mset(K, n, 2, 10, -b2);
  mset(K, n, 4, 2, -b2);   mset(K, n, 4, 4, b3);    mset(K, n, 4, 8, b2);    mset(K, n, 4, 10, b4);
  mset(K, n, 8, 2, -b1);   mset(K, n, 8, 4, b2);    mset(K, n, 8, 8, b1);    mset(K, n, 8, 10, b2);
  mset(K, n, 10, 2, -b2);  mset(K, n, 10, 4, b4);   mset(K, n, 10, 8, b2);   mset(K, n, 10, 10, b3);

  // Torsie: DOF 3 (rx1), 9 (rx2)
  mset(K, n, 3, 3, GJ_L);
  mset(K, n, 3, 9, -GJ_L);
  mset(K, n, 9, 3, -GJ_L);
  mset(K, n, 9, 9, GJ_L);

  return K;
}

// =============================================================================
// Coördinaattransformatie — rotatiematrix voor 3D element
// =============================================================================

/**
 * Bouw 12×12 transformatiematrix T voor een element met gegeven richting.
 * T transformeert van lokaal naar globaal: K_global = T^T · K_local · T
 *
 * Lokale x-as = elementrichting (van knoop 1 naar knoop 2)
 * Lokale y-as = loodrecht op x, berekend via kruisproduct met referentie-as
 * Lokale z-as = x × y
 */
function buildTransformMatrix(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): Float64Array {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (L < 1e-10) {
    // Nul-lengte element: identiteitsmatrix
    const T = zeros(12);
    for (let i = 0; i < 12; i++) mset(T, 12, i, i, 1);
    return T;
  }

  // Lokale x-as (eenheidsvector langs element)
  const lx = dx / L, ly = dy / L, lz = dz / L;

  // Referentie-as voor kruisproduct — kies as die het minst parallel is
  let refX = 0, refY = 0, refZ = 1;
  if (Math.abs(lz) > 0.9) {
    // Element bijna verticaal: gebruik x-as als referentie
    refX = 1; refY = 0; refZ = 0;
  }

  // Lokale y-as = referentie × lokale x (genormaliseerd)
  let yx = refY * lz - refZ * ly;
  let yy = refZ * lx - refX * lz;
  let yz = refX * ly - refY * lx;
  const yLen = Math.sqrt(yx * yx + yy * yy + yz * yz);
  if (yLen > 1e-10) { yx /= yLen; yy /= yLen; yz /= yLen; }

  // Lokale z-as = x × y
  const zx = ly * yz - lz * yy;
  const zy = lz * yx - lx * yz;
  const zz = lx * yy - ly * yx;

  // 3×3 rotatiematrix λ
  // λ = [[lx, ly, lz], [yx, yy, yz], [zx, zy, zz]]
  // T = diag(λ, λ, λ, λ) = 12×12 blokdiagonaal
  const T = zeros(12);
  for (let block = 0; block < 4; block++) {
    const off = block * 3;
    mset(T, 12, off + 0, off + 0, lx); mset(T, 12, off + 0, off + 1, ly); mset(T, 12, off + 0, off + 2, lz);
    mset(T, 12, off + 1, off + 0, yx); mset(T, 12, off + 1, off + 1, yy); mset(T, 12, off + 1, off + 2, yz);
    mset(T, 12, off + 2, off + 0, zx); mset(T, 12, off + 2, off + 1, zy); mset(T, 12, off + 2, off + 2, zz);
  }

  return T;
}

// =============================================================================
// Sparse assembly helpers (voor grotere netwerken)
// =============================================================================

/**
 * Voor netwerken tot ~500 nodes (3000 DOFs) gebruiken we een dichte matrix.
 * Voor grotere netwerken zou je overstappen op een sparse (COO/CSR) formaat,
 * maar voor de typische PLE4Win projecten is dit ruim voldoende.
 */

// =============================================================================
// Geometrische stijfheidsmatrix Kg — 2e orde effecten (P-δ)
// =============================================================================

/**
 * Bouw de 12×12 geometrische stijfheidsmatrix voor een 3D balkelement.
 * 
 * De geometrische stijfheidsmatrix modelleert het effect van axiaalkracht
 * op de laterale stijfheid (P-δ effect):
 *   - Trekkracht (N > 0) → verstijft lateraal (vergroot effectieve stijfheid)
 *   - Drukkracht (N < 0) → verzwakt lateraal (verkleint effectieve stijfheid, knikgevoelig)
 *
 * Gebaseerd op: Przemieniecki, "Theory of Matrix Structural Analysis" (1968)
 * 
 * @param N   Axiaalkracht in element (N) — positief = trek
 * @param L   Elementlengte (mm)
 */
function buildGeometricK(N: number, L: number): Float64Array {
  const Kg = zeros(12);
  const n = 12;
  if (L < 0.01 || N === 0) return Kg;

  const NL = N / L;
  const a = 6 / 5;            // 6/5 voor Euler-Bernoulli
  const b = 1 / 10;           // 1/10
  const c = 2 * L / 15;       // 2L/15
  const d = -1 / 10;          // -1/10  
  const e = -L / 30;          // -L/30

  // uy-uy blok (DOFs 1,5,7,11)
  mset(Kg, n, 1, 1, a * NL);    mset(Kg, n, 1, 5, b * N);    mset(Kg, n, 1, 7, -a * NL);   mset(Kg, n, 1, 11, b * N);
  mset(Kg, n, 5, 1, b * N);     mset(Kg, n, 5, 5, c * N);    mset(Kg, n, 5, 7, -b * N);    mset(Kg, n, 5, 11, e * N);
  mset(Kg, n, 7, 1, -a * NL);   mset(Kg, n, 7, 5, -b * N);   mset(Kg, n, 7, 7, a * NL);    mset(Kg, n, 7, 11, -b * N);
  mset(Kg, n, 11, 1, b * N);    mset(Kg, n, 11, 5, e * N);   mset(Kg, n, 11, 7, -b * N);   mset(Kg, n, 11, 11, c * N);

  // uz-uz blok (DOFs 2,4,8,10) — zelfde structuur, tegengestelde koppeltermen
  mset(Kg, n, 2, 2, a * NL);    mset(Kg, n, 2, 4, -b * N);   mset(Kg, n, 2, 8, -a * NL);   mset(Kg, n, 2, 10, -b * N);
  mset(Kg, n, 4, 2, -b * N);    mset(Kg, n, 4, 4, c * N);    mset(Kg, n, 4, 8, b * N);     mset(Kg, n, 4, 10, e * N);
  mset(Kg, n, 8, 2, -a * NL);   mset(Kg, n, 8, 4, b * N);    mset(Kg, n, 8, 8, a * NL);    mset(Kg, n, 8, 10, b * N);
  mset(Kg, n, 10, 2, -b * N);   mset(Kg, n, 10, 4, e * N);   mset(Kg, n, 10, 8, b * N);    mset(Kg, n, 10, 10, c * N);

  return Kg;
}

// =============================================================================
// HOOFDFUNCTIE: FEM solver
// =============================================================================

export interface FemSolverInput {
  nodes: FemNode[];
  elements: FemElement[];
  mat: MatProps;
  Pi_bar: number;          // bedrijfsdruk in bar
  Toper: number;           // bedrijfstemperatuur (°C)
  Tinstall: number;        // installatietemperatuur (°C)
  loadCase: LoadCase;
  subsideMap: Record<string, { subzMax: number; uncF: number; length: number; shape: string }>;
  boundaryConditions?: BoundaryCondition[];
  soilSprings?: SoilSpring[];
  designFactor?: number;   // default 0.72 (klasse 1)
  gammaM?: number;         // default 1.1
  // Prioriteit 1: bilineair grondmodel iteratie-instellingen
  maxSoilIterations?: number;  // default 20 (PLE4Win SOILCTL.MAXSIT)
  soilConvergenceTol?: number; // default 0.001 (relatieve tolerantie)
  // Prioriteit 4: per-element materiaaleigenschappen
  perElementMaterials?: Map<number, PerElementMaterial>;
  // Prioriteit 5: steunpunten als extra veerstijfheden
  supportSprings?: BoundaryCondition[];
  // Geometrisch niet-lineair (2e orde analyse)
  geometricNonlinear?: boolean;    // default false (lineair)
  maxGeoIterations?: number;       // default 10
  geoConvergenceTol?: number;      // default 0.001
  maxRotation?: number;            // default 0.3 rad
  // Materiaal niet-lineair (elasto-plastisch, module M0)
  materialNonlinear?: boolean;     // default false
  maxMatIterations?: number;       // default 15
  matConvergenceTol?: number;      // default 0.005
  // T-stuk specificaties voor SIF berekening (PLE4Win TEESPEC/TEEFAC)
  teeSpecs?: Record<string, { type: string; dRun: number; tRun: number; dBrn: number; tBrn: number; te: number; r0: number }>;
  // Map van T-stuk node IDs naar hun TEE-REF naam
  teeNodeMap?: Record<string, string>;
  // Lasnaadcorrectie factor z_w (PLE4Win WELD tabel, LNGT-WELD × LW-FAC)
  // Standaard 1.0 (geen correctie). Waarde < 1.0 verlaagt toelaatbare spanning.
  weldFactor?: number;
}

export interface FemSolverOutput {
  nodeResults: NodeResult[];
  globalDisplacements: Float64Array;
  elementForces: { elIdx: number; Fx1: number; Fy1: number; Fz1: number; Mx1: number; My1: number; Mz1: number; Fx2: number; Fy2: number; Fz2: number; Mx2: number; My2: number; Mz2: number }[];
  maxUC: number;
  maxVM: number;
  converged: boolean;
  // Bilineair iteratie-info
  soilIterations?: number;
  soilConverged?: boolean;
  plasticNodeCount?: number;
  // Geometrisch niet-lineair info
  geoIterations?: number;
  geoConverged?: boolean;
  // Materiaal niet-lineair info
  matIterations?: number;
  matConverged?: boolean;
  yieldedElementCount?: number;
  maxPlasticStrain?: number;
  localBuckledCount?: number;
}

export function solveFEM(input: FemSolverInput): FemSolverOutput {
  const {
    nodes, elements, mat,
    Pi_bar, Toper, Tinstall, loadCase, subsideMap,
    boundaryConditions = [],
    soilSprings = [],
    designFactor = 0.72,
    gammaM = 1.1,
    maxSoilIterations = 20,
    soilConvergenceTol = 0.001,
    perElementMaterials,
    supportSprings = [],
    geometricNonlinear = false,
    maxGeoIterations = 10,
    geoConvergenceTol = 0.001,
    maxRotation = 0.3,
    materialNonlinear = false,
    maxMatIterations = 15,
    matConvergenceTol = 0.005,
    teeSpecs = {},
    teeNodeMap = {},
    weldFactor = 1.0,
  } = input;

  // =====================================================
  // Pre-processing: Automatische element-opsplitsing (PLE4Win-stijl)
  // Lange elementen worden opgesplitst in sub-elementen zodat:
  // 1. Eigengewicht correct verdeeld wordt over meerdere grondveren
  // 2. De FEM nauwkeurigheid gewaarborgd is
  // Max elementlengte ≈ 5000 mm (PLE4Win gebruikt ~5D als richtlijn)
  // =====================================================
  const maxElLength = 5000; // mm — maximale elementlengte

  // Werk op kopieën zodat het origineel behouden blijft
  const workNodes: FemNode[] = [...nodes.map(n => ({ ...n }))];
  const workElements: FemElement[] = [];
  const workPerElementMaterials = new Map<number, PerElementMaterial>();
  // Map van origineel element-index naar sub-element indices
  const origToSubMap: number[][] = [];
  // Map van sub-node index naar origineel node index (-1 = tussennode)
  const subToOrigNode: number[] = nodes.map((_, i) => i);

  for (let ei = 0; ei < elements.length; ei++) {
    const el = elements[ei];
    const n1 = nodes[el.n1], n2 = nodes[el.n2];
    if (!n1 || !n2) {
      origToSubMap.push([workElements.length]);
      workElements.push({ ...el });
      if (perElementMaterials?.has(ei)) workPerElementMaterials.set(workElements.length - 1, perElementMaterials.get(ei)!);
      continue;
    }

    const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = (n2.z || 0) - (n1.z || 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const nSub = L > maxElLength ? Math.ceil(L / maxElLength) : 1;

    if (nSub === 1) {
      // Geen opsplitsing nodig
      const subIdx = workElements.length;
      origToSubMap.push([subIdx]);
      workElements.push({ ...el });
      if (perElementMaterials?.has(ei)) workPerElementMaterials.set(subIdx, perElementMaterials.get(ei)!);
    } else {
      // Splits element in nSub sub-elementen
      const subIndices: number[] = [];
      const elMat = perElementMaterials?.get(ei);
      let prevNodeIdx = el.n1;

      for (let s = 0; s < nSub; s++) {
        const frac = (s + 1) / nSub;
        let nextNodeIdx: number;

        if (s === nSub - 1) {
          // Laatste sub-element: gebruik originele eindnode
          nextNodeIdx = el.n2;
        } else {
          // Maak tussennode
          nextNodeIdx = workNodes.length;
          const interpNode: FemNode = {
            id: `${n1.id || el.n1}_sub${s + 1}`,
            x: n1.x + dx * frac,
            y: n1.y + dy * frac,
            z: (n1.z || 0) + dz * frac,
            D: (n2 as any).D || (n1 as any).D,
            t: (n2 as any).t || (n1 as any).t,
            DPE: (n2 as any).DPE || (n1 as any).DPE,
          };
          workNodes.push(interpNode);
          subToOrigNode.push(-1); // tussennode
        }

        const subEl: FemElement = {
          n1: prevNodeIdx,
          n2: nextNodeIdx,
          d: el.d,
          t: el.t,
          dc: el.dc,
          type: el.type,
          R: el.R,
        };
        const subIdx = workElements.length;
        subIndices.push(subIdx);
        workElements.push(subEl);
        if (elMat) workPerElementMaterials.set(subIdx, elMat);

        prevNodeIdx = nextNodeIdx;
      }
      origToSubMap.push(subIndices);
    }
  }

  // Voeg grondveren toe voor nieuwe tussennodes (erven van de dichtstbijzijnde originele spring)
  const workSoilSprings: SoilSpring[] = [...soilSprings];
  const existingSoilNodeIds = new Set(soilSprings.map(ss => ss.nodeId));
  for (let ni = nodes.length; ni < workNodes.length; ni++) {
    const wn = workNodes[ni];
    if (wn.id && !existingSoilNodeIds.has(wn.id) && soilSprings.length > 0) {
      // Gebruik dezelfde kh/kv als de eerste grondveer (alle nodes zelfde grondtype)
      const ref = soilSprings[0];
      workSoilSprings.push({
        nodeId: wn.id,
        kh: ref.kh,
        kv_up: ref.kv_up,
        kv_down: ref.kv_down,
        kAxial: ref.kAxial,
      });
    }
  }

  if (typeof console !== "undefined" && workNodes.length > nodes.length) {
    console.log(`[FEM] Element subdivision: ${nodes.length} nodes → ${workNodes.length}, ${elements.length} elements → ${workElements.length}`);
  }

  // Gebruik de opgesplitste nodes/elementen voor de rest van de solver
  const useNodes = workNodes;
  const useElements = workElements;
  const useSoilSprings = workSoilSprings;
  const usePerElementMaterials: Map<number, PerElementMaterial> | undefined = workPerElementMaterials.size > 0 ? workPerElementMaterials : undefined;

  const nNodes = useNodes.length;
  const nDof = nNodes * 6;   // 6 DOF per knoop
  const Pi = Pi_bar * 0.1;   // bar → N/mm²

  // =====================================================
  // Pre-compute: per-node grondveer data voor bilineaire iteratie
  // =====================================================
  interface SoilNodeData {
    nodeIdx: number;
    baseDof: number;
    influenceLength: number;
    DPE: number;
    D: number;
    kx: number; ky: number; kz_down: number; kz_up: number; kAxial: number;
    rMaxUp: number; rMaxDown: number; rMaxSide: number; rMaxAxial: number;
    // Huidige effectieve stijfheid (wordt aangepast in iteratie)
    kx_eff: number; ky_eff: number; kz_eff: number; kax_eff: number;
    isPlastic_x: boolean; isPlastic_y: boolean; isPlastic_z: boolean; isPlastic_ax: boolean;
    curveType: "bilinear" | "tanh";
    // Grondreacties (output — berekend na solve)
    reactionX: number; reactionY: number; reactionZ: number;
  }

  const soilNodeData: SoilNodeData[] = [];

  for (const ss of useSoilSprings) {
    const nodeIdx = useNodes.findIndex(n => n.id === ss.nodeId);
    if (nodeIdx < 0) continue;

    let influenceLength = 0;
    for (const el of useElements) {
      if (el.n1 === nodeIdx || el.n2 === nodeIdx) {
        const n1 = useNodes[el.n1], n2 = useNodes[el.n2];
        const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = (n2.z || 0) - (n1.z || 0);
        influenceLength += Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
      }
    }
    if (influenceLength < 1) influenceLength = 1000;

    const D = useNodes[nodeIdx].D || 139.7;
    const DPE = useNodes[nodeIdx].DPE || D * 1.6;

    // Grondveer stijfheid = k × DPE × L_invloed
    const kx_base = ss.kh * DPE * influenceLength;
    const ky_base = ss.kh * DPE * influenceLength;
    const kz_down_base = ss.kv_down * DPE * influenceLength;
    const kz_up_base = ss.kv_up * DPE * influenceLength;
    const kax_base = (ss.kAxial || ss.kh * 0.5) * DPE * influenceLength;

    // Maximale grondreactie (bilineair)
    // Na element-opsplitsing zijn elementen kort (max 5m), dus rMax is proportioneel
    // Fallback: plastische grens bij referentieverplaatsing × veerstijfheid
    const refDisp = 50; // mm — referentieverplaatsing voor plastische grens
    const rMaxSide = ss.rMaxSide || kx_base * refDisp;
    const rMaxDown = ss.rMaxDown || kz_down_base * refDisp;
    const rMaxUp = ss.rMaxUp || kz_up_base * refDisp;
    const rMaxAxial = ss.rMaxAxial || kax_base * refDisp;

    soilNodeData.push({
      nodeIdx, baseDof: nodeIdx * 6, influenceLength, DPE, D,
      kx: kx_base, ky: ky_base, kz_down: kz_down_base, kz_up: kz_up_base, kAxial: kax_base,
      rMaxUp, rMaxDown, rMaxSide, rMaxAxial,
      kx_eff: kx_base, ky_eff: ky_base, kz_eff: kz_down_base, kax_eff: kax_base,
      isPlastic_x: false, isPlastic_y: false, isPlastic_z: false, isPlastic_ax: false,
      curveType: ss.curveType || "bilinear",
      reactionX: 0, reactionY: 0, reactionZ: 0,
    });
  }

  // DEBUG: log soil spring info
  if (typeof console !== "undefined") {
    console.log(`[FEM] soilSprings input: ${useSoilSprings.length}, soilNodeData matched: ${soilNodeData.length}`);
    if (soilNodeData.length > 0) {
      const sd0 = soilNodeData[0];
      console.log(`[FEM] First soil node: idx=${sd0.nodeIdx}, kx=${sd0.kx.toFixed(1)}, kz_down=${sd0.kz_down.toFixed(1)}, rMaxSide=${sd0.rMaxSide.toFixed(1)}, rMaxDown=${sd0.rMaxDown.toFixed(1)}, DPE=${sd0.DPE}, L_infl=${sd0.influenceLength.toFixed(0)}`);
    }
    if (useSoilSprings.length > 0 && soilNodeData.length === 0) {
      console.log(`[FEM] WARNING: No soil springs matched! First spring nodeId=${useSoilSprings[0].nodeId}, first node id=${useNodes[0]?.id}`);
    }
  }

  // =====================================================
  // Bilineaire iteratie-lus (Prioriteit 1)
  // =====================================================
  let U = zvec(nDof);
  let converged = true;
  let soilConverged = false;
  let iteration = 0;

  // Per-element data — buiten de iteratielus zodat het na de lus beschikbaar blijft
  let elData: { T: Float64Array; Klocal: Float64Array; L: number; geo: ReturnType<typeof calcGeomSection>; flexFactor: number; sif: number; elMat: MatProps }[] = [];

  for (iteration = 0; iteration < maxSoilIterations; iteration++) {

  // =====================================================
  // Stap 1: Bouw globale stijfheidsmatrix en belastingsvector
  // =====================================================
  const Kglobal = zeros(nDof);
  const Fglobal = zvec(nDof);

  // Reset elData per iteratie
  elData = [];

  for (let ei = 0; ei < useElements.length; ei++) {
    const el = useElements[ei];
    const n1 = useNodes[el.n1];
    const n2 = useNodes[el.n2];
    if (!n1 || !n2) continue;

    const D = el.d || 139.7;
    const t = el.t || 3.6;
    const geo = calcGeomSection(D, t);

    // Prioriteit 4: per-element materiaal (als beschikbaar)
    const elMat = usePerElementMaterials?.get(ei) || mat;
    const G = elMat.E / (2 * (1 + elMat.poisson));

    // Elementlengte in mm
    const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = (n2.z || 0) - (n1.z || 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 0.01) {
      elData.push({ T: zeros(12), Klocal: zeros(12), L: 0, geo, flexFactor: 1, sif: 1, elMat });
      continue;
    }

    // Flexibility factor en SIF voor bochten en T-stukken
    let flexFactor = 1.0;
    let sif = 1.0;
    if (el.type === "bend" && el.R && el.R > 0) {
      // Prioriteit 2: drukstijfheidsreductie bij bochten
      flexFactor = calcBendFlexFactor(D, t, el.R, Pi * loadCase.pressF, elMat.E);
      sif = calcBendSIF(D, t, el.R);
    } else if (el.type === "tee") {
      // T-stuk SIF: zoek TEESPEC via teeNodeMap
      const n1Id = useNodes[el.n1]?.id || "";
      const n2Id = useNodes[el.n2]?.id || "";
      const teeRef = teeNodeMap[n1Id] || teeNodeMap[n2Id] || "";
      const spec = teeSpecs[teeRef];
      if (spec) {
        const { sifRun } = calcTeeSIF(spec.dRun, spec.tRun, spec.dBrn, spec.tBrn, spec.type, spec.te);
        sif = sifRun;
      } else {
        // Fallback: gebruik element D/t als benadering
        const { sifRun } = calcTeeSIF(D, t, D * 0.7, t, "Welded", 0);
        sif = sifRun;
      }
    }

    // Lokale stijfheidsmatrix (met per-element E)
    const Klocal = buildLocalK(elMat.E, G, geo.As, geo.I, geo.I, geo.J, L, flexFactor);

    // Transformatiematrix
    const T = buildTransformMatrix(n1.x, n1.y, n1.z || 0, n2.x, n2.y, n2.z || 0);
    const Tt = mtranspose(T, 12);

    // K_global_element = T^T · K_local · T
    const KT = mmmul(Klocal, T, 12);
    const TtKT = mmmul(Tt, KT, 12);

    // Assembleer in globale matrix
    const dofs1 = el.n1 * 6;
    const dofs2 = el.n2 * 6;
    const dofMap = [
      dofs1, dofs1 + 1, dofs1 + 2, dofs1 + 3, dofs1 + 4, dofs1 + 5,
      dofs2, dofs2 + 1, dofs2 + 2, dofs2 + 3, dofs2 + 4, dofs2 + 5,
    ];

    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        madd(Kglobal, nDof, dofMap[i], dofMap[j], mget(TtKT, 12, i, j));
      }
    }

    // ------------------------------------------
    // Belastingsvector: thermische kracht (per-element α en E)
    // ------------------------------------------
    const dT = (Toper - Tinstall) * loadCase.tDifF;
    const Ftherm = -elMat.E * geo.As * elMat.alpha * dT;

    const Flocal = zvec(12);
    Flocal[0] = Ftherm;
    Flocal[6] = -Ftherm;

    // ------------------------------------------
    // Belastingsvector: inwendige druk eindkracht
    // ------------------------------------------
    const Fpress = -Pi * loadCase.pressF * geo.Ab;
    Flocal[0] += Fpress;
    Flocal[6] += -Fpress;

    // ------------------------------------------
    // Belastingsvector: eigengewicht
    // gloadF = zwaartekracht factor (1 = aan)
    // Eigengewicht werkt in globale -z richting.
    // Projecteer op lokale assen via T-matrix, dan als verdeelde last op balk.
    // ------------------------------------------
    if (loadCase.gloadF > 0) {
      const w = elMat.density * 9.81e-9 * geo.As * loadCase.gloadF; // N/mm
      // Globale zwaartekracht vector per lengte: [0, 0, -w]
      // Projectie op lokale assen: q_local = T · q_global
      // T rij 0 = [lx, ly, lz] → q_local_x = lz * (-w) (axiaal component)
      // T rij 1 = [yx, yy, yz] → q_local_y = yz * (-w) (lateraal)
      // T rij 2 = [zx, zy, zz] → q_local_z = zz * (-w) (verticaal in lokaal)
      const qx = mget(T, 12, 0, 2) * (-w); // lokale axiale component
      const qy = mget(T, 12, 1, 2) * (-w); // lokale y-component
      const qz = mget(T, 12, 2, 2) * (-w); // lokale z-component

      // Verdeelde last op balk → equivalente knooppuntkrachten:
      // F = q * L / 2 (per einde), M = q * L² / 12 (per einde, tegengesteld)
      // Lokale DOFs: [Fx1, Fy1, Fz1, Mx1, My1, Mz1, Fx2, Fy2, Fz2, Mx2, My2, Mz2]

      // Axiale verdeelde last (qx) → alleen axiaalkrachten
      Flocal[0] += qx * L / 2;
      Flocal[6] += qx * L / 2;

      // Laterale verdeelde last (qy) → dwarskrachten + momenten om z-as
      Flocal[1] += qy * L / 2;
      Flocal[7] += qy * L / 2;
      Flocal[5] += qy * L * L / 12;   // Mz1
      Flocal[11] += -qy * L * L / 12;  // Mz2

      // Verticale verdeelde last (qz) → dwarskrachten + momenten om y-as
      Flocal[2] += qz * L / 2;
      Flocal[8] += qz * L / 2;
      Flocal[4] += -qz * L * L / 12;   // My1 (teken: -qz voor consistentie met balktheorie)
      Flocal[10] += qz * L * L / 12;    // My2

      // DEBUG eigengewicht
      if (typeof console !== "undefined" && ei === 0) {
        console.log(`[FEM] Eigengewicht el0: w=${w.toFixed(4)}, L=${L.toFixed(0)}, qz=${qz.toFixed(6)}, Flocal[2]=${Flocal[2].toFixed(1)}, density=${elMat.density}, As=${geo.As.toFixed(0)}`);
      }
    }

    // Transformeer lokale krachten naar globaal
    const FglobalEl = zvec(12);
    for (let i = 0; i < 12; i++) {
      let s = 0;
      for (let j = 0; j < 12; j++) s += mget(Tt, 12, i, j) * Flocal[j];
      FglobalEl[i] = s;
    }

    for (let i = 0; i < 12; i++) {
      Fglobal[dofMap[i]] += FglobalEl[i];
    }

    elData.push({ T, Klocal, L, geo, flexFactor, sif, elMat });
  }

  // =====================================================
  // Stap 2: Zakking als opgelegde verplaatsing (SUBSIDE)
  // =====================================================
  if (loadCase.setlF > 0) {
    for (const node of nodes) {
      const sub = subsideMap[node.id];
      if (!sub || sub.subzMax === 0) continue;
      const dofZ = useNodes.indexOf(node) * 6 + 2; // uz DOF
      const delta = sub.subzMax * sub.uncF * loadCase.setlF; // mm
      // Strafmethode: voeg grote veerstijfheid toe en bijbehorende kracht
      const kPenalty = 1e12;
      madd(Kglobal, nDof, dofZ, dofZ, kPenalty);
      Fglobal[dofZ] += kPenalty * delta;
    }
  }

  // =====================================================
  // Stap 3: Grondveren — bilineair model (Prioriteit 1)
  // Richting-afhankelijk: kies k op basis van verplaatsingsrichting
  // In plastisch bereik: constante reactiekracht R_max
  // =====================================================
  for (const sd of soilNodeData) {
    const baseDof = sd.baseDof;

    // Horizontaal x: gebruik effectieve stijfheid (aangepast in vorige iteratie)
    madd(Kglobal, nDof, baseDof + 0, baseDof + 0, sd.kx_eff);

    // Horizontaal y
    madd(Kglobal, nDof, baseDof + 1, baseDof + 1, sd.ky_eff);

    // Verticaal z: richting-afhankelijk (kz_down of kz_up)
    madd(Kglobal, nDof, baseDof + 2, baseDof + 2, sd.kz_eff);

    // Axiaal (wrijving) — als beschikbaar
    if (sd.kax_eff > 0) {
      madd(Kglobal, nDof, baseDof + 0, baseDof + 0, sd.kax_eff * 0.1); // deeltje via axiale as
    }

    // Plastische grondreactie als equivalente kracht
    if (sd.isPlastic_x) {
      const ux = U[baseDof + 0];
      const sign = ux >= 0 ? 1 : -1;
      Fglobal[baseDof + 0] -= sign * sd.rMaxSide;
    }
    if (sd.isPlastic_y) {
      const uy = U[baseDof + 1];
      const sign = uy >= 0 ? 1 : -1;
      Fglobal[baseDof + 1] -= sign * sd.rMaxSide;
    }
    if (sd.isPlastic_z) {
      const uz = U[baseDof + 2];
      const sign = uz >= 0 ? 1 : -1;
      const rMax = uz >= 0 ? sd.rMaxUp : sd.rMaxDown;
      Fglobal[baseDof + 2] -= sign * rMax;
    }
  }

  // =====================================================
  // Stap 3b: Steunpunten als extra veerstijfheden (Prioriteit 5)
  // =====================================================
  for (const sup of supportSprings) {
    const nodeIdx = useNodes.findIndex(n => n.id === sup.nodeId);
    if (nodeIdx < 0) continue;
    const baseDof = nodeIdx * 6;

    if (sup.type === "fixed" || sup.type === "anchor") {
      for (let d = 0; d < 6; d++) madd(Kglobal, nDof, baseDof + d, baseDof + d, 1e15);
    } else if (sup.type === "guided") {
      for (let d = 0; d < 3; d++) madd(Kglobal, nDof, baseDof + d, baseDof + d, 1e15);
    } else if (sup.type === "spring") {
      if (sup.kx) madd(Kglobal, nDof, baseDof + 0, baseDof + 0, sup.kx);
      if (sup.ky) madd(Kglobal, nDof, baseDof + 1, baseDof + 1, sup.ky);
      if (sup.kz) madd(Kglobal, nDof, baseDof + 2, baseDof + 2, sup.kz);
      if (sup.krx) madd(Kglobal, nDof, baseDof + 3, baseDof + 3, sup.krx);
      if (sup.kry) madd(Kglobal, nDof, baseDof + 4, baseDof + 4, sup.kry);
      if (sup.krz) madd(Kglobal, nDof, baseDof + 5, baseDof + 5, sup.krz);
    }
  }

  // =====================================================
  // Stap 4: Randvoorwaarden
  // =====================================================
  const bcMap = new Map(boundaryConditions.map(bc => [bc.nodeId, bc]));

  for (const bc of boundaryConditions) {
    const nodeIdx = useNodes.findIndex(n => n.id === bc.nodeId);
    if (nodeIdx < 0) continue;
    const baseDof = nodeIdx * 6;

    if (bc.type === "fixed" || bc.type === "anchor") {
      // Alle 6 DOFs vastzetten via strafmethode
      for (let d = 0; d < 6; d++) {
        const dof = baseDof + d;
        madd(Kglobal, nDof, dof, dof, 1e15);
        // F blijft 0 → verplaatsing = 0
      }
    } else if (bc.type === "guided") {
      // Alleen translaties vast, rotaties vrij
      for (let d = 0; d < 3; d++) {
        madd(Kglobal, nDof, baseDof + d, baseDof + d, 1e15);
      }
    } else if (bc.type === "spring") {
      // Verenstijfheden toevoegen aan diagonaal
      if (bc.kx) madd(Kglobal, nDof, baseDof + 0, baseDof + 0, bc.kx);
      if (bc.ky) madd(Kglobal, nDof, baseDof + 1, baseDof + 1, bc.ky);
      if (bc.kz) madd(Kglobal, nDof, baseDof + 2, baseDof + 2, bc.kz);
      if (bc.krx) madd(Kglobal, nDof, baseDof + 3, baseDof + 3, bc.krx);
      if (bc.kry) madd(Kglobal, nDof, baseDof + 4, baseDof + 4, bc.kry);
      if (bc.krz) madd(Kglobal, nDof, baseDof + 5, baseDof + 5, bc.krz);
    } else if (bc.type === "infin") {
      // INFIN: half-oneindige balk (Hetényi 1946)
      // Bereken equivalente veerstijfheden uit buiseigenschappen en grondveerconstanten
      const node = useNodes[nodeIdx];
      const D_node = node.D || 139.7;
      const t_node = node.t || 3.6;
      const DPE_node = node.DPE || D_node * 1.6;
      const geoNode = calcGeomSection(D_node, t_node);
      const elMat_node = usePerElementMaterials?.get(0) || mat;

      // Grondveerstijfheden: uit BC data of fallback naar gemiddelde van soilNodeData
      let sKh = bc.soilKh || 0;
      let sKv = bc.soilKv || 0;
      let sKax = bc.soilKaxial || 0;
      if (sKh === 0 && soilNodeData.length > 0) {
        // Gebruik gemiddelde grondveerwaarde van de dichtstbijzijnde node
        const nearest = soilNodeData.reduce((a, b) =>
          Math.abs(b.nodeIdx - nodeIdx) < Math.abs(a.nodeIdx - nodeIdx) ? b : a
        );
        sKh = nearest.kx / (nearest.DPE * nearest.influenceLength);
        sKv = nearest.kz_down / (nearest.DPE * nearest.influenceLength);
        sKax = (nearest.kax_eff || sKh * 0.5) / (nearest.DPE * nearest.influenceLength);
      }
      // Fallback als er helemaal geen gronddata is
      if (sKh === 0) sKh = 5.0;    // N/mm² (zand, default)
      if (sKv === 0) sKv = 10.0;
      if (sKax === 0) sKax = 2.5;

      const infinSprings = calcInfinSpring(
        elMat_node.E, geoNode.I, geoNode.As, D_node, DPE_node,
        sKh, sKv, sKax
      );

      // Voeg Hetényi-veerstijfheden toe aan globale stijfheidsmatrix
      // Let op: de richting moet getransformeerd worden naar globale coördinaten
      // Voor nu: neem aan dat de lokale richting gelijk is aan de globale
      // (dit is een goede benadering voor rechte eindstukken)
      madd(Kglobal, nDof, baseDof + 0, baseDof + 0, infinSprings.kx);
      madd(Kglobal, nDof, baseDof + 1, baseDof + 1, infinSprings.ky);
      madd(Kglobal, nDof, baseDof + 2, baseDof + 2, infinSprings.kz);
      madd(Kglobal, nDof, baseDof + 3, baseDof + 3, infinSprings.krx);
      madd(Kglobal, nDof, baseDof + 4, baseDof + 4, infinSprings.kry);
      madd(Kglobal, nDof, baseDof + 5, baseDof + 5, infinSprings.krz);

      // Koppelterm (Hetényi): laterale verplaatsing ↔ rotatie
      // k_cross = 2 × E × I × β²  — voeg toe als off-diagonal termen
      const beta = Math.pow((sKh + sKv) / 2 * DPE_node / (4 * elMat_node.E * geoNode.I), 0.25);
      const k_cross = 2 * elMat_node.E * geoNode.I * beta * beta;
      // uy ↔ rz koppeling
      madd(Kglobal, nDof, baseDof + 1, baseDof + 5, -k_cross);
      madd(Kglobal, nDof, baseDof + 5, baseDof + 1, -k_cross);
      // uz ↔ ry koppeling
      madd(Kglobal, nDof, baseDof + 2, baseDof + 4, k_cross);
      madd(Kglobal, nDof, baseDof + 4, baseDof + 2, k_cross);
    }
    // "free" = niets doen (default)
  }

  // Als er geen randvoorwaarden zijn opgegeven, fixeer het eerste en laatste knooppunt
  // als standaard ingeklemd (PLE4Win default voor eindpunten)
  if (boundaryConditions.length === 0 && nNodes >= 2) {
    for (const idx of [0, nNodes - 1]) {
      const baseDof = idx * 6;
      for (let d = 0; d < 6; d++) {
        madd(Kglobal, nDof, baseDof + d, baseDof + d, 1e15);
      }
    }
  }

  // =====================================================
  // Stap 5: Oplossen K · u = F
  // =====================================================
  const Kcopy = new Float64Array(Kglobal);
  const Fcopy = new Float64Array(Fglobal);

  try {
    solveLinear(Kcopy, Fcopy, nDof);
  } catch {
    converged = false;
  }

  U = Fcopy; // na solve bevat F de oplossing u

  // DEBUG: log max displacement after first solve
  if (typeof console !== "undefined" && iteration === 0) {
    let maxU = 0, maxUi = 0;
    for (let i = 0; i < nDof; i++) { if (Math.abs(U[i]) > maxU) { maxU = Math.abs(U[i]); maxUi = i; } }
    const nodeI = Math.floor(maxUi / 6);
    const dofI = maxUi % 6;
    const dofNames = ['ux','uy','uz','rx','ry','rz'];
    console.log(`[FEM] After first solve: maxU=${maxU.toFixed(2)} at node ${nodeI} DOF ${dofNames[dofI]}, nDof=${nDof}`);
    // Check diagonal of K for soil contribution
    if (soilNodeData.length > 0) {
      const sd0 = soilNodeData[0];
      console.log(`[FEM] K diagonal at soil node ${sd0.nodeIdx}: K[ux]=${Kglobal[sd0.baseDof * nDof + sd0.baseDof].toFixed(1)}, K[uz]=${Kglobal[(sd0.baseDof+2) * nDof + (sd0.baseDof+2)].toFixed(1)}`);
      console.log(`[FEM] F at soil node ${sd0.nodeIdx}: F[ux]=${Fglobal[sd0.baseDof].toFixed(1)}, F[uz]=${Fglobal[sd0.baseDof+2].toFixed(1)}`);
    }
  }

  // Controleer op NaN/Inf en divergentie
  let maxDisp = 0;
  for (let i = 0; i < nDof; i++) {
    if (!Number.isFinite(U[i])) { U[i] = 0; converged = false; }
    if (Math.abs(U[i]) > maxDisp) maxDisp = Math.abs(U[i]);
  }
  // Divergentie-detectie: als verplaatsingen > 1e6 mm (1 km), solver is ontspoord
  if (maxDisp > 1e6) {
    converged = false;
    soilConverged = true; // stop iteratie
    break;
  }

  // =====================================================
  // Stap 5b: Convergentiecheck grondmodel (bilineair of tanh)
  // =====================================================
  if (soilNodeData.length === 0) {
    soilConverged = true;
    break;
  }

  let anyChanged = false;
  for (const sd of soilNodeData) {
    const ux = U[sd.baseDof + 0];
    const uy = U[sd.baseDof + 1];
    const uz = U[sd.baseDof + 2];

    if (sd.curveType === "tanh") {
      // Tanh curve: effectieve stijfheid = dR/dδ bij huidige verplaatsing
      const kxNew = tanhEffectiveStiffness(sd.kx, sd.rMaxSide, ux);
      const kyNew = tanhEffectiveStiffness(sd.ky, sd.rMaxSide, uy);
      const kzDir = uz >= 0 ? sd.kz_up : sd.kz_down;
      const rMaxZ = uz >= 0 ? sd.rMaxUp : sd.rMaxDown;
      const kzNew = tanhEffectiveStiffness(kzDir, rMaxZ, uz);

      if (Math.abs(kxNew - sd.kx_eff) / Math.max(sd.kx_eff, 1) > 0.01) { sd.kx_eff = kxNew; anyChanged = true; }
      if (Math.abs(kyNew - sd.ky_eff) / Math.max(sd.ky_eff, 1) > 0.01) { sd.ky_eff = kyNew; anyChanged = true; }
      if (Math.abs(kzNew - sd.kz_eff) / Math.max(sd.kz_eff, 1) > 0.01) { sd.kz_eff = kzNew; anyChanged = true; }

      // Grondreacties = tanh(k·δ/Rmax) × Rmax
      sd.reactionX = tanhSoilReaction(sd.kx, sd.rMaxSide, ux);
      sd.reactionY = tanhSoilReaction(sd.ky, sd.rMaxSide, uy);
      sd.reactionZ = tanhSoilReaction(kzDir, rMaxZ, uz);
    } else {
      // Bilineair: scherpe knik bij R_max
      const rxForce = sd.kx_eff * Math.abs(ux);
      if (rxForce > sd.rMaxSide && !sd.isPlastic_x) {
        sd.isPlastic_x = true;
        sd.kx_eff = Math.abs(ux) > 1e-6 ? sd.rMaxSide / Math.abs(ux) : sd.kx;
        anyChanged = true;
      } else if (rxForce < sd.rMaxSide * 0.95 && sd.isPlastic_x) {
        sd.isPlastic_x = false; sd.kx_eff = sd.kx; anyChanged = true;
      }

      const ryForce = sd.ky_eff * Math.abs(uy);
      if (ryForce > sd.rMaxSide && !sd.isPlastic_y) {
        sd.isPlastic_y = true;
        sd.ky_eff = Math.abs(uy) > 1e-6 ? sd.rMaxSide / Math.abs(uy) : sd.ky;
        anyChanged = true;
      } else if (ryForce < sd.rMaxSide * 0.95 && sd.isPlastic_y) {
        sd.isPlastic_y = false; sd.ky_eff = sd.ky; anyChanged = true;
      }

      const kz_dir = uz >= 0 ? sd.kz_up : sd.kz_down;
      const rMaxZ = uz >= 0 ? sd.rMaxUp : sd.rMaxDown;
      const rzForce = sd.kz_eff * Math.abs(uz);
      if (rzForce > rMaxZ && !sd.isPlastic_z) {
        sd.isPlastic_z = true;
        sd.kz_eff = Math.abs(uz) > 1e-6 ? rMaxZ / Math.abs(uz) : kz_dir;
        anyChanged = true;
      } else if (rzForce < rMaxZ * 0.95 && sd.isPlastic_z) {
        sd.isPlastic_z = false; sd.kz_eff = kz_dir; anyChanged = true;
      }

      // Grondreacties (bilineair)
      sd.reactionX = sd.kx_eff * ux;
      sd.reactionY = sd.ky_eff * uy;
      sd.reactionZ = sd.kz_eff * uz;
    }
  }

  if (!anyChanged) {
    soilConverged = true;
    break;
  }

  } // einde bilineaire iteratie-lus

  // Als er geen grondveren waren, doe een enkele solve
  if (soilNodeData.length === 0 && iteration === 0) {
    // Al opgelost in eerste iteratie
  }

  // =====================================================
  // Stap 5c: Geometrisch niet-lineaire iteratie (2e orde)
  // P-δ effect: axiaalkrachten beïnvloeden laterale stijfheid
  // =====================================================
  let geoIterations = 0;
  let geoConverged = !geometricNonlinear; // als lineair: direct geconvergeerd

  if (geometricNonlinear && converged) {
    // Bereken initiële elementkrachten voor Kg
    const getAxialForces = (): number[] => {
      const forces: number[] = [];
      for (let ei = 0; ei < useElements.length; ei++) {
        const el = useElements[ei];
        const ed = elData[ei];
        if (!ed || ed.L < 0.01) { forces.push(0); continue; }
        const dofs1 = el.n1 * 6;
        const dofs2 = el.n2 * 6;
        const Ug = zvec(12);
        for (let i = 0; i < 6; i++) { Ug[i] = U[dofs1 + i]; Ug[i + 6] = U[dofs2 + i]; }
        const Ulocal = zvec(12);
        mvmul(ed.T, 12, Ug, Ulocal);
        const Flocal = zvec(12);
        mvmul(ed.Klocal, 12, Ulocal, Flocal);
        forces.push(Flocal[0]); // Fx1 = axiaalkracht
      }
      return forces;
    };

    let Uprev = new Float64Array(U);

    for (geoIterations = 0; geoIterations < maxGeoIterations; geoIterations++) {
      const axialForces = getAxialForces();

      // Herbouw K + Kg op de vervormde geometrie
      const Kgeo = zeros(nDof);
      const Fgeo = zvec(nDof);

      // Kopieer de laatste K assemblage (uit de soil iteration)
      // We herbouwen volledig met updated coördinaten
      elData = [];

      for (let ei = 0; ei < useElements.length; ei++) {
        const el = useElements[ei];
        const n1 = useNodes[el.n1];
        const n2 = useNodes[el.n2];
        if (!n1 || !n2) continue;

        const D_el = el.d || 139.7;
        const t_el = el.t || 3.6;
        const geo = calcGeomSection(D_el, t_el);
        const elMat = usePerElementMaterials?.get(ei) || mat;
        const G = elMat.E / (2 * (1 + elMat.poisson));

        // Vervormde coördinaten
        const x1d = n1.x + U[el.n1 * 6 + 0];
        const y1d = n1.y + U[el.n1 * 6 + 1];
        const z1d = (n1.z || 0) + U[el.n1 * 6 + 2];
        const x2d = n2.x + U[el.n2 * 6 + 0];
        const y2d = n2.y + U[el.n2 * 6 + 1];
        const z2d = (n2.z || 0) + U[el.n2 * 6 + 2];

        const dx = x2d - x1d, dy = y2d - y1d, dz = z2d - z1d;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 0.01) {
          elData.push({ T: zeros(12), Klocal: zeros(12), L: 0, geo, flexFactor: 1, sif: 1, elMat });
          continue;
        }

        let flexFactor = 1.0, sif = 1.0;
        if (el.type === "bend" && el.R && el.R > 0) {
          flexFactor = calcBendFlexFactor(D_el, t_el, el.R, Pi * loadCase.pressF, elMat.E);
          sif = calcBendSIF(D_el, t_el, el.R);
        } else if (el.type === "tee") {
          const n1Id = useNodes[el.n1]?.id || "";
          const n2Id = useNodes[el.n2]?.id || "";
          const teeRef = teeNodeMap[n1Id] || teeNodeMap[n2Id] || "";
          const spec = teeSpecs[teeRef];
          if (spec) { sif = calcTeeSIF(spec.dRun, spec.tRun, spec.dBrn, spec.tBrn, spec.type, spec.te).sifRun; }
          else { sif = calcTeeSIF(D_el, t_el, D_el * 0.7, t_el, "Welded", 0).sifRun; }
        }

        // Materiële stijfheidsmatrix
        const Klocal = buildLocalK(elMat.E, G, geo.As, geo.I, geo.I, geo.J, L, flexFactor);

        // Geometrische stijfheidsmatrix (P-δ)
        const Naxial = axialForces[ei] || 0;
        const KgLocal = buildGeometricK(Naxial, L);

        // Tel Kg op bij Klocal
        for (let i = 0; i < 144; i++) Klocal[i] += KgLocal[i];

        // Transformatiematrix op vervormde geometrie
        const T = buildTransformMatrix(x1d, y1d, z1d, x2d, y2d, z2d);
        const Tt = mtranspose(T, 12);
        const KT = mmmul(Klocal, T, 12);
        const TtKT = mmmul(Tt, KT, 12);

        const dofs1 = el.n1 * 6;
        const dofs2 = el.n2 * 6;
        const dofMap = [
          dofs1, dofs1 + 1, dofs1 + 2, dofs1 + 3, dofs1 + 4, dofs1 + 5,
          dofs2, dofs2 + 1, dofs2 + 2, dofs2 + 3, dofs2 + 4, dofs2 + 5,
        ];

        for (let i = 0; i < 12; i++)
          for (let j = 0; j < 12; j++)
            madd(Kgeo, nDof, dofMap[i], dofMap[j], mget(TtKT, 12, i, j));

        // Belastingsvector (zelfde als lineair — krachten veranderen niet)
        const dT_val = (Toper - Tinstall) * loadCase.tDifF;
        const Ftherm = -elMat.E * geo.As * elMat.alpha * dT_val;
        const Fpress = -Pi * loadCase.pressF * geo.Ab;
        const Floc = zvec(12);
        Floc[0] = Ftherm + Fpress;
        Floc[6] = -Ftherm - Fpress;

        if (loadCase.deadwF > 0 && loadCase.gloadF > 0) {
          const w = elMat.density * 9.81e-9 * geo.As * loadCase.gloadF * loadCase.deadwF;
          Fgeo[dofs1 + 2] += -w * L / 2;
          Fgeo[dofs2 + 2] += -w * L / 2;
        }

        const FgEl = zvec(12);
        for (let i = 0; i < 12; i++) {
          let s = 0;
          for (let j = 0; j < 12; j++) s += mget(Tt, 12, i, j) * Floc[j];
          FgEl[i] = s;
        }
        for (let i = 0; i < 12; i++) Fgeo[dofMap[i]] += FgEl[i];

        elData.push({ T, Klocal, L, geo, flexFactor, sif, elMat });
      }

      // Grondveren opnieuw toevoegen
      for (const sd of soilNodeData) {
        madd(Kgeo, nDof, sd.baseDof + 0, sd.baseDof + 0, sd.kx_eff);
        madd(Kgeo, nDof, sd.baseDof + 1, sd.baseDof + 1, sd.ky_eff);
        madd(Kgeo, nDof, sd.baseDof + 2, sd.baseDof + 2, sd.kz_eff);
      }

      // Randvoorwaarden opnieuw toepassen
      for (const bc of boundaryConditions) {
        const nodeIdx = useNodes.findIndex(n => n.id === bc.nodeId);
        if (nodeIdx < 0) continue;
        const baseDof = nodeIdx * 6;
        if (bc.type === "fixed" || bc.type === "anchor") {
          for (let d = 0; d < 6; d++) madd(Kgeo, nDof, baseDof + d, baseDof + d, 1e15);
        } else if (bc.type === "guided") {
          for (let d = 0; d < 3; d++) madd(Kgeo, nDof, baseDof + d, baseDof + d, 1e15);
        } else if (bc.type === "spring") {
          if (bc.kx) madd(Kgeo, nDof, baseDof + 0, baseDof + 0, bc.kx);
          if (bc.ky) madd(Kgeo, nDof, baseDof + 1, baseDof + 1, bc.ky);
          if (bc.kz) madd(Kgeo, nDof, baseDof + 2, baseDof + 2, bc.kz);
        } else if (bc.type === "infin") {
          const node = useNodes[nodeIdx];
          const geoNode = calcGeomSection(node.D || 139.7, node.t || 3.6);
          const DPE_n = node.DPE || (node.D || 139.7) * 1.6;
          const nearSoil = soilNodeData.length > 0 ? soilNodeData[0] : null;
          const sKh = nearSoil ? nearSoil.kx / (nearSoil.DPE * nearSoil.influenceLength) : 5;
          const sKv = nearSoil ? nearSoil.kz_down / (nearSoil.DPE * nearSoil.influenceLength) : 10;
          const inf = calcInfinSpring(mat.E, geoNode.I, geoNode.As, node.D || 139.7, DPE_n, sKh, sKv, sKh * 0.5);
          madd(Kgeo, nDof, baseDof + 0, baseDof + 0, inf.kx);
          madd(Kgeo, nDof, baseDof + 1, baseDof + 1, inf.ky);
          madd(Kgeo, nDof, baseDof + 2, baseDof + 2, inf.kz);
          madd(Kgeo, nDof, baseDof + 3, baseDof + 3, inf.krx);
          madd(Kgeo, nDof, baseDof + 4, baseDof + 4, inf.kry);
          madd(Kgeo, nDof, baseDof + 5, baseDof + 5, inf.krz);
        }
      }
      if (boundaryConditions.length === 0 && nNodes >= 2) {
        for (const idx of [0, nNodes - 1]) {
          const baseDof = idx * 6;
          for (let d = 0; d < 6; d++) madd(Kgeo, nDof, baseDof + d, baseDof + d, 1e15);
        }
      }

      // Oplossen
      try {
        solveLinear(Kgeo, Fgeo, nDof);
      } catch {
        converged = false;
        break;
      }
      U = Fgeo;

      let geoMaxDisp = 0;
      for (let i = 0; i < nDof; i++) {
        if (!Number.isFinite(U[i])) { U[i] = 0; converged = false; }
        if (Math.abs(U[i]) > geoMaxDisp) geoMaxDisp = Math.abs(U[i]);
      }
      if (geoMaxDisp > 1e6) { converged = false; break; }

      // Convergentiecheck: relatieve verandering in verplaatsingen
      let maxDelta = 0, maxU = 0;
      for (let i = 0; i < nDof; i++) {
        const delta = Math.abs(U[i] - Uprev[i]);
        if (delta > maxDelta) maxDelta = delta;
        if (Math.abs(U[i]) > maxU) maxU = Math.abs(U[i]);
      }

      // Check rotatie limiet (PLE4Win module N: max 0.3 rad)
      let rotationExceeded = false;
      for (let ni = 0; ni < nNodes; ni++) {
        for (let d = 3; d < 6; d++) {
          if (Math.abs(U[ni * 6 + d]) > maxRotation) {
            rotationExceeded = true;
            break;
          }
        }
        if (rotationExceeded) break;
      }
      if (rotationExceeded) {
        converged = false;
        break;
      }

      const relChange = maxU > 1e-10 ? maxDelta / maxU : maxDelta;
      Uprev = new Float64Array(U);

      if (relChange < geoConvergenceTol) {
        geoConverged = true;
        geoIterations++;
        break;
      }
    }
  }

  // =====================================================
  // Stap 5d: Materiaal niet-lineaire iteratie (M0)
  // Elasto-plastisch: yielding reduceert elementstijfheid
  // =====================================================
  let matIterations = 0;
  let matConverged = !materialNonlinear;
  let yieldedElementCount = 0;
  let maxPlasticStrain = 0;
  let localBuckledCount = 0;

  // Per-element plastische toestand
  const elementPlasticState: { yielded: boolean; effectiveE: number; maxStrain: number; plasticStrain: number; buckled: boolean }[] =
    useElements.map(() => ({ yielded: false, effectiveE: mat.E, maxStrain: 0, plasticStrain: 0, buckled: false }));

  if (materialNonlinear && converged) {
    for (matIterations = 0; matIterations < maxMatIterations; matIterations++) {
      // 1) Bereken rekken per element uit huidige verplaatsingen
      let anyYieldChanged = false;

      for (let ei = 0; ei < useElements.length; ei++) {
        const el = useElements[ei];
        const ed = elData[ei];
        if (!ed || ed.L < 0.01) continue;

        const elMat = usePerElementMaterials?.get(ei) || mat;
        const D_el = el.d || 139.7;
        const t_el = el.t || 3.6;
        const geo = ed.geo;

        // Lokale krachten uit huidige U
        const dofs1 = el.n1 * 6, dofs2 = el.n2 * 6;
        const Ug = zvec(12);
        for (let i = 0; i < 6; i++) { Ug[i] = U[dofs1 + i]; Ug[i + 6] = U[dofs2 + i]; }
        const Ulocal = zvec(12);
        mvmul(ed.T, 12, Ug, Ulocal);
        const Flocal = zvec(12);
        mvmul(ed.Klocal, 12, Ulocal, Flocal);

        // Axiaalrek = Δu_x / L
        const epsAxial = ed.L > 0 ? (Ulocal[6] - Ulocal[0]) / ed.L : 0;

        // Buigrek = M × y / (E × I), max bij buitenwand (y = D/2)
        const My = Math.max(Math.abs(Flocal[4]), Math.abs(Flocal[10]));
        const Mz = Math.max(Math.abs(Flocal[5]), Math.abs(Flocal[11]));
        const Mresultant = Math.sqrt(My * My + Mz * Mz);
        const epsBend = geo.I > 0 ? (Mresultant * (D_el / 2)) / (elMat.E * geo.I) : 0;

        // Totale rek (maximaal over de doorsnede)
        const epsTotal = Math.abs(epsAxial) + epsBend;
        const epsYield = elMat.epsYield ?? elMat.SMYS / elMat.E;

        const prevState = elementPlasticState[ei];
        const wasYielded = prevState.yielded;

        if (epsTotal > epsYield && !wasYielded) {
          // Element begint te vloeien → verlaag stijfheid
          const Etan = elMat.Etan ?? elMat.E / 100;
          elementPlasticState[ei] = {
            yielded: true,
            effectiveE: Etan,
            maxStrain: epsTotal,
            plasticStrain: epsTotal - epsYield,
            buckled: epsAxial < -(D_el > 0 ? t_el / D_el : 0.05),
          };
          anyYieldChanged = true;
        } else if (epsTotal <= epsYield * 0.9 && wasYielded) {
          // Elastisch ontlast
          elementPlasticState[ei] = {
            yielded: false,
            effectiveE: elMat.E,
            maxStrain: epsTotal,
            plasticStrain: prevState.plasticStrain, // permanente rek blijft
            buckled: false,
          };
          anyYieldChanged = true;
        } else {
          elementPlasticState[ei].maxStrain = epsTotal;
          if (wasYielded) {
            elementPlasticState[ei].plasticStrain = Math.max(prevState.plasticStrain, epsTotal - epsYield);
          }
        }
      }

      if (!anyYieldChanged) {
        matConverged = true;
        matIterations++;
        break;
      }

      // 2) Herbouw stijfheidsmatrix met aangepaste E per element
      const KmatNL = zeros(nDof);
      const FmatNL = zvec(nDof);
      elData = [];

      for (let ei = 0; ei < useElements.length; ei++) {
        const el = useElements[ei];
        const n1 = useNodes[el.n1], n2 = useNodes[el.n2];
        if (!n1 || !n2) continue;

        const D_el = el.d || 139.7;
        const t_el = el.t || 3.6;
        const geo = calcGeomSection(D_el, t_el);
        const elMat = usePerElementMaterials?.get(ei) || mat;
        const ps = elementPlasticState[ei];

        // Gebruik effectieve E (verlaagd als element is gevloeid)
        const Eeff = ps.yielded ? ps.effectiveE : elMat.E;
        const G = Eeff / (2 * (1 + elMat.poisson));

        const x1 = n1.x, y1 = n1.y, z1 = n1.z || 0;
        const x2 = n2.x, y2 = n2.y, z2 = n2.z || 0;
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 0.01) {
          elData.push({ T: zeros(12), Klocal: zeros(12), L: 0, geo, flexFactor: 1, sif: 1, elMat });
          continue;
        }

        let flexFactor = 1.0, sif = 1.0;
        if (el.type === "bend" && el.R && el.R > 0) {
          flexFactor = calcBendFlexFactor(D_el, t_el, el.R, Pi * loadCase.pressF, Eeff);
          sif = calcBendSIF(D_el, t_el, el.R);
        } else if (el.type === "tee") {
          const n1Id = useNodes[el.n1]?.id || "";
          const n2Id = useNodes[el.n2]?.id || "";
          const teeRef = teeNodeMap[n1Id] || teeNodeMap[n2Id] || "";
          const spec = teeSpecs[teeRef];
          if (spec) { sif = calcTeeSIF(spec.dRun, spec.tRun, spec.dBrn, spec.tBrn, spec.type, spec.te).sifRun; }
          else { sif = calcTeeSIF(D_el, t_el, D_el * 0.7, t_el, "Welded", 0).sifRun; }
        }

        const Klocal = buildLocalK(Eeff, G, geo.As, geo.I, geo.I, geo.J, L, flexFactor);
        const T = buildTransformMatrix(x1, y1, z1, x2, y2, z2);
        const Tt = mtranspose(T, 12);
        const KT = mmmul(Klocal, T, 12);
        const TtKT = mmmul(Tt, KT, 12);

        const dofs1 = el.n1 * 6, dofs2 = el.n2 * 6;
        const dofMap = [dofs1, dofs1+1, dofs1+2, dofs1+3, dofs1+4, dofs1+5, dofs2, dofs2+1, dofs2+2, dofs2+3, dofs2+4, dofs2+5];
        for (let i = 0; i < 12; i++)
          for (let j = 0; j < 12; j++)
            madd(KmatNL, nDof, dofMap[i], dofMap[j], mget(TtKT, 12, i, j));

        // Belastingsvector (identiek aan lineair)
        const dT_val = (Toper - Tinstall) * loadCase.tDifF;
        const Ftherm = -Eeff * geo.As * elMat.alpha * dT_val;
        const Fpress = -Pi * loadCase.pressF * geo.Ab;
        const Floc = zvec(12);
        Floc[0] = Ftherm + Fpress; Floc[6] = -Ftherm - Fpress;
        if (loadCase.deadwF > 0 && loadCase.gloadF > 0) {
          const w = elMat.density * 9.81e-9 * geo.As * loadCase.gloadF * loadCase.deadwF;
          FmatNL[dofs1 + 2] += -w * L / 2;
          FmatNL[dofs2 + 2] += -w * L / 2;
        }
        const FgEl = zvec(12);
        for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += mget(Tt, 12, i, j) * Floc[j]; FgEl[i] = s; }
        for (let i = 0; i < 12; i++) FmatNL[dofMap[i]] += FgEl[i];

        elData.push({ T, Klocal, L, geo, flexFactor, sif, elMat });
      }

      // Grondveren + BC's opnieuw toevoegen (zelfde als lineaire stap)
      for (const sd of soilNodeData) {
        madd(KmatNL, nDof, sd.baseDof + 0, sd.baseDof + 0, sd.kx_eff);
        madd(KmatNL, nDof, sd.baseDof + 1, sd.baseDof + 1, sd.ky_eff);
        madd(KmatNL, nDof, sd.baseDof + 2, sd.baseDof + 2, sd.kz_eff);
      }
      for (const bc of boundaryConditions) {
        const nodeIdx = useNodes.findIndex(n => n.id === bc.nodeId);
        if (nodeIdx < 0) continue;
        const baseDof = nodeIdx * 6;
        if (bc.type === "fixed" || bc.type === "anchor") {
          for (let d = 0; d < 6; d++) madd(KmatNL, nDof, baseDof + d, baseDof + d, 1e15);
        } else if (bc.type === "spring") {
          if (bc.kx) madd(KmatNL, nDof, baseDof + 0, baseDof + 0, bc.kx);
          if (bc.ky) madd(KmatNL, nDof, baseDof + 1, baseDof + 1, bc.ky);
          if (bc.kz) madd(KmatNL, nDof, baseDof + 2, baseDof + 2, bc.kz);
        }
      }
      if (boundaryConditions.length === 0 && nNodes >= 2) {
        for (const idx of [0, nNodes - 1]) {
          const bd = idx * 6;
          for (let d = 0; d < 6; d++) madd(KmatNL, nDof, bd + d, bd + d, 1e15);
        }
      }

      // Oplossen
      try { solveLinear(KmatNL, FmatNL, nDof); } catch { converged = false; break; }
      U = FmatNL;
      let matMaxDisp = 0;
      for (let i = 0; i < nDof; i++) {
        if (!Number.isFinite(U[i])) { U[i] = 0; converged = false; }
        if (Math.abs(U[i]) > matMaxDisp) matMaxDisp = Math.abs(U[i]);
      }
      if (matMaxDisp > 1e6) { converged = false; break; }
    }

    // Statistieken
    yieldedElementCount = elementPlasticState.filter(s => s.yielded).length;
    maxPlasticStrain = Math.max(...elementPlasticState.map(s => s.plasticStrain));
    localBuckledCount = elementPlasticState.filter(s => s.buckled).length;
  }

  // =====================================================
  // Stap 6: Terugrekenen elementkrachten en spanningen
  // =====================================================
  const elementForces: FemSolverOutput["elementForces"] = [];
  const nodeResults: NodeResult[] = [];

  // Initialiseer per-node resultaten
  const nodeMaxMy = new Float64Array(nNodes);
  const nodeMaxMz = new Float64Array(nNodes);
  const nodeMaxFx = new Float64Array(nNodes);

  for (let ei = 0; ei < useElements.length; ei++) {
    const el = useElements[ei];
    const ed = elData[ei];
    if (!ed || ed.L < 0.01) {
      elementForces.push({ elIdx: ei, Fx1: 0, Fy1: 0, Fz1: 0, Mx1: 0, My1: 0, Mz1: 0, Fx2: 0, Fy2: 0, Fz2: 0, Mx2: 0, My2: 0, Mz2: 0 });
      continue;
    }

    // Haal globale verplaatsingen voor dit element
    const dofs1 = el.n1 * 6;
    const dofs2 = el.n2 * 6;
    const Ug = zvec(12);
    for (let i = 0; i < 6; i++) {
      Ug[i] = U[dofs1 + i];
      Ug[i + 6] = U[dofs2 + i];
    }

    // Transformeer naar lokale verplaatsingen: u_local = T · u_global
    const Ulocal = zvec(12);
    mvmul(ed.T, 12, Ug, Ulocal);

    // Lokale krachten: f_local = K_local · u_local
    const Flocal = zvec(12);
    mvmul(ed.Klocal, 12, Ulocal, Flocal);

    elementForces.push({
      elIdx: ei,
      Fx1: Flocal[0], Fy1: Flocal[1], Fz1: Flocal[2],
      Mx1: Flocal[3], My1: Flocal[4], Mz1: Flocal[5],
      Fx2: Flocal[6], Fy2: Flocal[7], Fz2: Flocal[8],
      Mx2: Flocal[9], My2: Flocal[10], Mz2: Flocal[11],
    });

    // Bewaar worst-case krachten per node
    const updateNodeMax = (nodeIdx: number, fx: number, my: number, mz: number) => {
      if (Math.abs(fx) > Math.abs(nodeMaxFx[nodeIdx])) nodeMaxFx[nodeIdx] = fx;
      if (Math.abs(my) > Math.abs(nodeMaxMy[nodeIdx])) nodeMaxMy[nodeIdx] = my;
      if (Math.abs(mz) > Math.abs(nodeMaxMz[nodeIdx])) nodeMaxMz[nodeIdx] = mz;
    };

    updateNodeMax(el.n1, Flocal[0], Flocal[4], Flocal[5]);
    updateNodeMax(el.n2, Flocal[6], Flocal[10], Flocal[11]);
  }

  // =====================================================
  // Stap 7: Per-node spanningsberekening
  // =====================================================
  let maxUC = 0;
  let maxVM = 0;

  for (let ni = 0; ni < nNodes; ni++) {
    const node = useNodes[ni];
    const baseDof = ni * 6;

    // Vind het element dat bij deze node hoort (voor D, t)
    let elIdx = useElements.findIndex(e => e.n1 === ni);
    if (elIdx < 0) elIdx = useElements.findIndex(e => e.n2 === ni);
    const el = elIdx >= 0 ? useElements[elIdx] : null;
    const ed = elIdx >= 0 ? elData[elIdx] : null;

    const D = el?.d || node.D || 139.7;
    const t_w = el?.t || node.t || 3.6;
    const geo = calcGeomSection(D, t_w);

    // SIF factor
    const sif = ed?.sif || 1.0;

    // Prioriteit 4: gebruik per-element materiaal als beschikbaar
    const nodeMat = ed?.elMat || mat;

    // Hoopspanning (Barlow — onafhankelijk van FEM, puur druk)
    const sh = calcHoopStress(Pi * loadCase.pressF, D, t_w);

    // Poisson-component (per-element ν)
    const slp = nodeMat.poisson * sh;

    // Thermische spanning (per-element E en α)
    // Effectieve bedrijfstemperatuur = Tinst + (Toper - Tinst) * tDifF
    const ToperEff = Tinstall + (Toper - Tinstall) * loadCase.tDifF;
    const st = calcThermalStress(nodeMat.E, nodeMat.alpha, ToperEff, Tinstall);

    // Buigspanning uit FEM resultaten
    const My = nodeMaxMy[ni];
    const Mz = nodeMaxMz[ni];
    const Mresultant = Math.sqrt(My * My + Mz * Mz);
    const sb_raw = geo.W > 0 ? Mresultant / geo.W : 0;
    const sb = sb_raw * sif;

    // Axiaalkracht → axiaalspanning
    const Fx = nodeMaxFx[ni];
    const sa = geo.As > 0 ? Fx / geo.As : 0;

    // Totale longitudinale spanning
    const sl = sa + sb;

    // Von Mises
    const vm = calcVonMises(sh, sl);

    // Unity check (per-element SMYS)
    const { ucRing, ucVM, uc } = calcUC(sh, vm, nodeMat.SMYS, designFactor, gammaM, weldFactor);

    if (uc > maxUC) maxUC = uc;
    if (vm > maxVM) maxVM = vm;

    // ─── Ring model: 48-punts dwarsdoorsnede spanning ───
    // PLE4Win: ring model belast door NEUTRALE GRONDDRUK (niet beam grondreactie)
    // qSoilV = γ × H (verticale gronddruk in N/mm²)
    // qSoilH = K0 × γ × H (horizontale gronddruk in N/mm²)
    let qSoilV = 0, qSoilH = 0;
    const soilNode = soilNodeData.find(sd => sd.nodeIdx === ni);
    if (soilNode) {
      // Zoek de cover (dekking) voor deze node
      // De cover is impliciet: als er grondveren zijn, is er grond
      // Gebruik de neutrale gronddruk: p = γ × H
      // γ en H komen uit de soilSprings input
      // Fallback: gebruik de grondreactie Rz om de gemiddelde gronddruk te schatten
      // PLE4Win berekent SOILNB = γ × H × D (neutrale grondlast per lengte-eenheid)
      // Voor het ring model: p_v = γ × H (druk in N/mm²)
      // We gebruiken de soilSprings parameters om γ en H te reconstrueren
      
      // Benadering: de verticale grondreactie Rz = w_pipe + q_soil × L_infl
      // Bij eigengewicht-only: Rz ≈ w_pipe (eigengewicht per lengte × invloedslengte)
      // De gronddruk boven de buis is onafhankelijk van de buisverplaatsing
      
      // Gebruik de coverMap waarde of default 500mm
      const coverMm = 500; // mm (default, wordt later uit parser gehaald)
      const gamma_soil = 17; // kN/m³ (default zand)
      const K0_soil = 0.5;   // rustdruk coëfficiënt

      // Neutrale gronddruk (N/mm²)
      // γ [kN/m³] = γ × 1e-6 [N/mm³]  (want 1 kN = 1000 N, 1 m³ = 1e9 mm³)
      // p_v = γ × H = γ [kN/m³] × H [mm] × 1e-6 [N/mm³ per kN/m³ per mm]
      // Nee: γ [kN/m³] × H [m] = [kPa] = [1e-3 N/mm²]
      const H_m = coverMm / 1000; // m
      qSoilV = gamma_soil * H_m * 1e-3; // kN/m² → N/mm²
      qSoilH = K0_soil * gamma_soil * H_m * 1e-3; // N/mm²
    }

    // Torsiemoment uit elementkrachten
    let Mx = 0;
    if (elIdx >= 0 && elementForces[elIdx]) {
      Mx = Math.abs(elementForces[elIdx].Mx1);
    }

    const ring = calcRingStress(
      D, t_w, nodeMat.E, nodeMat.poisson,
      Pi * loadCase.pressF, Fx, My, Mz, Mx,
      qSoilV, qSoilH, sif
    );

    // Update UC met ring model resultaten (gebruik het maximum van beam en ring Von Mises)
    const vmRingMax = Math.max(ring.vmInnerMax, ring.vmOuterMax);
    const ucVMring = (0.85 * nodeMat.SMYS / gammaM) > 0 ? vmRingMax / (0.85 * nodeMat.SMYS / gammaM) : 0;
    const ucFinal = Math.max(ucRing, ucVM, ucVMring);

    if (ucFinal > maxUC) maxUC = ucFinal;

    // Grondreacties: hergebruik soilNode van ring model (hierboven al gedeclareerd)
    nodeResults.push({
      nodeId: node.id,
      sh, sl, vm: Math.max(vm, vmRingMax), st, sb, slp,
      Fx, My, Mz,
      ux: U[baseDof + 0],
      uy: U[baseDof + 1],
      uz: U[baseDof + 2],
      rx: U[baseDof + 3],
      ry: U[baseDof + 4],
      rz: U[baseDof + 5],
      uc: ucFinal, ucRing, ucVM: Math.max(ucVM, ucVMring),
      ring,
      soilRx: soilNode?.reactionX,
      soilRy: soilNode?.reactionY,
      soilRz: soilNode?.reactionZ,
    });
  }

  const plasticNodeCount = soilNodeData.filter(sd =>
    sd.isPlastic_x || sd.isPlastic_y || sd.isPlastic_z
  ).length;

  // Filter resultaten terug naar originele nodes (verwijder sub-nodes)
  const origNodeResults = nodeResults.filter((_, i) => subToOrigNode[i] !== undefined && subToOrigNode[i] >= 0);
  // Voor sub-nodes: neem de worst-case spanning mee naar het dichtstbijzijnde originele node
  for (let i = 0; i < nodeResults.length; i++) {
    if (subToOrigNode[i] === -1 || subToOrigNode[i] === undefined) {
      // Tussennode: zoek dichtstbijzijnde originele node en update als spanning hoger is
      // Simpele benadering: neem de vorige en volgende originele node
      const nr = nodeResults[i];
      // Zoek de aangrenzende elementen om de originele nodes te vinden
      for (const el of useElements) {
        if (el.n1 === i || el.n2 === i) {
          const otherIdx = el.n1 === i ? el.n2 : el.n1;
          const origIdx = subToOrigNode[otherIdx];
          if (origIdx >= 0 && origIdx < origNodeResults.length) {
            const origNr = origNodeResults[origIdx];
            if (nr.uc > origNr.uc) {
              // Update originele node met hogere UC van tussennode
              origNodeResults[origIdx] = { ...origNr, uc: nr.uc, ucVM: nr.ucVM, ucRing: nr.ucRing, vm: nr.vm, sb: nr.sb, Fx: nr.Fx, My: nr.My, Mz: nr.Mz };
            }
          }
        }
      }
    }
  }

  return {
    nodeResults: origNodeResults,
    globalDisplacements: new Float64Array(U),
    elementForces,
    maxUC,
    maxVM,
    converged: converged && soilConverged && geoConverged && matConverged,
    soilIterations: iteration + 1,
    soilConverged,
    plasticNodeCount,
    geoIterations: geometricNonlinear ? geoIterations : 0,
    geoConverged,
    matIterations: materialNonlinear ? matIterations : 0,
    matConverged,
    yieldedElementCount,
    maxPlasticStrain,
    localBuckledCount,
  };
}

// =============================================================================
// Backward-compatible wrapper: calcNodeResults
// =============================================================================
// Behoudt exact dezelfde signatuur als de oude functie zodat page.tsx
// ongewijzigd blijft werken. Intern roept het nu solveFEM aan.

export function calcNodeResults(
  nodes: FemNode[],
  elements: FemElement[],
  mat: MatProps,
  Pi_bar: number,
  Toper: number,
  Tinstall: number,
  loadCase: LoadCase,
  subsideMap: Record<string, { subzMax: number; uncF: number; length: number; shape: string }>,
  designFactor = 0.72,
  gammaM = 1.1
): NodeResult[] {
  // Bouw boundary conditions uit de standaard aannames
  // (eerste + laatste node fixed als er geen expliciete BCs zijn)
  const result = solveFEM({
    nodes, elements, mat,
    Pi_bar, Toper, Tinstall,
    loadCase, subsideMap,
    designFactor, gammaM,
  });

  return result.nodeResults;
}

// =============================================================================
// Multi-loadcase analyse met worst-case envelop
// =============================================================================

export function calcWorstCase(
  resultsByLC: NodeResult[][]
): NodeResult[] {
  if (!resultsByLC.length) return [];
  const nodeIds = resultsByLC[0].map(r => r.nodeId);

  return nodeIds.map((id, i) => {
    // Per stress-component: neem het maximum (absolute waarde) over alle LCs
    // Dit is de correcte envelop-methode volgens NEN 3650
    let bestUC = 0;
    let bestLCIdx = 0;

    // Vind het LC met de hoogste UC voor deze node
    for (let lci = 0; lci < resultsByLC.length; lci++) {
      const r = resultsByLC[lci][i];
      if (r && r.uc > bestUC) {
        bestUC = r.uc;
        bestLCIdx = lci;
      }
    }

    // Start met het worst-case LC resultaat als basis
    const base = resultsByLC[bestLCIdx][i];
    if (!base) return resultsByLC[0][i];

    // Neem per component het MAXIMUM over alle LCs (absolute waarden)
    let maxSh = Math.abs(base.sh), maxSl = Math.abs(base.sl), maxVm = base.vm;
    let maxSb = Math.abs(base.sb), maxSt = Math.abs(base.st), maxSlp = Math.abs(base.slp);
    let maxFx = Math.abs(base.Fx), maxMy = Math.abs(base.My), maxMz = Math.abs(base.Mz);
    let maxUx = Math.abs(base.ux), maxUy = Math.abs(base.uy), maxUz = Math.abs(base.uz);
    let maxUcRing = base.ucRing, maxUcVM = base.ucVM, maxUc = base.uc;

    // Teken bewaren voor sh en sl (positief = trek)
    let shSign = base.sh >= 0 ? 1 : -1;
    let slSign = base.sl >= 0 ? 1 : -1;

    for (const lcResults of resultsByLC) {
      const r = lcResults[i];
      if (!r) continue;
      if (Math.abs(r.sh) > maxSh) { maxSh = Math.abs(r.sh); shSign = r.sh >= 0 ? 1 : -1; }
      if (Math.abs(r.sl) > maxSl) { maxSl = Math.abs(r.sl); slSign = r.sl >= 0 ? 1 : -1; }
      if (r.vm > maxVm) maxVm = r.vm;
      if (Math.abs(r.sb) > maxSb) maxSb = Math.abs(r.sb);
      if (Math.abs(r.st) > maxSt) maxSt = Math.abs(r.st);
      if (Math.abs(r.slp) > maxSlp) maxSlp = Math.abs(r.slp);
      if (Math.abs(r.Fx) > maxFx) maxFx = Math.abs(r.Fx);
      if (Math.abs(r.My) > maxMy) maxMy = Math.abs(r.My);
      if (Math.abs(r.Mz) > maxMz) maxMz = Math.abs(r.Mz);
      if (Math.abs(r.ux) > maxUx) maxUx = Math.abs(r.ux);
      if (Math.abs(r.uy) > maxUy) maxUy = Math.abs(r.uy);
      if (Math.abs(r.uz) > maxUz) maxUz = Math.abs(r.uz);
      if (r.ucRing > maxUcRing) maxUcRing = r.ucRing;
      if (r.ucVM > maxUcVM) maxUcVM = r.ucVM;
      if (r.uc > maxUc) maxUc = r.uc;
    }

    return {
      ...base,
      sh: maxSh * shSign,
      sl: maxSl * slSign,
      vm: maxVm,
      sb: maxSb,
      st: maxSt,
      slp: maxSlp,
      Fx: maxFx,
      My: maxMy,
      Mz: maxMz,
      ux: maxUx,
      uy: maxUy,
      uz: maxUz,
      ucRing: maxUcRing,
      ucVM: maxUcVM,
      uc: maxUc,
    };
  });
}

/**
 * Voer FEM analyse uit voor alle loadcases en retourneer envelop resultaten.
 * Dit is de aanbevolen functie voor multi-loadcase analyse.
 */
export function solveAllLoadCases(
  nodes: FemNode[],
  elements: FemElement[],
  mat: MatProps,
  Pi_bar: number,
  Toper: number,
  Tinstall: number,
  loadCases: LoadCase[],
  subsideMap: Record<string, { subzMax: number; uncF: number; length: number; shape: string }>,
  boundaryConditions?: BoundaryCondition[],
  soilSprings?: SoilSpring[],
  designFactor?: number,
  gammaM?: number,
  teeSpecs?: Record<string, { type: string; dRun: number; tRun: number; dBrn: number; tBrn: number; te: number; r0: number }>,
  teeNodeMap?: Record<string, string>,
  weldFactor?: number
): { perLC: FemSolverOutput[]; envelope: NodeResult[] } {
  const perLC: FemSolverOutput[] = [];

  // Bepaal of niet-lineaire analyse nodig is (consistent met single-LC path)
  const hasSignificantLoad = loadCases.some((lc: any) => (lc.pressF || 0) > 0 || (lc.tDifF || 0) > 0);

  for (const lc of loadCases) {
    const result = solveFEM({
      nodes, elements, mat,
      Pi_bar, Toper, Tinstall,
      loadCase: lc, subsideMap,
      boundaryConditions, soilSprings,
      designFactor, gammaM,
      teeSpecs, teeNodeMap,
      weldFactor,
      geometricNonlinear: hasSignificantLoad,
      materialNonlinear: hasSignificantLoad,
    });
    perLC.push(result);
  }

  const envelope = calcWorstCase(perLC.map(r => r.nodeResults));

  return { perLC, envelope };
}
