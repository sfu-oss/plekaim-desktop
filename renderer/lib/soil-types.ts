// ============================================================
// KaimPLE Soil Wizard — Fase 1: Grondtype Database
// ============================================================
// Gebaseerd op NEN 9997-1 en PLE4Win Soil Model Wizard structuur.
// 26 standaard grondtypes verdeeld over 5 hoofdgroepen.
//
// Bronnen:
// - NEN 9997-1 (Geotechnisch ontwerp van constructies)
// - NEN 3650:2020 (Eisen voor buisleidingsystemen)
// - PLE4Win Soil Model Wizard help documentatie
// ============================================================

// ── Grondgroep: bepaalt welke formules gebruikt worden ──
// "granular" = grind, zand, leem → wrijvingshoek-gebaseerde berekening
// "cohesive" = klei, veen → cohesie-gebaseerde berekening
export type SoilGroup = "granular" | "cohesive";

// ── Hoofdtype ──
export type SoilMainType = "gravel" | "sand" | "loam" | "clay" | "peat";

// ── Installatiemethode (NEN 3650:2020) ──
export type InstallationMethod =
  | "trench_uncompressed"   // Sleuf, onverdicht teruggestort
  | "trench_compressed"     // Sleuf, verdicht teruggestort
  | "non_trench_boring"     // Gestuurde boring (HDD)
  | "non_trench_microtunnel" // Microtunneling
  | "non_trench_open";      // Open ontgraving (zonder sleuf)

// ── Volledige grondtype definitie ──
export interface SoilType {
  // Identificatie
  id: string;                    // Unieke sleutel (bijv. "sand_medium")
  name: string;                  // Nederlandse naam
  nameEn: string;                // Engelse naam
  mainType: SoilMainType;        // Hoofdtype
  group: SoilGroup;              // Berekeningsgroep
  color: string;                 // Weergavekleur (hex)

  // Mechanische eigenschappen (NEN 9997-1)
  gamma: number;                 // Volumegewicht droog [kN/m³]
  gamma_sat: number;             // Volumegewicht verzadigd [kN/m³]
  phi: number;                   // Inwendige wrijvingshoek [°]
  phi_pipe_soil: number | null;  // Wrijvingshoek buis-grond [°] (null = afgeleid van phi)
  c: number;                     // Cohesie (gedraineerd) [kPa]
  cu: number;                    // Ongedraineerde schuifsterkte [kPa]
  E_soil: number;                // Elasticiteitsmodulus grond [MPa]
  E_soil_range: [number, number]; // Bereik E_soil [MPa]

  // NEN 3650 parameters
  packing_factor: number;        // Pakkingsfactor [-] (0.1-0.8)
  K0: number;                    // Rustdrukcoëfficiënt [-]
  Ka: number;                    // Actieve gronddrukcoëfficiënt [-]
  Kp: number;                    // Passieve gronddrukcoëfficiënt [-]

  // Afgeleide veerstijfheden (standaard waarden per NEN 3650)
  // Deze worden normaal berekend door de Soil Wizard op basis van
  // dekking, diameter, grondwaterstand, etc.
  // De waarden hieronder zijn voor een "typische" situatie:
  // DN200, 1m dekking, geen grondwater
  k_h: number;                   // Horizontale bedding [kN/m³]
  k_v_up: number;                // Verticale bedding opwaarts [kN/m³]
  k_v_down: number;              // Verticale bedding neerwaarts [kN/m³]

  // Maximale grondreacties (per eenheidsbreedte)
  // Worden berekend op basis van grondeigenschappen + geometrie
  r_h_factor: number;            // Factor voor max horizontale reactie [-]
  r_vt_factor: number;           // Factor voor max opwaartse reactie [-]
  r_vs_factor: number;           // Factor voor max draagkracht [-]
}

// ============================================================
// 26 Standaard Grondtypes (NEN 9997-1)
// ============================================================
// Waarden gebaseerd op NEN 9997-1 Tabel 2b (karakteristieke waarden)
// en NEN 3650 bijlage voor veerstijfheden.

