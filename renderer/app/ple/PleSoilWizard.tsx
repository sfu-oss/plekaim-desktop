"use client";
import React, { useMemo, useState, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PLE SOIL MODEL WIZARD — NEN 3650-1:2020 Grondmechanische parameterberekening
   
   Replica van PLE4Win module X0 (Soil Model Wizard):
   
   Stap 1: Grondtypen definiëren (26 standaard NEN 9997-1 typen)
   Stap 2: Grondprofielen samenstellen (lagen met dikte)
   Stap 3: Profielen toekennen aan locaties (idents)
   Stap 4: Instellingen (waterpeil, installatiemethode, etc.)
   Stap 5: Berekening → KLH, KLS, KLT, RVS, RVT, RH, F per node
   
   Referenties:
   - NEN 3650-1:2020 bijlage C (grondparameters)
   - NEN 9997-1:2025 tabel 2b (grondtypen)
   - PLE4Win help: help.ple4win.com/calculation.htm
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Standaard grondtypen (NEN 9997-1, tabel 2b) ─────────────────────────

export interface SoilType {
  id: string;
  name: string;
  nameNL: string;
  category: "sand" | "clay";  // NEN 3650 onderscheid: sand (gravel/sand/loam) vs clay (clay/peat)
  mainType: "gravel" | "sand" | "loam" | "clay" | "peat";
  subType?: "clean" | "slightly_silty" | "highly_silty";
  color: string;
  // Mechanische eigenschappen
  gamma: number;       // volumegewicht [kN/m³]
  gammaSat: number;    // volumegewicht verzadigd [kN/m³]
  phi: number;         // hoek van inwendige wrijving [°]
  delta: number;       // hoek buis-grondwrijving [°]
  cDrained: number;    // gedraineerde cohesie [kN/m²]
  cUndrained: number;  // ongedraineerde cohesie [kN/m²]
  fm: number;          // pakkingsfactor [-]
  E100: number;        // Young's modulus bij 100 kPa [kN/m²]
  G: number;           // schuifmodulus [kN/m²]
  uFriction: number;   // ultieme wrijvingsverplaatsing [mm]
  shrinkP: number;     // krimpspanning [kN/m²]
}

// 26 standaard grondtypen conform NEN 9997-1 + PLE4Win defaults
const STANDARD_SOIL_TYPES: SoilType[] = [
  // ─── GRAVEL ───
  { id: "GR1", name: "Gravel, clean, dense",     nameNL: "Grind, schoon, vast",       category: "sand", mainType: "gravel", color: "#a0522d", gamma: 19, gammaSat: 20, phi: 37, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 60000, G: 30000, uFriction: 2, shrinkP: 2.4 },
  { id: "GR2", name: "Gravel, clean, moderate",   nameNL: "Grind, schoon, matig",      category: "sand", mainType: "gravel", color: "#b8860b", gamma: 18, gammaSat: 19.5, phi: 34, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 45000, G: 22000, uFriction: 4, shrinkP: 2.4 },
  { id: "GR3", name: "Gravel, clean, loose",       nameNL: "Grind, schoon, los",       category: "sand", mainType: "gravel", color: "#cd853f", gamma: 17, gammaSat: 19, phi: 30, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 30000, G: 15000, uFriction: 6.5, shrinkP: 2.4 },
  // ─── SAND ───
  { id: "SA1", name: "Sand, clean, dense",        nameNL: "Zand, schoon, vast",        category: "sand", mainType: "sand", subType: "clean", color: "#f0c674", gamma: 19, gammaSat: 20, phi: 36, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 50000, G: 25000, uFriction: 2, shrinkP: 5.5 },
  { id: "SA2", name: "Sand, clean, moderate",     nameNL: "Zand, schoon, matig",       category: "sand", mainType: "sand", subType: "clean", color: "#f5d68a", gamma: 18, gammaSat: 19.5, phi: 33, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 35000, G: 18000, uFriction: 4, shrinkP: 2.4 },
  { id: "SA3", name: "Sand, clean, loose",         nameNL: "Zand, schoon, los",        category: "sand", mainType: "sand", subType: "clean", color: "#fae8b0", gamma: 17, gammaSat: 19, phi: 30, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 20000, G: 10000, uFriction: 6.5, shrinkP: 2.4 },
  { id: "SA4", name: "Sand, slightly silty, dense", nameNL: "Zand, weinig siltig, vast", category: "sand", mainType: "sand", subType: "slightly_silty", color: "#e0b060", gamma: 19, gammaSat: 20, phi: 34, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 40000, G: 20000, uFriction: 2, shrinkP: 5.5 },
  { id: "SA5", name: "Sand, slightly silty, moderate", nameNL: "Zand, weinig siltig, matig", category: "sand", mainType: "sand", subType: "slightly_silty", color: "#e8c480", gamma: 18, gammaSat: 19.5, phi: 31, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 28000, G: 14000, uFriction: 4, shrinkP: 2.4 },
  { id: "SA6", name: "Sand, slightly silty, loose", nameNL: "Zand, weinig siltig, los", category: "sand", mainType: "sand", subType: "slightly_silty", color: "#f0d8a0", gamma: 17, gammaSat: 19, phi: 28, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 16000, G: 8000, uFriction: 6.5, shrinkP: 2.4 },
  { id: "SA7", name: "Sand, highly silty, dense",  nameNL: "Zand, sterk siltig, vast",  category: "sand", mainType: "sand", subType: "highly_silty", color: "#c89840", gamma: 18.5, gammaSat: 19.5, phi: 32, delta: 20, cDrained: 1, cUndrained: 0, fm: 0.3, E100: 30000, G: 15000, uFriction: 2, shrinkP: 5.5 },
  { id: "SA8", name: "Sand, highly silty, moderate", nameNL: "Zand, sterk siltig, matig", category: "sand", mainType: "sand", subType: "highly_silty", color: "#d0a850", gamma: 17.5, gammaSat: 19, phi: 29, delta: 20, cDrained: 0.5, cUndrained: 0, fm: 0.3, E100: 20000, G: 10000, uFriction: 4, shrinkP: 2.4 },
  { id: "SA9", name: "Sand, highly silty, loose",  nameNL: "Zand, sterk siltig, los",   category: "sand", mainType: "sand", subType: "highly_silty", color: "#d8b870", gamma: 16.5, gammaSat: 18.5, phi: 26, delta: 20, cDrained: 0, cUndrained: 0, fm: 0.3, E100: 12000, G: 6000, uFriction: 6.5, shrinkP: 2.4 },
  // ─── LOAM ───
  { id: "LO1", name: "Loam, firm",                nameNL: "Leem, vast",                category: "sand", mainType: "loam", color: "#8b7355", gamma: 19, gammaSat: 20, phi: 30, delta: 20, cDrained: 5, cUndrained: 0, fm: 0.3, E100: 25000, G: 12000, uFriction: 2, shrinkP: 1.6 },
  { id: "LO2", name: "Loam, moderate",            nameNL: "Leem, matig",               category: "sand", mainType: "loam", color: "#a08060", gamma: 18, gammaSat: 19, phi: 27, delta: 20, cDrained: 3, cUndrained: 0, fm: 0.3, E100: 15000, G: 7500, uFriction: 4, shrinkP: 1.6 },
  { id: "LO3", name: "Loam, soft",                nameNL: "Leem, slap",                category: "sand", mainType: "loam", color: "#b89878", gamma: 17, gammaSat: 18, phi: 24, delta: 20, cDrained: 1, cUndrained: 0, fm: 0.3, E100: 8000, G: 4000, uFriction: 6.5, shrinkP: 1.6 },
  // ─── CLAY ───
  { id: "CL1", name: "Clay, slightly sandy, firm", nameNL: "Klei, weinig zandig, vast", category: "clay", mainType: "clay", color: "#556b2f", gamma: 19, gammaSat: 19.5, phi: 25, delta: 17, cDrained: 5, cUndrained: 100, fm: 0.3, E100: 15000, G: 7500, uFriction: 3, shrinkP: 0.8 },
  { id: "CL2", name: "Clay, slightly sandy, moderate", nameNL: "Klei, weinig zandig, matig", category: "clay", mainType: "clay", color: "#6b8e23", gamma: 17.5, gammaSat: 18.5, phi: 22, delta: 15, cDrained: 3, cUndrained: 60, fm: 0.3, E100: 8000, G: 4000, uFriction: 5, shrinkP: 0.8 },
  { id: "CL3", name: "Clay, slightly sandy, soft", nameNL: "Klei, weinig zandig, slap", category: "clay", mainType: "clay", color: "#8fbc8f", gamma: 16, gammaSat: 17.5, phi: 18, delta: 12, cDrained: 1, cUndrained: 30, fm: 0.3, E100: 3000, G: 1500, uFriction: 8, shrinkP: 0.4 },
  { id: "CL4", name: "Clay, clean, firm",          nameNL: "Klei, schoon, vast",       category: "clay", mainType: "clay", color: "#2e8b57", gamma: 18, gammaSat: 19, phi: 22, delta: 15, cDrained: 8, cUndrained: 120, fm: 0.3, E100: 12000, G: 6000, uFriction: 3, shrinkP: 0.8 },
  { id: "CL5", name: "Clay, clean, moderate",      nameNL: "Klei, schoon, matig",      category: "clay", mainType: "clay", color: "#3cb371", gamma: 17, gammaSat: 18, phi: 19, delta: 13, cDrained: 5, cUndrained: 70, fm: 0.3, E100: 6000, G: 3000, uFriction: 5, shrinkP: 0.8 },
  { id: "CL6", name: "Clay, clean, soft",           nameNL: "Klei, schoon, slap",      category: "clay", mainType: "clay", color: "#66cdaa", gamma: 15.5, gammaSat: 17, phi: 16, delta: 11, cDrained: 2, cUndrained: 25, fm: 0.3, E100: 2000, G: 1000, uFriction: 8, shrinkP: 0.4 },
  { id: "CL7", name: "Clay, organic, moderate",    nameNL: "Klei, organisch, matig",    category: "clay", mainType: "clay", color: "#4a7c4a", gamma: 16, gammaSat: 17, phi: 17, delta: 11, cDrained: 3, cUndrained: 40, fm: 0.3, E100: 3500, G: 1750, uFriction: 5, shrinkP: 0.4 },
  { id: "CL8", name: "Clay, organic, soft",        nameNL: "Klei, organisch, slap",     category: "clay", mainType: "clay", color: "#5a9a5a", gamma: 14.5, gammaSat: 16, phi: 14, delta: 9, cDrained: 1, cUndrained: 15, fm: 0.3, E100: 1500, G: 750, uFriction: 8, shrinkP: 0.4 },
  // ─── PEAT ───
  { id: "PE1", name: "Peat, moderate",             nameNL: "Veen, matig",               category: "clay", mainType: "peat", color: "#4b3621", gamma: 12, gammaSat: 13, phi: 15, delta: 0, cDrained: 2, cUndrained: 15, fm: 0.3, E100: 1500, G: 600, uFriction: 8, shrinkP: 0.4 },
  { id: "PE2", name: "Peat, weak",                 nameNL: "Veen, slap",                category: "clay", mainType: "peat", color: "#5c4033", gamma: 11, gammaSat: 12, phi: 12, delta: 0, cDrained: 1, cUndrained: 8, fm: 0.3, E100: 800, G: 300, uFriction: 12.5, shrinkP: 0.4 },
  { id: "PE3", name: "Peat, fibrous",              nameNL: "Veen, vezelachtig",          category: "clay", mainType: "peat", color: "#6b4423", gamma: 10.5, gammaSat: 11.5, phi: 10, delta: 0, cDrained: 0.5, cUndrained: 5, fm: 0.3, E100: 500, G: 200, uFriction: 12.5, shrinkP: 0.4 },
];

// ─── Grondprofiel structuren ──────────────────────────────────────────────

export interface SoilLayer {
  soilTypeId: string;
  thickness: number;  // [mm] laagdikte
}

export interface SoilProfile {
  id: string;
  name: string;
  layers: SoilLayer[];
}

export interface SoilLocation {
  nodeId: string;     // ident van de node
  nodeIndex: number;
  profileId: string;  // welk profiel hier geldt (continu)
  profileIdAfter?: string;  // tweede profiel NA de stap (bij step change)
  isStepChange?: boolean;   // automatisch gedetecteerd: hier verandert D, t, G-LEVEL, of W-LEVEL
  stepReason?: string;       // reden voor step change (bv. "Ø139.7→Ø219.1")
  isInterpolated?: boolean;  // geen expliciet profiel — geïnterpoleerd
}

// ─── Wizard instellingen ──────────────────────────────────────────────────

export interface SoilWizardSettings {
  gammaWater: number;        // volumegewicht water [kN/m³], default 10
  installMethod: "trench_uncompressed" | "trench_compressed" | "boring" | "hdd";
  nenVersion: "2020" | "1992";
  useRealTopsoil: boolean;   // gebruik reële grondbelasting i.p.v. neutrale
}

// ─── Berekende grondparameters per node ───────────────────────────────────

export interface SoilParameters {
  nodeId: string;
  nodeIndex: number;
  // Stijfheden [kN/m²] (= N/mm per mm buis per mm verplaatsing)
  KLH: number;    // horizontale grondveerstijfheid
  KLS: number;    // verticale neerwaartse stijfheid
  KLT: number;    // verticale opwaartse stijfheid
  // Maximale grondreacties [kN/m] (= N/mm buis)
  RVS: number;    // draagkracht onderzijde
  RVT: number;    // maximale opwaartse reactie
  RH: number;     // maximale horizontale reactie
  // Wrijving
  F: number;      // buis-grondwrijving [kN/m²]
  UF: number;     // verplaatsing bij max wrijving [mm]
  // Extra info
  sigmaK: number; // korrelspanning op buisas [kN/m²]
  H_cover: number; // gronddekking boven buis [mm]
}

/* ═══════════════════════════════════════════════════════════════════════════
   NEN 3650-1:2020 GRONDMECHANISCHE BEREKENINGEN
   ═══════════════════════════════════════════════════════════════════════════ */

function deg2rad(deg: number): number { return deg * Math.PI / 180; }

/**
 * Berekent effectieve Young's modulus (NEN 3650-1:2020)
 * Eeff = E100 × (σv' / 100)^m
 *   m = 0.5 voor zandig, 0.8 voor kleiig
 */
function calcEffectiveE(E100: number, sigmaV_kPa: number, category: "sand" | "clay"): number {
  const m = category === "sand" ? 0.5 : 0.8;
  if (sigmaV_kPa <= 0) return E100;
  return E100 * Math.pow(sigmaV_kPa / 100, m);
}

/**
 * Berekent korrelspanning op buisas-niveau
 * σk = Σ(γi × hi)  boven grondwater
 * σk = Σ(γi × hi) + Σ((γsat,j - γw) × hj)  onder grondwater
 */
function calcSigmaK(
  layers: { gamma: number; gammaSat: number; thickness: number }[],
  totalDepth: number, waterDepth: number | null, gammaW: number
): number {
  let sigma = 0;
  let currentDepth = 0;
  for (const layer of layers) {
    const layerTop = currentDepth;
    const layerBot = currentDepth + layer.thickness;
    if (layerBot <= 0 || layerTop >= totalDepth) { currentDepth = layerBot; continue; }
    
    const effectiveTop = Math.max(layerTop, 0);
    const effectiveBot = Math.min(layerBot, totalDepth);
    const h = effectiveBot - effectiveTop;
    
    if (waterDepth !== null && effectiveBot > waterDepth) {
      // Deels of geheel onder water
      const hAboveWater = Math.max(0, waterDepth - effectiveTop);
      const hBelowWater = h - hAboveWater;
      sigma += layer.gamma * hAboveWater / 1000;  // kN/m³ × m = kN/m²
      sigma += (layer.gammaSat - gammaW) * hBelowWater / 1000;
    } else {
      sigma += layer.gamma * h / 1000;
    }
    currentDepth = layerBot;
  }
  return sigma;
}

/**
 * Gewogen gemiddelde van een grondeigenschap over een bereik
 */
function weightedAvg(
  layers: { value: number; thickness: number }[]
): number {
  let sumVH = 0, sumH = 0;
  for (const l of layers) {
    sumVH += l.value * l.thickness;
    sumH += l.thickness;
  }
  return sumH > 0 ? sumVH / sumH : 0;
}

/**
 * Berekent alle grondparameters voor één locatie
 * Conform NEN 3650-1:2020 bijlage C
 */
export function calcSoilParametersAtNode(
  profile: SoilProfile,
  soilTypes: SoilType[],
  D_out: number,          // buitendiameter buis [mm]
  pipeAxisDepth: number,  // diepte buisas onder maaiveld [mm]
  waterDepth: number | null, // diepte grondwater onder maaiveld [mm], null = geen
  gammaW: number,         // volumegewicht water [kN/m³]
  settings: SoilWizardSettings
): Omit<SoilParameters, "nodeId" | "nodeIndex"> {
  const r = D_out / 2;
  const H_cover = pipeAxisDepth - r;  // gronddekking boven buis [mm]
  const H_bottom = pipeAxisDepth + r; // diepte onderzijde buis [mm]
  
  // Bouw effectieve lagenlijst op met grondtypen
  const resolvedLayers: (SoilType & { thickness: number; topDepth: number; botDepth: number })[] = [];
  let depth = 0;
  for (const layer of profile.layers) {
    const st = soilTypes.find(s => s.id === layer.soilTypeId);
    if (!st) continue;
    resolvedLayers.push({
      ...st,
      thickness: layer.thickness,
      topDepth: depth,
      botDepth: depth + layer.thickness,
    });
    depth += layer.thickness;
  }
  
  // Als profiel niet diep genoeg is, verleng laatste laag
  if (depth < H_bottom + 1000 && resolvedLayers.length > 0) {
    const last = resolvedLayers[resolvedLayers.length - 1];
    const extra = H_bottom + 1000 - depth;
    last.thickness += extra;
    last.botDepth += extra;
  }

  // Helper: haal lagen op binnen een dieptebereik
  const getLayersInRange = (top: number, bot: number) => {
    return resolvedLayers
      .filter(l => l.botDepth > top && l.topDepth < bot)
      .map(l => ({
        ...l,
        thickness: Math.min(l.botDepth, bot) - Math.max(l.topDepth, top),
      }));
  };

  // ─── 1. Korrelspanning op buisas (σk) ───
  const layersToAxis = getLayersInRange(0, pipeAxisDepth);
  const sigmaK = calcSigmaK(
    layersToAxis.map(l => ({ gamma: l.gamma, gammaSat: l.gammaSat, thickness: l.thickness })),
    pipeAxisDepth, waterDepth ? waterDepth : null, gammaW
  );

  // ─── 2. KLH — Horizontale grondveerstijfheid ───
  // NEN 3650-1:2020 C.4.4: kh = 2 × σk' × Kph / D
  // Kph = tan²(45° + φ/2) (Rankine passieve gronddrukcoëfficiënt)
  const layersAtAxis = getLayersInRange(pipeAxisDepth - 200, pipeAxisDepth + 200);
  const phiH = weightedAvg(layersAtAxis.map(l => ({ value: l.phi, thickness: l.thickness })));
  const Kph = Math.pow(Math.tan(deg2rad(45 + phiH / 2)), 2);
  const KLH = sigmaK > 0 ? (2 * sigmaK * Kph) / (D_out / 1000) : 0;

  // ─── 3. KLS — Verticale neerwaartse stijfheid ───
  // NEN 3650-1:2020 C.4.2: ks = E_eff / (D × (1 - ν²))
  // Vereenvoudigd voor zand: ks ≈ E_eff × √(σv'/100) / D
  const layersBelow = getLayersInRange(pipeAxisDepth, H_bottom + 500);
  const E100_avg = weightedAvg(layersBelow.map(l => ({ value: l.E100, thickness: l.thickness })));
  const catBelow = layersBelow.length > 0 && layersBelow[0].category === "clay" ? "clay" : "sand";
  const Eeff_bottom = calcEffectiveE(E100_avg, sigmaK * 1000, catBelow); // σv in kPa
  const KLS = Eeff_bottom / (D_out / 1000) * 0.5; // kN/m² (vereenvoudigd)

  // ─── 4. KLT — Verticale opwaartse stijfheid ───
  // NEN 3650-1:2020 C.4.3.2: kv,top
  const layersAbove = getLayersInRange(0, pipeAxisDepth - r);
  const E100_above = weightedAvg(layersAbove.map(l => ({ value: l.E100, thickness: l.thickness })));
  const catAbove = layersAbove.length > 0 && layersAbove[0].category === "clay" ? "clay" : "sand";
  const Eeff_top = calcEffectiveE(E100_above, sigmaK * 500, catAbove);
  
  // Voor zandig: KLT ≈ Qp / (0.01 × D), met Qp = RVT
  // Vereenvoudigd: KLT ≈ Eeff × 0.25 / D
  const KLT = H_cover > 0 ? Eeff_top * 0.25 / (D_out / 1000) : 0;

  // ─── 5. RVS — Draagkracht onderzijde ───
  // NEN 3650-1:2020 C.4.2.3
  // Zandig: RVS = σk × Nq × D + c' × Nc × D
  // Kleiig: RVS = cu × Nc × D + σk × D
  const phiBelow = weightedAvg(layersBelow.map(l => ({ value: l.phi, thickness: l.thickness })));
  const Nq = Math.exp(Math.PI * Math.tan(deg2rad(phiBelow))) * Math.pow(Math.tan(deg2rad(45 + phiBelow / 2)), 2);
  const Nc = (Nq - 1) / Math.max(Math.tan(deg2rad(phiBelow)), 0.01);
  const cBelow = weightedAvg(layersBelow.map(l => ({ value: l.cDrained, thickness: l.thickness })));
  const cuBelow = weightedAvg(layersBelow.map(l => ({ value: l.cUndrained, thickness: l.thickness })));
  
  let RVS: number;
  if (catBelow === "sand") {
    RVS = (sigmaK * Nq + cBelow * Nc) * (D_out / 1000);
  } else {
    const Nc_clay = 5.14; // NEN 3650: Nc = 5.14 voor klei (ongedraineerd)
    RVS = (cuBelow * Nc_clay + sigmaK) * (D_out / 1000);
  }

  // ─── 6. RVT — Maximale opwaartse grondreactie ───
  // NEN 3650-1:2020 C.4.2.4: RVT = γ × H × D × (1 + fm × Kp × H/D)
  const gammaAbove = weightedAvg(layersAbove.map(l => ({ value: l.gamma, thickness: l.thickness })));
  const phiAbove = weightedAvg(layersAbove.map(l => ({ value: l.phi, thickness: l.thickness })));
  const fmAbove = weightedAvg(layersAbove.map(l => ({ value: l.fm, thickness: l.thickness })));
  const Kp_above = Math.pow(Math.tan(deg2rad(45 + phiAbove / 2)), 2);
  const H_m = H_cover / 1000; // [m]
  const D_m = D_out / 1000;   // [m]
  
  let RVT = gammaAbove * H_m * D_m * (1 + fmAbove * Kp_above * H_m / D_m);
  
  // Wateropwaartse druk correctie
  if (waterDepth !== null && waterDepth < pipeAxisDepth) {
    const waterAbovePipe = (pipeAxisDepth - waterDepth) / 1000; // [m]
    RVT -= gammaW * waterAbovePipe * D_m;
    if (RVT < 0) RVT = 0;
  }

  // ─── 7. RH — Maximale horizontale grondreactie ───
  // NEN 3650-1:2020 C.4.4
  // Zandig: RH = σk × Kph × D
  // Kleiig: RH = cu × Nc × D
  const cuAxis = weightedAvg(layersAtAxis.map(l => ({ value: l.cUndrained, thickness: l.thickness })));
  const catAxis = layersAtAxis.length > 0 && layersAtAxis[0].category === "clay" ? "clay" : "sand";
  
  let RH: number;
  if (catAxis === "sand") {
    RH = sigmaK * Kph * D_m;
  } else {
    RH = cuAxis * 9.14 * D_m; // Nc = 9.14 voor horizontaal (Hansen)
  }

  // ─── 8. F — Buis-grondwrijving ───
  // NEN 3650-1:2020 C.4.5.4
  // F = σk × tan(δ) × π × D + adhesie × π × D
  const deltaAvg = weightedAvg(layersAtAxis.map(l => ({ value: l.delta, thickness: l.thickness })));
  const cAvg = weightedAvg(layersAtAxis.map(l => ({ value: l.cDrained, thickness: l.thickness })));
  const adhesion = catAxis === "sand" ? cAvg * Math.tan(deg2rad(deltaAvg)) : cAvg * 0.6;
  const F = sigmaK * Math.tan(deg2rad(deltaAvg)) + adhesion;

  // ─── 9. UF — Verplaatsing bij maximale wrijving ───
  const ufAvg = weightedAvg(layersAtAxis.map(l => ({ value: l.uFriction, thickness: l.thickness })));
  const UF = ufAvg;

  return {
    KLH: Math.max(0, KLH),
    KLS: Math.max(0, KLS),
    KLT: Math.max(0, KLT),
    RVS: Math.max(0, RVS),
    RVT: Math.max(0, RVT),
    RH: Math.max(0, RH),
    F: Math.max(0, F),
    UF,
    sigmaK,
    H_cover: Math.max(0, H_cover),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI COMPONENT — PLE Soil Model Wizard
   ═══════════════════════════════════════════════════════════════════════════ */

interface PleSoilWizardProps {
  nodes: { id: string; x: number; y: number; z: number; bendR?: number | null; etyp?: string }[];
  elements: { n1: number; n2: number; d: number; t: number; type: string }[];
  glevel?: { nodeIndex: number; z: number }[];
  onApplySoilParameters?: (params: SoilParameters[]) => void;
  css: {
    bg: string; text: string; muted: string; dim: string;
    border: string; accent: string; green: string; yellow: string;
    red: string; mono: string;
  };
}

export default function PleSoilWizard({ nodes, elements, glevel = [], onApplySoilParameters, css }: PleSoilWizardProps) {
  
  // ─── Wizard stap ───
  const [step, setStep] = useState(1);
  
  // ─── Stap 1: Grondtypen ───
  const [soilTypes, setSoilTypes] = useState<SoilType[]>(STANDARD_SOIL_TYPES);
  const [selectedSoilType, setSelectedSoilType] = useState<string | null>(null);
  
  // ─── Stap 2: Profielen ───
  const [profiles, setProfiles] = useState<SoilProfile[]>([
    { id: "P1", name: "Standaard profiel", layers: [
      { soilTypeId: "SA2", thickness: 500 },
      { soilTypeId: "CL2", thickness: 1500 },
      { soilTypeId: "SA5", thickness: 3000 },
    ] }
  ]);
  const [selectedProfile, setSelectedProfile] = useState("P1");
  
  // ─── Stap 3: Locaties ───
  const [locations, setLocations] = useState<SoilLocation[]>([]);
  
  // ─── Stap 4: Instellingen ───
  const [settings, setSettings] = useState<SoilWizardSettings>({
    gammaWater: 10,
    installMethod: "trench_uncompressed",
    nenVersion: "2020",
    useRealTopsoil: false,
  });

  // ─── Stap 5: Resultaten ───
  const [results, setResults] = useState<SoilParameters[]>([]);

  // ═══ STEP DETECTION (PLE4Win-stijl) ═══
  // Detecteert abrupte veranderingen in diameter, wanddikte, maaiveld of waterpeil
  // en markeert die nodes als "step change" die twee profielen nodig hebben
  const stepDetection = useMemo(() => {
    if (nodes.length < 2 || elements.length === 0) return [];
    
    const steps: { nodeIndex: number; nodeId: string; reason: string }[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      const reasons: string[] = [];
      
      // Zoek elementen die op deze node aansluiten
      const connEls = elements.filter(el => el.n1 === i || el.n2 === i);
      if (connEls.length < 2) continue; // eindpunt, geen stap mogelijk
      
      // Check diameter-verandering
      const diams = [...new Set(connEls.map(el => el.d))];
      if (diams.length > 1) {
        const sorted = diams.sort((a, b) => a - b);
        const ratio = sorted[sorted.length - 1] / sorted[0];
        if (ratio > 1.05) { // >5% verschil = significante stap
          reasons.push(`Ø${sorted[0].toFixed(1)}→Ø${sorted[sorted.length - 1].toFixed(1)}`);
        }
      }
      
      // Check wanddikte-verandering
      const walls = [...new Set(connEls.map(el => el.t))];
      if (walls.length > 1) {
        const sorted = walls.sort((a, b) => a - b);
        if (sorted[sorted.length - 1] - sorted[0] > 0.5) {
          reasons.push(`t${sorted[0]}→${sorted[sorted.length - 1]}`);
        }
      }
      
      // Check maaiveld-sprong (G-LEVEL)
      if (glevel.length > 0 && i > 0 && i < nodes.length - 1) {
        const glThis = glevel.find(g => g.nodeIndex === i);
        const glPrev = glevel.find(g => g.nodeIndex === i - 1);
        const glNext = glevel.find(g => g.nodeIndex === i + 1);
        if (glThis && glPrev && Math.abs(glThis.z - glPrev.z) > 300) {
          reasons.push(`GL ${(glPrev.z / 1000).toFixed(1)}→${(glThis.z / 1000).toFixed(1)}m`);
        }
        if (glThis && glNext && Math.abs(glNext.z - glThis.z) > 300) {
          reasons.push(`GL ${(glThis.z / 1000).toFixed(1)}→${(glNext.z / 1000).toFixed(1)}m`);
        }
      }
      
      if (reasons.length > 0) {
        steps.push({ nodeIndex: i, nodeId: nodes[i].id, reason: reasons.join(", ") });
      }
    }
    
    return steps;
  }, [nodes, elements, glevel]);

  // ─── Auto-assign: wijs standaardprofiel toe aan alle nodes, met step detection ───
  const autoAssign = useCallback(() => {
    if (profiles.length === 0) return;
    const newLocs: SoilLocation[] = nodes.map((n, i) => {
      const step = stepDetection.find(s => s.nodeIndex === i);
      return {
        nodeId: n.id,
        nodeIndex: i,
        profileId: profiles[0].id,
        profileIdAfter: step ? profiles[Math.min(1, profiles.length - 1)].id : undefined,
        isStepChange: !!step,
        stepReason: step?.reason,
        isInterpolated: false,
      };
    });
    setLocations(newLocs);
  }, [nodes, profiles, stepDetection]);

  // ─── Interpolatie: bereken profiel-parameters voor nodes zonder expliciet profiel ───
  const interpolateProfile = useCallback((
    nodeIndex: number, assignedLocs: SoilLocation[]
  ): { profileId: string; side: "before" | "after" | "single" } => {
    // Zoek dichtstbijzijnde nodes met expliciet profiel (vóór en ná)
    let prevLoc: SoilLocation | null = null;
    let nextLoc: SoilLocation | null = null;
    
    for (let j = nodeIndex - 1; j >= 0; j--) {
      const loc = assignedLocs.find(l => l.nodeIndex === j && !l.isInterpolated);
      if (loc) { prevLoc = loc; break; }
    }
    for (let j = nodeIndex + 1; j < nodes.length; j++) {
      const loc = assignedLocs.find(l => l.nodeIndex === j && !l.isInterpolated);
      if (loc) { nextLoc = loc; break; }
    }
    
    // Gebruik dichtstbijzijnde profiel, of het "after" profiel als we na een step change zitten
    if (prevLoc && prevLoc.isStepChange && prevLoc.profileIdAfter) {
      return { profileId: prevLoc.profileIdAfter, side: "after" };
    }
    if (prevLoc) return { profileId: prevLoc.profileId, side: "single" };
    if (nextLoc) return { profileId: nextLoc.profileId, side: "single" };
    return { profileId: profiles[0]?.id || "P1", side: "single" };
  }, [nodes, profiles]);

  // ─── Bereken alle grondparameters (met interpolatie en dual-profiel support) ───
  const calculate = useCallback(() => {
    const params: SoilParameters[] = [];
    
    // Stap 1: voor nodes zonder locatie, interpoleer
    const effectiveLocations: SoilLocation[] = nodes.map((n, i) => {
      const explicit = locations.find(l => l.nodeIndex === i);
      if (explicit) return explicit;
      // Interpoleer
      const interp = interpolateProfile(i, locations);
      return {
        nodeId: n.id,
        nodeIndex: i,
        profileId: interp.profileId,
        isInterpolated: true,
      };
    });
    
    for (const loc of effectiveLocations) {
      const node = nodes[loc.nodeIndex];
      if (!node) continue;

      // Bepaal buisdiameter bij deze node
      const connEl = elements.find(el => el.n1 === loc.nodeIndex || el.n2 === loc.nodeIndex);
      const D_out = connEl ? connEl.d : 219.1;

      // Bepaal gronddekking: G-LEVEL - pipe Z, of default 1200mm
      const gl = glevel.find(g => g.nodeIndex === loc.nodeIndex);
      const groundZ = gl ? gl.z : (node.z || 0) + 1200;
      const pipeAxisDepth = Math.max(100, groundZ - (node.z || 0));
      const waterDepth = null;

      // Bij step change: bereken voor beide profielen en gebruik het conservatiefste
      const profileIds = loc.isStepChange && loc.profileIdAfter
        ? [loc.profileId, loc.profileIdAfter]
        : [loc.profileId];
      
      let worstResult: Omit<SoilParameters, "nodeId" | "nodeIndex"> | null = null;
      
      for (const pid of profileIds) {
        const profile = profiles.find(p => p.id === pid);
        if (!profile) continue;
        
        const result = calcSoilParametersAtNode(
          profile, soilTypes, D_out, pipeAxisDepth, waterDepth,
          settings.gammaWater, settings
        );
        
        // Conservatief: gebruik het profiel met de laagste stijfheden (ongunstigst)
        if (!worstResult || result.KLH < worstResult.KLH) {
          worstResult = result;
        }
      }

      if (worstResult) {
        params.push({
          ...worstResult,
          nodeId: loc.nodeId,
          nodeIndex: loc.nodeIndex,
        });
      }
    }

    setResults(params);
    if (onApplySoilParameters) onApplySoilParameters(params);
  }, [locations, profiles, nodes, elements, glevel, soilTypes, settings, onApplySoilParameters, interpolateProfile]);

  // ─── Styling helpers ───
  const stepBtn = (s: number, label: string) => (
    <button onClick={() => setStep(s)} style={{
      padding: "6px 12px", fontSize: 10, fontFamily: css.mono,
      background: step === s ? "rgba(59,130,246,0.2)" : "transparent",
      border: `1px solid ${step === s ? css.accent : css.border}`,
      borderRadius: 4, color: step === s ? css.accent : css.muted,
      cursor: "pointer", fontWeight: step === s ? 700 : 400,
      transition: "all 0.15s",
    }}>{s}. {label}</button>
  );

  const soilColor = (typeId: string) => {
    const st = soilTypes.find(s => s.id === typeId);
    return st?.color || "#888";
  };

  const inputStyle: React.CSSProperties = {
    background: css.bg, border: `1px solid ${css.border}`, borderRadius: 4,
    padding: "3px 6px", color: css.text, fontSize: 10, fontFamily: css.mono,
    textAlign: "right", width: 70,
  };

  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: css.muted, fontFamily: css.mono, fontSize: 11,
        border: `1px dashed ${css.border}`, borderRadius: 8, margin: "16px 0" }}>
        Importeer eerst een leidingmodel om de Soil Wizard te gebruiken
      </div>
    );
  }

  return (
    <div style={{ margin: "8px 0" }}>
      {/* ═══ Wizard header ═══ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4, padding: "6px 8px",
        background: "rgba(15,23,42,0.5)", borderRadius: "8px 8px 0 0",
        border: `1px solid ${css.border}`, borderBottom: "none", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 10, color: css.yellow, fontFamily: css.mono, fontWeight: 700, marginRight: 8 }}>
          SOIL WIZARD
        </span>
        <div style={{ width: 1, height: 16, background: css.border }} />
        {stepBtn(1, "Grondtypen")}
        {stepBtn(2, "Profielen")}
        {stepBtn(3, "Locaties")}
        {stepBtn(4, "Instellingen")}
        {stepBtn(5, "Resultaten")}
      </div>

      <div style={{
        border: `1px solid ${css.border}`, borderRadius: "0 0 8px 8px",
        background: "#0a0f1a", padding: 12, minHeight: 300,
      }}>

        {/* ═══ STAP 1: Grondtypen ═══ */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: css.text, marginBottom: 8 }}>
              Standaard grondtypen (NEN 9997-1)
            </div>
            <div style={{ fontSize: 9, color: css.dim, marginBottom: 10 }}>
              5 hoofdtypen: Grind, Zand, Leem, Klei, Veen — elk met subtypes naar consistentie.
              Selecteer een type om eigenschappen te bekijken of aan te passen.
            </div>
            
            {/* Groepeer per hoofdtype */}
            {(["gravel", "sand", "loam", "clay", "peat"] as const).map(mainType => {
              const types = soilTypes.filter(s => s.mainType === mainType);
              const labelMap = { gravel: "Grind", sand: "Zand", loam: "Leem", clay: "Klei", peat: "Veen" };
              return (
                <div key={mainType} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: css.muted, marginBottom: 3, textTransform: "uppercase" }}>
                    {labelMap[mainType]} ({types[0]?.category === "sand" ? "zandig" : "kleiig/venig"})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {types.map(st => (
                      <button key={st.id} onClick={() => setSelectedSoilType(st.id === selectedSoilType ? null : st.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                          background: st.id === selectedSoilType ? "rgba(59,130,246,0.15)" : "rgba(15,23,42,0.5)",
                          border: `1px solid ${st.id === selectedSoilType ? css.accent : css.border}`,
                          borderRadius: 4, cursor: "pointer", fontSize: 9, fontFamily: css.mono,
                          color: st.id === selectedSoilType ? css.text : css.muted,
                        }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: st.color, border: "1px solid #333" }} />
                        {st.nameNL}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Detail view */}
            {selectedSoilType && (() => {
              const st = soilTypes.find(s => s.id === selectedSoilType)!;
              return (
                <div style={{
                  marginTop: 12, padding: 10, background: "rgba(30,41,59,0.4)",
                  borderRadius: 6, border: `1px solid ${css.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: st.color }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: css.text }}>{st.nameNL}</span>
                    <span style={{ fontSize: 9, color: css.dim }}>({st.name})</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 12px", fontSize: 9, fontFamily: css.mono }}>
                    <span style={{ color: css.muted }}>γ = {st.gamma} kN/m³</span>
                    <span style={{ color: css.muted }}>γ_sat = {st.gammaSat} kN/m³</span>
                    <span style={{ color: css.muted }}>φ = {st.phi}°</span>
                    <span style={{ color: css.muted }}>δ = {st.delta}°</span>
                    <span style={{ color: css.muted }}>c' = {st.cDrained} kN/m²</span>
                    <span style={{ color: css.muted }}>cu = {st.cUndrained} kN/m²</span>
                    <span style={{ color: css.muted }}>fm = {st.fm}</span>
                    <span style={{ color: css.muted }}>E₁₀₀ = {st.E100} kN/m²</span>
                    <span style={{ color: css.muted }}>G = {st.G} kN/m²</span>
                    <span style={{ color: css.muted }}>u_f = {st.uFriction} mm</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ STAP 2: Profielen ═══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: css.text }}>Grondprofielen</span>
              <button onClick={() => {
                const id = `P${profiles.length + 1}`;
                setProfiles([...profiles, { id, name: `Profiel ${profiles.length + 1}`, layers: [{ soilTypeId: "SA2", thickness: 2000 }] }]);
                setSelectedProfile(id);
              }} style={{
                padding: "2px 8px", fontSize: 9, fontFamily: css.mono,
                background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 4, color: css.green, cursor: "pointer",
              }}>+ Profiel</button>
            </div>

            {/* Profiel tabs */}
            <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
              {profiles.map(p => (
                <button key={p.id} onClick={() => setSelectedProfile(p.id)} style={{
                  padding: "3px 10px", fontSize: 9, fontFamily: css.mono,
                  background: selectedProfile === p.id ? "rgba(59,130,246,0.2)" : "transparent",
                  border: `1px solid ${selectedProfile === p.id ? css.accent : css.border}`,
                  borderRadius: 4, color: selectedProfile === p.id ? css.accent : css.dim,
                  cursor: "pointer",
                }}>{p.name}</button>
              ))}
            </div>

            {/* Geselecteerd profiel bewerken */}
            {(() => {
              const prof = profiles.find(p => p.id === selectedProfile);
              if (!prof) return null;
              
              const totalDepth = prof.layers.reduce((sum, l) => sum + l.thickness, 0);
              
              return (
                <div>
                  {/* Visuele grondlagenkolom */}
                  <div style={{ display: "flex", gap: 16 }}>
                    {/* Grafische kolom */}
                    <div style={{ width: 50, position: "relative" }}>
                      <div style={{ fontSize: 7, color: css.dim, textAlign: "center", marginBottom: 2 }}>0 mm</div>
                      {prof.layers.map((layer, i) => {
                        const st = soilTypes.find(s => s.id === layer.soilTypeId);
                        const heightPx = Math.max(15, (layer.thickness / Math.max(totalDepth, 1)) * 200);
                        return (
                          <div key={i} style={{
                            width: 50, height: heightPx, background: st?.color || "#555",
                            borderBottom: `1px solid ${css.bg}`, opacity: 0.7,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 7, color: "#fff", fontFamily: css.mono, fontWeight: 600,
                            textShadow: "0 0 3px #000",
                          }}>
                            {(layer.thickness / 1000).toFixed(1)}m
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 7, color: css.dim, textAlign: "center", marginTop: 2 }}>{(totalDepth / 1000).toFixed(1)} m</div>
                    </div>

                    {/* Tabel */}
                    <div style={{ flex: 1 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: css.mono }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                            <th style={{ padding: "3px 4px", textAlign: "left", color: css.muted, fontWeight: 400, fontSize: 8 }}>Laag</th>
                            <th style={{ padding: "3px 4px", textAlign: "left", color: css.muted, fontWeight: 400, fontSize: 8 }}>Grondtype</th>
                            <th style={{ padding: "3px 4px", textAlign: "right", color: css.muted, fontWeight: 400, fontSize: 8 }}>Dikte [mm]</th>
                            <th style={{ padding: "3px 4px", textAlign: "center", color: css.muted, fontWeight: 400, fontSize: 8 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {prof.layers.map((layer, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${css.border}22` }}>
                              <td style={{ padding: "3px 4px", color: css.dim }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 2, background: soilColor(layer.soilTypeId) }} />
                                  {i + 1}
                                </div>
                              </td>
                              <td style={{ padding: "3px 4px" }}>
                                <select value={layer.soilTypeId} onChange={e => {
                                  const updated = [...profiles];
                                  const pIdx = updated.findIndex(p => p.id === selectedProfile);
                                  updated[pIdx].layers[i].soilTypeId = e.target.value;
                                  setProfiles(updated);
                                }} style={{
                                  background: css.bg, border: `1px solid ${css.border}`, borderRadius: 4,
                                  padding: "2px 4px", color: css.text, fontSize: 9, fontFamily: css.mono, width: "100%",
                                }}>
                                  {soilTypes.map(st => (
                                    <option key={st.id} value={st.id}>{st.nameNL}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: "3px 4px" }}>
                                <input type="number" value={layer.thickness} onChange={e => {
                                  const updated = [...profiles];
                                  const pIdx = updated.findIndex(p => p.id === selectedProfile);
                                  updated[pIdx].layers[i].thickness = Math.max(10, parseFloat(e.target.value) || 100);
                                  setProfiles(updated);
                                }} style={inputStyle} />
                              </td>
                              <td style={{ padding: "3px 4px", textAlign: "center" }}>
                                <button onClick={() => {
                                  const updated = [...profiles];
                                  const pIdx = updated.findIndex(p => p.id === selectedProfile);
                                  updated[pIdx].layers = updated[pIdx].layers.filter((_, j) => j !== i);
                                  setProfiles(updated);
                                }} style={{ background: "none", border: "none", color: css.red, cursor: "pointer", fontSize: 11 }}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button onClick={() => {
                        const updated = [...profiles];
                        const pIdx = updated.findIndex(p => p.id === selectedProfile);
                        updated[pIdx].layers.push({ soilTypeId: "SA2", thickness: 1000 });
                        setProfiles(updated);
                      }} style={{
                        marginTop: 4, padding: "3px 10px", fontSize: 9, fontFamily: css.mono,
                        background: "rgba(59,130,246,0.1)", border: `1px solid rgba(59,130,246,0.25)`,
                        borderRadius: 4, color: css.accent, cursor: "pointer",
                      }}>+ Laag toevoegen</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ STAP 3: Locaties ═══ */}
        {step === 3 && (
          <div>
            {/* Step detection waarschuwingen */}
            {stepDetection.length > 0 && (
              <div style={{
                padding: 8, marginBottom: 10, background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.2)", borderRadius: 6,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: css.yellow, marginBottom: 4 }}>
                  ⚠ Step detection: {stepDetection.length} locatie(s) met abrupte verandering
                </div>
                <div style={{ fontSize: 9, color: css.dim }}>
                  Op deze locaties verandert de diameter, wanddikte of het maaiveld significant.
                  Wijs hier twee profielen toe (vóór en ná de stap) voor nauwkeurige grondparameters.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {stepDetection.map(s => (
                    <span key={s.nodeIndex} style={{
                      padding: "2px 6px", fontSize: 8, fontFamily: css.mono,
                      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: 3, color: css.yellow,
                    }}>
                      {s.nodeId}: {s.reason}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: css.text }}>Profiel → Locatie toewijzing</span>
              <button onClick={autoAssign} style={{
                padding: "3px 10px", fontSize: 9, fontFamily: css.mono,
                background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 4, color: css.green, cursor: "pointer",
              }}>Auto-toewijzen (met step detection)</button>
            </div>

            <div style={{ fontSize: 9, color: css.dim, marginBottom: 8 }}>
              Nodes zonder profiel worden automatisch geïnterpoleerd op basis van de dichtstbijzijnde profielen.
              Bij een step change kun je twee profielen toewijzen (vóór / ná).
            </div>

            {locations.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: css.dim, fontSize: 10, fontFamily: css.mono }}>
                Geen locaties toegewezen. Klik hierboven om automatisch toe te wijzen met step detection.
              </div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: css.mono }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${css.border}`, position: "sticky", top: 0, background: "#0a0f1a" }}>
                      <th style={{ padding: "3px 6px", textAlign: "left", color: css.muted, fontWeight: 400, fontSize: 8 }}>Node</th>
                      <th style={{ padding: "3px 6px", textAlign: "left", color: css.muted, fontWeight: 400, fontSize: 8 }}>Profiel (vóór)</th>
                      <th style={{ padding: "3px 6px", textAlign: "left", color: css.muted, fontWeight: 400, fontSize: 8 }}>Profiel (ná)</th>
                      <th style={{ padding: "3px 6px", textAlign: "right", color: css.muted, fontWeight: 400, fontSize: 8 }}>Dekking</th>
                      <th style={{ padding: "3px 6px", textAlign: "center", color: css.muted, fontWeight: 400, fontSize: 8 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc, i) => {
                      const node = nodes[loc.nodeIndex];
                      const gl = glevel.find(g => g.nodeIndex === loc.nodeIndex);
                      const cover = gl ? gl.z - (node?.z || 0) : 1200;
                      const isStep = loc.isStepChange;
                      return (
                        <tr key={i} style={{
                          borderBottom: `1px solid ${css.border}11`,
                          background: isStep ? "rgba(251,191,36,0.04)" : loc.isInterpolated ? "rgba(100,116,139,0.04)" : "transparent",
                        }}>
                          <td style={{ padding: "2px 6px", color: isStep ? css.yellow : css.text, fontWeight: 600 }}>
                            {loc.nodeId}
                            {isStep && <span style={{ fontSize: 7, marginLeft: 3 }} title={loc.stepReason}>⚠</span>}
                          </td>
                          <td style={{ padding: "2px 6px" }}>
                            <select value={loc.profileId} onChange={e => {
                              const updated = [...locations];
                              updated[i] = { ...updated[i], profileId: e.target.value, isInterpolated: false };
                              setLocations(updated);
                            }} style={{
                              background: css.bg, border: `1px solid ${css.border}`, borderRadius: 4,
                              padding: "2px 4px", color: loc.isInterpolated ? css.dim : css.text, fontSize: 9, fontFamily: css.mono,
                              fontStyle: loc.isInterpolated ? "italic" : "normal",
                            }}>
                              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "2px 6px" }}>
                            {isStep ? (
                              <select value={loc.profileIdAfter || loc.profileId} onChange={e => {
                                const updated = [...locations];
                                updated[i] = { ...updated[i], profileIdAfter: e.target.value };
                                setLocations(updated);
                              }} style={{
                                background: css.bg, border: `1px solid rgba(251,191,36,0.3)`, borderRadius: 4,
                                padding: "2px 4px", color: css.yellow, fontSize: 9, fontFamily: css.mono,
                              }}>
                                {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontSize: 8, color: css.dim }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "2px 6px", textAlign: "right", color: cover > 600 ? css.green : css.yellow, fontSize: 9 }}>
                            {(cover / 1000).toFixed(2)}m
                          </td>
                          <td style={{ padding: "2px 6px", textAlign: "center", fontSize: 8 }}>
                            {isStep && <span style={{ color: css.yellow }} title={loc.stepReason}>⚠ stap</span>}
                            {loc.isInterpolated && <span style={{ color: css.dim, fontStyle: "italic" }}>interp.</span>}
                            {!isStep && !loc.isInterpolated && <span style={{ color: css.green }}>✓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Samenvatting */}
            {locations.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 8, color: css.dim, fontFamily: css.mono, display: "flex", gap: 12 }}>
                <span>Totaal: {locations.length} nodes</span>
                <span style={{ color: css.green }}>✓ Expliciet: {locations.filter(l => !l.isInterpolated && !l.isStepChange).length}</span>
                <span style={{ color: css.yellow }}>⚠ Step change: {locations.filter(l => l.isStepChange).length}</span>
                <span style={{ color: css.dim }}>○ Geïnterpoleerd: {locations.filter(l => l.isInterpolated).length}</span>
              </div>
            )}
          </div>
        )}

        {/* ═══ STAP 4: Instellingen ═══ */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: css.text, marginBottom: 10 }}>
              Berekeningsinstellingen
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "8px 16px", fontSize: 10, fontFamily: css.mono, maxWidth: 500 }}>
              <span style={{ color: css.muted }}>NEN versie:</span>
              <select value={settings.nenVersion} onChange={e => setSettings({ ...settings, nenVersion: e.target.value as any })}
                style={{ ...inputStyle, width: "auto", textAlign: "left" }}>
                <option value="2020">NEN 3650-1:2020</option>
                <option value="1992">NEN 3650:1992</option>
              </select>

              <span style={{ color: css.muted }}>Installatiemethode:</span>
              <select value={settings.installMethod} onChange={e => setSettings({ ...settings, installMethod: e.target.value as any })}
                style={{ ...inputStyle, width: "auto", textAlign: "left" }}>
                <option value="trench_uncompressed">Sleuf, niet verdicht</option>
                <option value="trench_compressed">Sleuf, verdicht</option>
                <option value="boring">Boring</option>
                <option value="hdd">HDD (gestuurde boring)</option>
              </select>

              <span style={{ color: css.muted }}>γ water [kN/m³]:</span>
              <input type="number" value={settings.gammaWater} step={0.1}
                onChange={e => setSettings({ ...settings, gammaWater: parseFloat(e.target.value) || 10 })}
                style={inputStyle} />

              <span style={{ color: css.muted }}>Reële grondbelasting:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={settings.useRealTopsoil}
                  onChange={e => setSettings({ ...settings, useRealTopsoil: e.target.checked })} />
                <span style={{ color: css.dim, fontSize: 9 }}>
                  {settings.useRealTopsoil ? "Ja — reële grondbelasting (SOILNB)" : "Nee — neutrale grondbelasting"}
                </span>
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <button onClick={() => { calculate(); setStep(5); }} style={{
                padding: "8px 20px", fontSize: 11, fontFamily: css.mono, fontWeight: 700,
                background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)",
                borderRadius: 6, color: css.green, cursor: "pointer",
              }}>
                Bereken grondparameters →
              </button>
            </div>
          </div>
        )}

        {/* ═══ STAP 5: Resultaten ═══ */}
        {step === 5 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: css.text }}>
                Berekende grondparameters ({results.length} nodes)
              </span>
              {results.length === 0 && (
                <button onClick={calculate} style={{
                  padding: "3px 10px", fontSize: 9, fontFamily: css.mono,
                  background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                  borderRadius: 4, color: css.green, cursor: "pointer",
                }}>Bereken</button>
              )}
              {results.length > 0 && onApplySoilParameters && (
                <button onClick={() => onApplySoilParameters(results)} style={{
                  padding: "3px 10px", fontSize: 9, fontFamily: css.mono,
                  background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)",
                  borderRadius: 4, color: css.accent, cursor: "pointer",
                }}>Toepassen op solver →</button>
              )}
            </div>

            {results.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: css.mono }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${css.border}` }}>
                      {["Node", "H_dekking", "σk", "KLH", "KLS", "KLT", "RVS", "RVT", "RH", "F", "UF"].map(h => (
                        <th key={h} style={{ padding: "3px 5px", textAlign: "right", color: css.muted, fontWeight: 400, fontSize: 7, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: `1px solid ${css.border}44` }}>
                      {["", "mm", "kN/m²", "kN/m²", "kN/m²", "kN/m²", "kN/m", "kN/m", "kN/m", "kN/m²", "mm"].map((u, i) => (
                        <th key={i} style={{ padding: "1px 5px", textAlign: "right", color: css.dim, fontWeight: 400, fontSize: 6.5, fontStyle: "italic" }}>{u}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${css.border}11` }}>
                        <td style={{ padding: "2px 5px", color: css.text, fontWeight: 600, textAlign: "left" }}>{r.nodeId}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: r.H_cover < 600 ? css.yellow : css.dim }}>{r.H_cover.toFixed(0)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.dim }}>{r.sigmaK.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.muted }}>{r.KLH.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.muted }}>{r.KLS.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.muted }}>{r.KLT.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.green }}>{r.RVS.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.green }}>{r.RVT.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.green }}>{r.RH.toFixed(1)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.yellow }}>{r.F.toFixed(2)}</td>
                        <td style={{ padding: "2px 5px", textAlign: "right", color: css.dim }}>{r.UF.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {results.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 8, color: css.dim, fontFamily: css.mono }}>
                KLH = horizontale stijfheid · KLS = verticale neerwaarts · KLT = verticale opwaarts ·
                RVS = draagkracht · RVT = opwaartse reactie · RH = horizontale reactie ·
                F = wrijving · UF = wrijvingsverplaatsing
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
