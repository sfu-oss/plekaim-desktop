/**
 * ple-materials.ts
 * KaimPLE — Predefined material database
 *
 * Sources:
 *  - NEN-EN-ISO 3183 (L-serie / API 5L X-serie) — exact overgenomen uit PLE.rkpe (PLE4Win)
 *  - EN 10216-2 (P235GH, P265GH, P355GH) — warmtenet staalsoorten conform NEN 3650 / EN 13941
 *  - EN 10255 / NEN 3650 (P235GH+, P265GH+) — verhoogde taaiheid varianten
 *
 * Eenheden conform PLE4Win / KaimPLE ISTROP tabel:
 *  E, Re    : N/mm² (MPa)
 *  alpha    : 1/°C
 *  weight   : N/mm³  (7.85e-5 = 7850 kg/m³ × 9.81 / 1e9)
 *  nu       : dimensieloos
 */

import type { PleIstrop } from './ple-model';

export interface PleMaterialEntry extends PleIstrop {
  description: string;
  group: string;
  norm: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volledige materialen database
// ─────────────────────────────────────────────────────────────────────────────

export const PLE_MATERIALS: PleMaterialEntry[] = [

  // ── EN 10216-2 / EN 13941 — Warmtenet staal (meest gebruikt in NL district heating) ──

  {
    matRef: 'P235GH',
    description: 'P235GH (Mat. no. 1.0345, EN 10216-2) — Warmtenet, Re=235 N/mm²',
    group: 'EN 10216-2 (Warmtenet)',
    norm: 'EN 10216-2',
    E: 207000, nu: 0.3, alpha: 12e-6, Re: 235, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'P265GH',
    description: 'P265GH (Mat. no. 1.0425, EN 10216-2) — Warmtenet, Re=265 N/mm²',
    group: 'EN 10216-2 (Warmtenet)',
    norm: 'EN 10216-2',
    E: 207000, nu: 0.3, alpha: 12e-6, Re: 265, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'P355GH',
    description: 'P355GH (Mat. no. 1.0473, EN 10216-2) — Warmtenet hogere druk, Re=355 N/mm²',
    group: 'EN 10216-2 (Warmtenet)',
    norm: 'EN 10216-2',
    E: 207000, nu: 0.3, alpha: 12e-6, Re: 355, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'P235GH+',
    description: 'P235GH+ (verhoogde taaiheid) — Re=235 N/mm²',
    group: 'EN 10216-2 (Warmtenet)',
    norm: 'EN 10216-2',
    E: 207000, nu: 0.3, alpha: 12e-6, Re: 235, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'P265GH+',
    description: 'P265GH+ (verhoogde taaiheid) — Re=265 N/mm²',
    group: 'EN 10216-2 (Warmtenet)',
    norm: 'EN 10216-2',
    E: 207000, nu: 0.3, alpha: 12e-6, Re: 265, ReT: null, weight: 7.85e-5,
  },

  // ── NEN-EN-ISO 3183 PSL 2 (N/Q/M varianten) — Gastransport ──
  // Bron: PLE4Win PLE.rkpe (exact)

  {
    matRef: 'L290N',
    description: 'L290N, X42N (Mat. no. 1.8791, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L290Q',
    description: 'L290Q, X42Q (Mat. no. 1.8738, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L290M',
    description: 'L290M, X42M (Mat. no. 1.8747, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L320N',
    description: 'L320N, X46N (Mat. no. 1.8792, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L320Q',
    description: 'L320Q, X46Q (Mat. no. 1.8739, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L320M',
    description: 'L320M, X46M (Mat. no. 1.8748, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L360N',
    description: 'L360N, X52N (Mat. no. 1.8793, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L360Q',
    description: 'L360Q, X52Q (Mat. no. 1.8741, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L360M',
    description: 'L360M, X52M (Mat. no. 1.8749, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L390N',
    description: 'L390N, X56N (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L390Q',
    description: 'L390Q, X56Q (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L390M',
    description: 'L390M, X56M (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L415N',
    description: 'L415N, X60N (Mat. no. 1.8736, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L415Q',
    description: 'L415Q, X60Q (Mat. no. 1.8742, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L415M',
    description: 'L415M, X60M (Mat. no. 1.8752, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L450Q',
    description: 'L450Q, X65Q (Mat. no. 1.8743, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L450M',
    description: 'L450M, X65M (Mat. no. 1.8754, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L485Q',
    description: 'L485Q, X70Q (Mat. no. 1.8744, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L485M',
    description: 'L485M, X70M (Mat. no. 1.8756, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485, ReT: null, weight: 7.85e-5,
  },

  // ── NEN-EN-ISO 3183 PSL 1 (zonder kwaliteitsaanduiding) ──

  {
    matRef: 'L290',
    description: 'L290, X42 (Mat. no. 1.8728, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L320',
    description: 'L320, X46 (Mat. no. 1.8729, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L360',
    description: 'L360, X52 (Mat. no. 1.8730, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L390',
    description: 'L390, X56 (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L415',
    description: 'L415, X60 (Mat. no. 1.8725, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L450',
    description: 'L450, X65 (Mat. no. 1.8726, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'L485',
    description: 'L485, X70 (Mat. no. 1.8727, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485, ReT: null, weight: 7.85e-5,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper functies
// ─────────────────────────────────────────────────────────────────────────────

/** Zoek materiaal op matRef (case-insensitive). */
export function findMaterial(matRef: string): PleMaterialEntry | undefined {
  const key = matRef.trim().toUpperCase();
  return PLE_MATERIALS.find(m => m.matRef.toUpperCase() === key);
}

/** Gegroepeerde lijst voor gebruik in dropdowns. */
export function getMaterialGroups(): Record<string, PleMaterialEntry[]> {
  const groups: Record<string, PleMaterialEntry[]> = {};
  for (const mat of PLE_MATERIALS) {
    if (!groups[mat.group]) groups[mat.group] = [];
    groups[mat.group].push(mat);
  }
  return groups;
}

/** Alle matRef strings gesorteerd — voor autocomplete/select. */
export const MATERIAL_REFS: string[] = PLE_MATERIALS.map(m => m.matRef);

/**
 * Geeft de PleIstrop properties terug voor een matRef.
 * Valt terug op P235GH defaults als materiaal niet gevonden wordt.
 */
export function getMaterialProps(matRef: string): PleIstrop {
  const mat = findMaterial(matRef);
  if (mat) {
    const { description: _d, group: _g, norm: _n, ...istrop } = mat;
    return istrop;
  }
  // Fallback: P235GH (warmtenet default)
  return {
    matRef: matRef || 'P235GH',
    E: 207000,
    nu: 0.3,
    alpha: 12e-6,
    Re: 235,
    ReT: null,
    weight: 7.85e-5,
  };
}