export const SOIL_DATABASE: Record<string, SoilType> = {

  // ────────────────────────────────────────────────────
  // GRIND (Gravel) — granulaire groep
  // ────────────────────────────────────────────────────

  gravel_coarse: {
    id: "gravel_coarse", name: "Grind, grof", nameEn: "Gravel, coarse",
    mainType: "gravel", group: "granular", color: "#B8860B",
    gamma: 19, gamma_sat: 21, phi: 40, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 60, E_soil_range: [40, 100],
    packing_factor: 0.3, K0: 0.36, Ka: 0.22, Kp: 4.60,
    k_h: 20000, k_v_up: 8000, k_v_down: 40000,
    r_h_factor: 5.0, r_vt_factor: 3.0, r_vs_factor: 8.0,
  },

  gravel_fine: {
    id: "gravel_fine", name: "Grind, fijn", nameEn: "Gravel, fine",
    mainType: "gravel", group: "granular", color: "#DAA520",
    gamma: 18, gamma_sat: 20, phi: 37, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 50, E_soil_range: [30, 80],
    packing_factor: 0.3, K0: 0.40, Ka: 0.25, Kp: 4.02,
    k_h: 18000, k_v_up: 7000, k_v_down: 35000,
    r_h_factor: 4.5, r_vt_factor: 2.8, r_vs_factor: 7.0,
  },

  gravel_sandy: {
    id: "gravel_sandy", name: "Grind, zandig", nameEn: "Gravel, sandy",
    mainType: "gravel", group: "granular", color: "#CD853F",
    gamma: 18, gamma_sat: 20, phi: 35, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 40, E_soil_range: [25, 70],
    packing_factor: 0.3, K0: 0.43, Ka: 0.27, Kp: 3.69,
    k_h: 15000, k_v_up: 5000, k_v_down: 25000,
    r_h_factor: 4.0, r_vt_factor: 2.5, r_vs_factor: 6.0,
  },

  // ────────────────────────────────────────────────────
  // ZAND (Sand) — granulaire groep
  // ────────────────────────────────────────────────────

  sand_coarse_dense: {
    id: "sand_coarse_dense", name: "Zand, grof, vast", nameEn: "Sand, coarse, dense",
    mainType: "sand", group: "granular", color: "#F4A460",
    gamma: 18, gamma_sat: 20, phi: 35, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 40, E_soil_range: [25, 60],
    packing_factor: 0.8, K0: 0.43, Ka: 0.27, Kp: 3.69,
    k_h: 12000, k_v_up: 5000, k_v_down: 22000,
    r_h_factor: 3.5, r_vt_factor: 2.2, r_vs_factor: 5.5,
  },

  sand_coarse_loose: {
    id: "sand_coarse_loose", name: "Zand, grof, los", nameEn: "Sand, coarse, loose",
    mainType: "sand", group: "granular", color: "#FFD700",
    gamma: 16, gamma_sat: 19, phi: 30, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 20, E_soil_range: [10, 35],
    packing_factor: 0.3, K0: 0.50, Ka: 0.33, Kp: 3.00,
    k_h: 5000, k_v_up: 2000, k_v_down: 10000,
    r_h_factor: 2.5, r_vt_factor: 1.5, r_vs_factor: 4.0,
  },

  sand_medium_dense: {
    id: "sand_medium_dense", name: "Zand, matig grof, vast", nameEn: "Sand, medium, dense",
    mainType: "sand", group: "granular", color: "#E8C872",
    gamma: 18, gamma_sat: 20, phi: 33, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 30, E_soil_range: [20, 50],
    packing_factor: 0.8, K0: 0.46, Ka: 0.29, Kp: 3.39,
    k_h: 8000, k_v_up: 3500, k_v_down: 16000,
    r_h_factor: 3.0, r_vt_factor: 2.0, r_vs_factor: 5.0,
  },

  sand_medium_loose: {
    id: "sand_medium_loose", name: "Zand, matig grof, los", nameEn: "Sand, medium, loose",
    mainType: "sand", group: "granular", color: "#F0E68C",
    gamma: 16, gamma_sat: 19, phi: 28, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 15, E_soil_range: [8, 25],
    packing_factor: 0.3, K0: 0.53, Ka: 0.36, Kp: 2.77,
    k_h: 4000, k_v_up: 1500, k_v_down: 8000,
    r_h_factor: 2.2, r_vt_factor: 1.3, r_vs_factor: 3.5,
  },

  sand_fine_dense: {
    id: "sand_fine_dense", name: "Zand, fijn, vast", nameEn: "Sand, fine, dense",
    mainType: "sand", group: "granular", color: "#DEB887",
    gamma: 17, gamma_sat: 20, phi: 30, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 25, E_soil_range: [15, 40],
    packing_factor: 0.8, K0: 0.50, Ka: 0.33, Kp: 3.00,
    k_h: 6000, k_v_up: 2500, k_v_down: 12000,
    r_h_factor: 2.8, r_vt_factor: 1.8, r_vs_factor: 4.5,
  },

  sand_fine_loose: {
    id: "sand_fine_loose", name: "Zand, fijn, los", nameEn: "Sand, fine, loose",
    mainType: "sand", group: "granular", color: "#FFDEAD",
    gamma: 15, gamma_sat: 18, phi: 25, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 10, E_soil_range: [5, 18],
    packing_factor: 0.3, K0: 0.58, Ka: 0.41, Kp: 2.46,
    k_h: 3000, k_v_up: 1000, k_v_down: 6000,
    r_h_factor: 2.0, r_vt_factor: 1.0, r_vs_factor: 3.0,
  },

  // ────────────────────────────────────────────────────
  // LEEM (Loam/Silt) — granulaire groep
  // ────────────────────────────────────────────────────

  loam_sandy: {
    id: "loam_sandy", name: "Leem, zandig", nameEn: "Loam, sandy",
    mainType: "loam", group: "granular", color: "#C4A882",
    gamma: 18, gamma_sat: 20, phi: 27, phi_pipe_soil: null,
    c: 3, cu: 15, E_soil: 15, E_soil_range: [8, 25],
    packing_factor: 0.3, K0: 0.55, Ka: 0.38, Kp: 2.66,
    k_h: 4000, k_v_up: 1500, k_v_down: 8000,
    r_h_factor: 2.5, r_vt_factor: 1.5, r_vs_factor: 4.0,
  },

  loam_silty: {
    id: "loam_silty", name: "Leem, siltig", nameEn: "Loam, silty",
    mainType: "loam", group: "granular", color: "#A0826D",
    gamma: 17, gamma_sat: 19, phi: 25, phi_pipe_soil: null,
    c: 5, cu: 20, E_soil: 10, E_soil_range: [5, 18],
    packing_factor: 0.3, K0: 0.58, Ka: 0.41, Kp: 2.46,
    k_h: 3000, k_v_up: 1000, k_v_down: 6000,
    r_h_factor: 2.2, r_vt_factor: 1.3, r_vs_factor: 3.5,
  },

  loam_clayey: {
    id: "loam_clayey", name: "Leem, kleiig", nameEn: "Loam, clayey",
    mainType: "loam", group: "granular", color: "#8B7355",
    gamma: 17, gamma_sat: 19, phi: 22, phi_pipe_soil: null,
    c: 10, cu: 30, E_soil: 8, E_soil_range: [4, 15],
    packing_factor: 0.3, K0: 0.63, Ka: 0.45, Kp: 2.20,
    k_h: 2500, k_v_up: 800, k_v_down: 5000,
    r_h_factor: 2.0, r_vt_factor: 1.2, r_vs_factor: 3.0,
  },

  // ────────────────────────────────────────────────────
  // KLEI (Clay) — cohesieve groep
  // ────────────────────────────────────────────────────

  clay_very_soft: {
    id: "clay_very_soft", name: "Klei, zeer slap", nameEn: "Clay, very soft",
    mainType: "clay", group: "cohesive", color: "#556B2F",
    gamma: 14, gamma_sat: 15, phi: 10, phi_pipe_soil: null,
    c: 2, cu: 10, E_soil: 1.5, E_soil_range: [0.5, 3],
    packing_factor: 0.1, K0: 0.83, Ka: 0.70, Kp: 1.42,
    k_h: 800, k_v_up: 300, k_v_down: 1500,
    r_h_factor: 1.0, r_vt_factor: 0.5, r_vs_factor: 1.5,
  },

  clay_soft: {
    id: "clay_soft", name: "Klei, slap", nameEn: "Clay, soft",
    mainType: "clay", group: "cohesive", color: "#6B8E23",
    gamma: 15, gamma_sat: 16, phi: 13, phi_pipe_soil: null,
    c: 5, cu: 20, E_soil: 3, E_soil_range: [1.5, 5],
    packing_factor: 0.1, K0: 0.77, Ka: 0.63, Kp: 1.59,
    k_h: 1200, k_v_up: 400, k_v_down: 2500,
    r_h_factor: 1.3, r_vt_factor: 0.7, r_vs_factor: 2.0,
  },

  clay_moderate: {
    id: "clay_moderate", name: "Klei, matig vast", nameEn: "Clay, moderate",
    mainType: "clay", group: "cohesive", color: "#808000",
    gamma: 17, gamma_sat: 18, phi: 18, phi_pipe_soil: null,
    c: 10, cu: 40, E_soil: 7, E_soil_range: [4, 12],
    packing_factor: 0.3, K0: 0.69, Ka: 0.53, Kp: 1.89,
    k_h: 2000, k_v_up: 700, k_v_down: 4000,
    r_h_factor: 1.8, r_vt_factor: 1.0, r_vs_factor: 3.0,
  },

  clay_stiff: {
    id: "clay_stiff", name: "Klei, stevig", nameEn: "Clay, stiff",
    mainType: "clay", group: "cohesive", color: "#4B5320",
    gamma: 19, gamma_sat: 20, phi: 22, phi_pipe_soil: null,
    c: 20, cu: 75, E_soil: 15, E_soil_range: [8, 25],
    packing_factor: 0.3, K0: 0.63, Ka: 0.45, Kp: 2.20,
    k_h: 4000, k_v_up: 1500, k_v_down: 8000,
    r_h_factor: 2.5, r_vt_factor: 1.5, r_vs_factor: 4.5,
  },

  clay_very_stiff: {
    id: "clay_very_stiff", name: "Klei, zeer stevig", nameEn: "Clay, very stiff",
    mainType: "clay", group: "cohesive", color: "#3B4613",
    gamma: 20, gamma_sat: 21, phi: 25, phi_pipe_soil: null,
    c: 40, cu: 150, E_soil: 25, E_soil_range: [15, 40],
    packing_factor: 0.8, K0: 0.58, Ka: 0.41, Kp: 2.46,
    k_h: 6000, k_v_up: 2500, k_v_down: 12000,
    r_h_factor: 3.0, r_vt_factor: 2.0, r_vs_factor: 5.5,
  },

  clay_organic_soft: {
    id: "clay_organic_soft", name: "Klei, organisch, slap", nameEn: "Clay, organic, soft",
    mainType: "clay", group: "cohesive", color: "#3C341F",
    gamma: 13, gamma_sat: 14, phi: 10, phi_pipe_soil: null,
    c: 3, cu: 12, E_soil: 2, E_soil_range: [0.8, 4],
    packing_factor: 0.1, K0: 0.83, Ka: 0.70, Kp: 1.42,
    k_h: 600, k_v_up: 200, k_v_down: 1200,
    r_h_factor: 0.8, r_vt_factor: 0.4, r_vs_factor: 1.2,
  },

  clay_organic_stiff: {
    id: "clay_organic_stiff", name: "Klei, organisch, stevig", nameEn: "Clay, organic, stiff",
    mainType: "clay", group: "cohesive", color: "#5C4033",
    gamma: 16, gamma_sat: 17, phi: 17, phi_pipe_soil: null,
    c: 12, cu: 45, E_soil: 6, E_soil_range: [3, 10],
    packing_factor: 0.3, K0: 0.71, Ka: 0.55, Kp: 1.83,
    k_h: 2000, k_v_up: 600, k_v_down: 3500,
    r_h_factor: 1.5, r_vt_factor: 0.8, r_vs_factor: 2.5,
  },

  // ────────────────────────────────────────────────────
  // VEEN (Peat) — cohesieve groep
  // ────────────────────────────────────────────────────

  peat_fibrous: {
    id: "peat_fibrous", name: "Veen, vezelachtig", nameEn: "Peat, fibrous",
    mainType: "peat", group: "cohesive", color: "#2F1F0F",
    gamma: 10, gamma_sat: 11, phi: 10, phi_pipe_soil: null,
    c: 3, cu: 8, E_soil: 1, E_soil_range: [0.3, 2],
    packing_factor: 0.1, K0: 0.83, Ka: 0.70, Kp: 1.42,
    k_h: 300, k_v_up: 100, k_v_down: 600,
    r_h_factor: 0.5, r_vt_factor: 0.3, r_vs_factor: 0.8,
  },

  peat_amorphous: {
    id: "peat_amorphous", name: "Veen, amorf", nameEn: "Peat, amorphous",
    mainType: "peat", group: "cohesive", color: "#1A0F05",
    gamma: 11, gamma_sat: 12, phi: 8, phi_pipe_soil: null,
    c: 2, cu: 5, E_soil: 0.8, E_soil_range: [0.2, 1.5],
    packing_factor: 0.1, K0: 0.86, Ka: 0.73, Kp: 1.37,
    k_h: 200, k_v_up: 80, k_v_down: 400,
    r_h_factor: 0.4, r_vt_factor: 0.2, r_vs_factor: 0.6,
  },

  peat_clayey: {
    id: "peat_clayey", name: "Veen, kleiig", nameEn: "Peat, clayey",
    mainType: "peat", group: "cohesive", color: "#3D2B1F",
    gamma: 12, gamma_sat: 13, phi: 12, phi_pipe_soil: null,
    c: 5, cu: 15, E_soil: 2, E_soil_range: [0.8, 4],
    packing_factor: 0.1, K0: 0.79, Ka: 0.66, Kp: 1.53,
    k_h: 500, k_v_up: 200, k_v_down: 1000,
    r_h_factor: 0.7, r_vt_factor: 0.4, r_vs_factor: 1.0,
  },

  // ────────────────────────────────────────────────────
  // SPECIALE TYPES
  // ────────────────────────────────────────────────────

  fill_sand: {
    id: "fill_sand", name: "Aanvulzand", nameEn: "Fill, sand",
    mainType: "sand", group: "granular", color: "#EDD9A3",
    gamma: 16, gamma_sat: 18, phi: 25, phi_pipe_soil: null,
    c: 0, cu: 0, E_soil: 10, E_soil_range: [5, 18],
    packing_factor: 0.3, K0: 0.58, Ka: 0.41, Kp: 2.46,
    k_h: 3000, k_v_up: 1000, k_v_down: 6000,
    r_h_factor: 2.0, r_vt_factor: 1.0, r_vs_factor: 3.0,
  },

  fill_mixed: {
    id: "fill_mixed", name: "Aangevoerde grond (gemengd)", nameEn: "Fill, mixed",
    mainType: "loam", group: "granular", color: "#A89060",
    gamma: 16, gamma_sat: 18, phi: 22, phi_pipe_soil: null,
    c: 5, cu: 10, E_soil: 8, E_soil_range: [3, 15],
    packing_factor: 0.3, K0: 0.63, Ka: 0.45, Kp: 2.20,
    k_h: 2500, k_v_up: 800, k_v_down: 5000,
    r_h_factor: 1.8, r_vt_factor: 1.0, r_vs_factor: 2.5,
  },

  boulder_clay: {
    id: "boulder_clay", name: "Keileem", nameEn: "Boulder clay (till)",
    mainType: "clay", group: "cohesive", color: "#696969",
    gamma: 21, gamma_sat: 22, phi: 28, phi_pipe_soil: null,
    c: 15, cu: 100, E_soil: 30, E_soil_range: [15, 50],
    packing_factor: 0.8, K0: 0.53, Ka: 0.36, Kp: 2.77,
    k_h: 8000, k_v_up: 3000, k_v_down: 15000,
    r_h_factor: 3.5, r_vt_factor: 2.2, r_vs_factor: 6.0,
  },
};

// ============================================================
// Helper functies
// ============================================================

/** Alle grondtypes als array */
export const ALL_SOIL_TYPES = Object.values(SOIL_DATABASE);

/** Grondtypes per hoofdgroep */
export function getSoilTypesByMainType(mainType: SoilMainType): SoilType[] {
  return ALL_SOIL_TYPES.filter(s => s.mainType === mainType);
}

/** Grondtypes per berekeningsgroep */
export function getSoilTypesByGroup(group: SoilGroup): SoilType[] {
  return ALL_SOIL_TYPES.filter(s => s.group === group);
}

/** Zoek grondtype op naam (Nederlands of Engels, case-insensitive) */
export function findSoilType(name: string): SoilType | undefined {
  const lower = name.toLowerCase();
  return ALL_SOIL_TYPES.find(s =>
    s.name.toLowerCase() === lower ||
    s.nameEn.toLowerCase() === lower ||
    s.id === lower
  );
}

// ============================================================
// NEN 3650 Grondmechanische Berekeningen (Fase 2 — stubs)
// ============================================================
// Deze functies worden in Fase 2 geïmplementeerd met de volledige
// NEN 3650 formules. Voorlopig retourneren ze de standaard waarden
// uit de database.

export interface SoilCalcInput {
  soilType: SoilType;
  D_outer: number;        // Buitendiameter buis [mm]
  D_coating: number;      // Manteldiameter [mm]
  t_wall: number;         // Wanddikte [mm]
  cover: number;          // Gronddekking [mm]
  waterLevel: number;     // Grondwaterniveau t.o.v. maaiveld [mm] (0 = geen)
  installMethod: InstallationMethod;
  trenchWidth?: number;   // Sleufbreedte [mm] (alleen bij sleufinstallatie)
}

export interface SoilCalcResult {
  KLH: number;            // Horizontale grondstijfheid [kN/m³]
  KLS: number;            // Verticale grondstijfheid omlaag [kN/m³]
  KLT: number;            // Verticale grondstijfheid omhoog [kN/m³]
  RH: number;             // Max horizontale grondreactie [kN/m]
  RVT: number;            // Max opwaartse grondreactie [kN/m]
  RVS: number;            // Draagkracht ondergrond [kN/m]
  F_friction: number;     // Buis-grond wrijvingscoëfficiënt [-]
  SOILNB: number;         // Neutrale bovengrondbelasting [kN/m]
}

/**
 * Bereken grondmechanische parameters per NEN 3650.
 * Fase 1: gebruikt standaard waarden uit de database.
 * Fase 2: volledige NEN 3650 formules.
 */
export function calculateSoilParameters(input: SoilCalcInput): SoilCalcResult {
  const { soilType, D_coating, cover } = input;

  // Effectieve dekking in meters
  const h = cover / 1000;
  const D_m = D_coating / 1000;

  // Schaalfactor: veerstijfheden zijn evenredig met dekking
  const hFactor = Math.max(h, 0.3);

  // Wrijvingscoëfficiënt buis-grond
  const delta = soilType.phi_pipe_soil ?? (soilType.group === "granular"
    ? soilType.phi * 2 / 3
    : Math.min(soilType.phi, 20));
  const F_friction = Math.tan(delta * Math.PI / 180);

  // Neutrale bovengrondbelasting (Marston formule, vereenvoudigd)
  const SOILNB = soilType.gamma * h * D_m; // kN/m

  // Passieve gronddruk coefficient
  const Kp = soilType.Kp;

  return {
    KLH: soilType.k_h * hFactor,
    KLS: soilType.k_v_down * hFactor,
    KLT: soilType.k_v_up * hFactor,
    RH: soilType.r_h_factor * soilType.gamma * h * Kp * D_m,
    RVT: soilType.r_vt_factor * soilType.gamma * h * D_m,
    RVS: soilType.r_vs_factor * soilType.gamma * h * D_m * Kp,
    F_friction,
    SOILNB,
  };
}

// ============================================================
// Backward-compatible SOIL_TYPES export
// ============================================================
// Voor drop-in vervanging van de huidige SOIL_TYPES in page.tsx

export const SOIL_TYPES_COMPAT: Record<string, {
  gamma: number; phi: number; c: number;
  k_h: number; k_v_up: number; k_v_down: number; E_soil: number;
}> = {};

// Genereer de backward-compatible map
for (const soil of ALL_SOIL_TYPES) {
  SOIL_TYPES_COMPAT[soil.name] = {
    gamma: soil.gamma,
    phi: soil.phi,
    c: soil.c,
    k_h: soil.k_h,
    k_v_up: soil.k_v_up,
    k_v_down: soil.k_v_down,
    E_soil: soil.E_soil,
  };
}

// ============================================================
// PLE4Win x0_Layer Reference Data
// ============================================================
// Exact data uit PLE4Win v4.9.0 Ple4Win.tpa database (x0_Layer tabel).
// Deze waarden zijn de officiële PLE4Win bodemparameters.
//
// Eenheden PLE4Win intern (N/mm systeem):
//   gamma, gamma_sat : N/mm³ (×1e6 = kN/m³)
//   c'               : N/mm² (×1e3 = kPa)
//   cu               : N/mm² (×1e3 = kPa)
//   G, E, E_trench   : N/mm² (= MPa)
//   kvmin            : N/mm³
//   phi, delta       : graden
//   fm, mu, mu_compr : dimensieloos

export interface Ple4WinSoilLayer {
  layerId: number;
  name: string;             // PLE4Win layer_name
  layerType: number;        // 1=sand, 2=clay, 3=peat, 4=gravel, 5=loam
  layerSubtype: number;     // PLE4Win subtype
  // In kN/m³ (geconverteerd van PLE4Win N/mm³)
  gamma: number;
  gamma_sat: number;
  // Graden
  phi: number;
  delta: number;
  // In kPa (geconverteerd van PLE4Win N/mm²)
  c_prime: number;          // c' (effectieve cohesie)
  cu: number;               // ongedraineerde schuifsterkte
  // Dimensieloos
  fm: number;               // wrijvingsfactor
  mu: number;               // Poisson-achtige ratio
  mu_compr: number;         // compressiefactor
  // In N/mm³ (PLE4Win origineel)
  kvmin: number;
  // In MPa (= N/mm²)
  G: number;                // schuifmodulus
  E: number;                // elasticiteitsmodulus
  UF: number;               // onbelastefactor
}

export const PLE4WIN_SOIL_LAYERS: Ple4WinSoilLayer[] = [
  // ── Zand (Sand) ──
  { layerId: 1,  name: "Sand; clean; loose",          layerType: 1, layerSubtype: 1,  gamma: 17.0, gamma_sat: 19.0, phi: 30,    delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0.075, mu_compr: 0.02, kvmin: 2.4,  G: 5.8,   E: 15,    UF: 6.5 },
  { layerId: 2,  name: "Sand; clean; moderate",        layerType: 1, layerSubtype: 1,  gamma: 18.0, gamma_sat: 20.0, phi: 32.5,  delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0.075, mu_compr: 0.02, kvmin: 2.4,  G: 16.7,  E: 45,    UF: 4.0 },
  { layerId: 3,  name: "Sand; clean; firm",            layerType: 1, layerSubtype: 1,  gamma: 19.5, gamma_sat: 21.5, phi: 37.5,  delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0.075, mu_compr: 0.02, kvmin: 5.5,  G: 32.1,  E: 92.5,  UF: 2.0 },
  { layerId: 4,  name: "Sand; slightly silty/clayey",  layerType: 1, layerSubtype: 2,  gamma: 18.5, gamma_sat: 20.5, phi: 29.75, delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0.075, mu_compr: 0.02, kvmin: 2.4,  G: 16.2,  E: 42,    UF: 4.0 },
  { layerId: 5,  name: "Sand; highly silty/clayey",    layerType: 1, layerSubtype: 3,  gamma: 18.5, gamma_sat: 20.5, phi: 27.5,  delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0.075, mu_compr: 0.02, kvmin: 2.4,  G: 8.7,   E: 22.5,  UF: 4.0 },
  // ── Klei (Clay) ──
  { layerId: 6,  name: "Clay; clean; weak",            layerType: 2, layerSubtype: -1, gamma: 14.0, gamma_sat: 14.0, phi: 17.5,  delta: 11.7, c_prime: 0,     cu: 25,     fm: 0.3, mu: 0.2,   mu_compr: 0.10, kvmin: 0.4,  G: 0.31,  E: 1,     UF: 8.0 },
  { layerId: 7,  name: "Clay; clean; moderate",        layerType: 2, layerSubtype: -1, gamma: 17.0, gamma_sat: 17.0, phi: 17.5,  delta: 11.7, c_prime: 5,     cu: 50,     fm: 0.3, mu: 0.175, mu_compr: 0.088,kvmin: 0.6,  G: 0.72,  E: 2,     UF: 5.0 },
  { layerId: 8,  name: "Clay; clean; firm",            layerType: 2, layerSubtype: -1, gamma: 19.5, gamma_sat: 19.5, phi: 21.25, delta: 14.3, c_prime: 14,    cu: 150,    fm: 0.3, mu: 0.15,  mu_compr: 0.075,kvmin: 0.8,  G: 2.38,  E: 7,     UF: 3.0 },
  { layerId: 9,  name: "Clay; slightly sandy; weak",   layerType: 2, layerSubtype: -1, gamma: 15.0, gamma_sat: 15.0, phi: 22.5,  delta: 15,   c_prime: 0,     cu: 40,     fm: 0.3, mu: 0.2,   mu_compr: 0.10, kvmin: 0.4,  G: 0.52,  E: 1.5,   UF: 8.0 },
  { layerId: 10, name: "Clay; slightly sandy; moderate",layerType: 2, layerSubtype: -1, gamma: 18.0, gamma_sat: 18.0, phi: 22.5,  delta: 15,   c_prime: 5,     cu: 80,     fm: 0.3, mu: 0.175, mu_compr: 0.088,kvmin: 0.6,  G: 1.03,  E: 3,     UF: 5.0 },
  { layerId: 11, name: "Clay; slightly sandy; firm",   layerType: 2, layerSubtype: -1, gamma: 20.5, gamma_sat: 20.5, phi: 25,    delta: 16.7, c_prime: 14,    cu: 145,    fm: 0.3, mu: 0.15,  mu_compr: 0.075,kvmin: 0.8,  G: 2.59,  E: 7.5,   UF: 3.0 },
  { layerId: 13, name: "Clay; highly sandy",           layerType: 2, layerSubtype: -1, gamma: 19.0, gamma_sat: 19.0, phi: 30,    delta: 20,   c_prime: 0.5,   cu: 5,      fm: 0.3, mu: 0.1,   mu_compr: 0.04, kvmin: 1.5,  G: 1.38,  E: 3.5,   UF: 5.0 },
  { layerId: 14, name: "Clay; organic; weak",          layerType: 2, layerSubtype: -1, gamma: 13.0, gamma_sat: 13.0, phi: 15,    delta: 10,   c_prime: 0.5,   cu: 10,     fm: 0.3, mu: 0.2,   mu_compr: 0.10, kvmin: 0.4,  G: 0.21,  E: 0.5,   UF: 8.0 },
  { layerId: 15, name: "Clay; organic; moderate",      layerType: 2, layerSubtype: -1, gamma: 15.5, gamma_sat: 15.5, phi: 15,    delta: 10,   c_prime: 0.5,   cu: 27.5,   fm: 0.3, mu: 0.175, mu_compr: 0.088,kvmin: 0.6,  G: 0.52,  E: 1.5,   UF: 5.0 },
  // ── Veen (Peat) ──
  { layerId: 16, name: "Peat; not preloaded; weak",    layerType: 3, layerSubtype: -1, gamma: 11.0, gamma_sat: 11.0, phi: 15,    delta: 0,    c_prime: 1.75,  cu: 15,     fm: 0.3, mu: 0.2,   mu_compr: 0.10, kvmin: 0.4,  G: 0.12,  E: 0.35,  UF: 12.5},
  { layerId: 17, name: "Peat; moderately preloaded; moderate", layerType: 3, layerSubtype: -1, gamma: 12.5, gamma_sat: 12.5, phi: 15, delta: 0, c_prime: 3.75, cu: 25,   fm: 0.3, mu: 0.2,   mu_compr: 0.10, kvmin: 0.4,  G: 0.25,  E: 0.75,  UF: 8.0 },
  // ── Leem (Loam) ──
  { layerId: 18, name: "Loam; slightly sandy; weak",   layerType: 5, layerSubtype: -1, gamma: 19.0, gamma_sat: 19.0, phi: 28.75, delta: 20,   c_prime: 0,     cu: 50,     fm: 0.3, mu: 0.11,  mu_compr: 0.05, kvmin: 1.6,  G: 0.78,  E: 2,     UF: 6.5 },
  { layerId: 19, name: "Loam; slightly sandy; moderate",layerType: 5, layerSubtype: -1, gamma: 20.0, gamma_sat: 20.0, phi: 30,    delta: 20,   c_prime: 1,     cu: 100,    fm: 0.3, mu: 0.11,  mu_compr: 0.05, kvmin: 1.6,  G: 1.11,  E: 3,     UF: 4.0 },
  { layerId: 20, name: "Loam; slightly sandy; firm",   layerType: 5, layerSubtype: -1, gamma: 21.5, gamma_sat: 21.5, phi: 31.25, delta: 20,   c_prime: 3.15,  cu: 250,    fm: 0.3, mu: 0.11,  mu_compr: 0.05, kvmin: 1.6,  G: 2.22,  E: 6,     UF: 2.0 },
  { layerId: 21, name: "Loam; highly sandy",           layerType: 5, layerSubtype: -1, gamma: 19.5, gamma_sat: 19.5, phi: 31.25, delta: 20,   c_prime: 0.5,   cu: 75,     fm: 0.3, mu: 0.11,  mu_compr: 0.05, kvmin: 1.6,  G: 1.44,  E: 4,     UF: 4.0 },
  // ── Grind (Gravel) ──
  { layerId: 22, name: "Gravel; slightly silty; loose", layerType: 4, layerSubtype: -1, gamma: 17.0, gamma_sat: 19.0, phi: 32.5,  delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0,     mu_compr: 0,    kvmin: 2.4,  G: 16.7,  E: 45,    UF: 6.5 },
  { layerId: 23, name: "Gravel; slightly silty; moderate",layerType: 4, layerSubtype: -1,gamma: 18.0, gamma_sat: 20.0, phi: 35,    delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0,     mu_compr: 0,    kvmin: 2.4,  G: 27.8,  E: 75,    UF: 4.0 },
  { layerId: 24, name: "Gravel; slightly silty; firm",  layerType: 4, layerSubtype: -1, gamma: 19.5, gamma_sat: 21.5, phi: 38.75, delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0,     mu_compr: 0,    kvmin: 5.5,  G: 36.1,  E: 97.5,  UF: 2.0 },
  { layerId: 25, name: "Gravel; highly silty; loose",   layerType: 4, layerSubtype: -1, gamma: 18.0, gamma_sat: 20.0, phi: 30,    delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0,     mu_compr: 0,    kvmin: 2.4,  G: 11.1,  E: 30,    UF: 6.5 },
  { layerId: 26, name: "Gravel; highly silty; moderate",layerType: 4, layerSubtype: -1, gamma: 19.0, gamma_sat: 21.0, phi: 32.5,  delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0,     mu_compr: 0,    kvmin: 2.4,  G: 16.7,  E: 45,    UF: 4.0 },
  { layerId: 27, name: "Gravel; highly silty; firm",    layerType: 4, layerSubtype: -1, gamma: 20.5, gamma_sat: 22.25,phi: 37.5,  delta: 20,   c_prime: 0,     cu: 0,      fm: 0.3, mu: 0,     mu_compr: 0,    kvmin: 5.5,  G: 34.26, E: 92.5,  UF: 2.0 },
];

/** Zoek PLE4Win soil layer op naam (case-insensitive partial match). */
export function findPle4WinLayer(name: string): Ple4WinSoilLayer | undefined {
  const key = name.toLowerCase();
  return PLE4WIN_SOIL_LAYERS.find(l => l.name.toLowerCase().includes(key));
}

/** Zoek PLE4Win soil layer op ID. */
export function getPle4WinLayerById(id: number): Ple4WinSoilLayer | undefined {
  return PLE4WIN_SOIL_LAYERS.find(l => l.layerId === id);
}

/** Mapping PLE4Win layerType → KaimPLE mainType. */
export function ple4winLayerTypeToMainType(layerType: number): SoilMainType {
  switch (layerType) {
    case 1: return "sand";
    case 2: return "clay";
    case 3: return "peat";
    case 4: return "gravel";
    case 5: return "loam";
    default: return "sand";
  }
}
