/**
 * ple-materials.ts
 * KaimPLE — Complete predefined material database
 *
 * Sources:
 *  - PLE4Win PLE.rkp (v4.9.0) — 62 staalsoorten, exact overgenomen
 *  - NEN-EN-ISO 3183:2012 (L-serie PSL 1/2 + Annex M varianten)
 *  - EN 10216-2 / EN 10217 (P235GH, P265GH, 16Mo3, 13CrMo4-5)
 *  - EN 10216-5 (Duplex, Super Duplex RVS)
 *  - ASTM A106/A312 (K03006, TP304/316)
 *
 * Eenheden conform PLE4Win ISTROP tabel:
 *  E, Re    : N/mm² (MPa)
 *  alpha    : 1/°C
 *  weight   : N/mm³  (7.7e-5 ≈ 7700 kg/m³; PLE4Win standaard)
 *  nu       : dimensieloos
 *
 * BELANGRIJK: PLE4Win gebruikt weight=7.7e-5 (niet 7.85e-5).
 * Dit is de PLE4Win conventie. Voor staal is 7.85e-5 nauwkeuriger,
 * maar voor compatibiliteit met PLE4Win hanteren we hun waarden.
 */

import type { PleIstrop } from './ple-model';

export interface PleMaterialEntry extends PleIstrop {
  description: string;
  group: string;
  norm: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volledige materialen database (62 materialen uit PLE4Win + 5 KaimPLE extras)
// ─────────────────────────────────────────────────────────────────────────────

export const PLE_MATERIALS: PleMaterialEntry[] = [
  // ── NEN-EN-ISO 3183 Annex M ──
  {
    matRef: 'L245NE',
    description: 'L245NE (Mat. no. 1.0457, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 245.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L245ME',
    description: 'L245ME (Mat. no. 1.0418, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 245.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L290NE',
    description: 'L290NE (Mat. no. 1.0484, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L290ME',
    description: 'L290ME (Mat. no. 1.0429, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360NE',
    description: 'L360NE (Mat. no. 1.0582, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360QE',
    description: 'L360QE (Mat. no. 1.8948, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360ME',
    description: 'L360ME (Mat. no. 1.0578, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390NE',
    description: 'L390NE (Mat. no. 1.8724, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390QE',
    description: 'L390QE (Mat. no. 1.8724, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390ME',
    description: 'L390ME (Mat. no. 1.8724, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415NE',
    description: 'L415NE (Mat. no. 1.8972, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415QE',
    description: 'L415QE (Mat. no. 1.8947, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415ME',
    description: 'L415ME (Mat. no. 1.8973, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L450QE',
    description: 'L450QE (Mat. no. 1.8952, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L450ME',
    description: 'L450ME (Mat. no. 1.8975, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L485QE',
    description: 'L485QE (Mat. no. 1.8955, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L485ME',
    description: 'L485ME (Mat. no. 1.8977, NEN-EN-ISO 3183:2012 (Annex M))',
    group: 'NEN-EN-ISO 3183 Annex M',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485.0, ReT: null, weight: 7.7e-05,
  },
  // ── NEN-EN-ISO 3183 PSL 2 ──
  {
    matRef: 'L245N',
    description: 'L245N, BN (Mat. no. 1.879, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 245.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L245Q',
    description: 'L245Q, BQ (Mat. no. 1.8737, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 245.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L245M',
    description: 'L245M, BM (Mat. no. 1.8746, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 245.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L290N',
    description: 'L290N, X42N (Mat. no. 1.8791, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L290Q',
    description: 'L290Q, X42Q (Mat. no. 1.8738, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L290M',
    description: 'L290M, X42M (Mat. no. 1.8747, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L320N',
    description: 'L320N, X46N (Mat. no. 1.8792, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L320Q',
    description: 'L320Q, X46Q (Mat. no. 1.8739, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L320M',
    description: 'L320M, X46M (Mat. no. 1.8748, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360N',
    description: 'L360N, X52N (Mat. no. 1.8793, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360Q',
    description: 'L360Q, X52Q (Mat. no. 1.8741, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360M',
    description: 'L360M, X52M (Mat. no. 1.8749, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390N',
    description: 'L390N, X56N (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390Q',
    description: 'L390Q, X56Q (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390M',
    description: 'L390M, X56M (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415N',
    description: 'L415N, X60N (Mat. no. 1.8736, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415Q',
    description: 'L415Q, X60Q (Mat. no. 1.8742, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415M',
    description: 'L415M, X60M (Mat. no. 1.8752, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L450Q',
    description: 'L450Q, X65Q (Mat. no. 1.8743, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L450M',
    description: 'L450M, X65M (Mat. no. 1.8754, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L485Q',
    description: 'L485Q, X70Q (Mat. no. 1.8744, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L485M',
    description: 'L485M, X70M (Mat. no. 1.8756, NEN-EN-ISO 3183 PSL 2)',
    group: 'NEN-EN-ISO 3183 PSL 2',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485.0, ReT: null, weight: 7.7e-05,
  },
  // ── NEN-EN-ISO 3183 PSL 1 ──
  {
    matRef: 'L210',
    description: 'L210, A (Mat. no. 1.8713, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 210.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L245',
    description: 'L245, B (Mat. no. 1.8723, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 245.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L290',
    description: 'L290, X42 (Mat. no. 1.8728, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L320',
    description: 'L320, X46 (Mat. no. 1.8729, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 320.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L360',
    description: 'L360, X52 (Mat. no. 1.873, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 360.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L390',
    description: 'L390, X56 (Mat. no. 1.8724, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 390.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L415',
    description: 'L415, X60 (Mat. no. 1.8725, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L450',
    description: 'L450, X65 (Mat. no. 1.8726, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 450.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'L485',
    description: 'L485, X70 (Mat. no. 1.8727, NEN-EN-ISO 3183 PSL 1)',
    group: 'NEN-EN-ISO 3183 PSL 1',
    norm: 'NEN-EN-ISO 3183',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 485.0, ReT: null, weight: 7.7e-05,
  },
  // ── EN 10216/10217 ──
  {
    matRef: 'P235GH',
    description: 'P235GH (Mat. no. 1.0345, NEN-EN 10216-2, NEN-EN 10217-2, NEN-EN 10217-5)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 225.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'P265GH',
    description: 'P265GH (Mat. no. 1.0425, NEN-EN 10216-2, NEN-EN 10217-2, NEN-EN 10217-5)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 255.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: '16Mo3',
    description: '16Mo3 (Mat. no. 1.5415, NEN-EN 10216-2, NEN-EN 10217-2, NEN-EN 10217-5)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 270.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'P235TR1',
    description: 'P235TR1 (Mat. no. 1.0254, NEN-EN 10216-1, NEN-EN 10217-1)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 225.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: '13CrMo45',
    description: '13CrMo4-5 (Mat. no. 1.7335, NEN-EN 10216-2)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 290.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'P355NH',
    description: 'P355NH (Mat. no. 1.0565, NEN-EN 10217-3)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 345.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'P355NL1',
    description: 'P355NL1 (Mat. no. 1.0566, NEN-EN 10217-3)',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 355.0, ReT: null, weight: 7.7e-05,
  },
  // ── Duplex / RVS ──
  {
    matRef: 'S31254',
    description: 'X1CrNiMoCuN20-18-7 (Mat. no. 1.4547 / S31254, NEN-EN 10216-5, NEN-EN 10216-7)',
    group: 'Duplex / RVS',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 267.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'S31803',
    description: 'X2CrNiMoN 22-5-3 (Mat. no. 1.4462 / S31803, NEN-EN 10216-5, NEN-EN 10216-7)',
    group: 'Duplex / RVS',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 415.0, ReT: null, weight: 7.7e-05,
  },
  // ── ASTM ──
  {
    matRef: 'K03006',
    description: 'Grade B / Grade 6 seamless (Mat. no. K03006, ASTM A106, ASME SA-106, ASTM A333, ASME SA-333)',
    group: 'ASTM',
    norm: 'ASTM',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 240.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'TP304',
    description: 'TP304 (Mat. no. S30400, ASTM A312)',
    group: 'ASTM',
    norm: 'ASTM',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 205.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'TP304L',
    description: 'TP304L (Mat. no. S30403, ASTM A312)',
    group: 'ASTM',
    norm: 'ASTM',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 170.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'TP316',
    description: 'TP316 (Mat. no. S31600, ASTM A312)',
    group: 'ASTM',
    norm: 'ASTM',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 205.0, ReT: null, weight: 7.7e-05,
  },
  {
    matRef: 'TP316L',
    description: 'TP316L (Mat. no. S31603, ASTM A312)',
    group: 'ASTM',
    norm: 'ASTM',
    E: 207000, nu: 0.3, alpha: 1.17e-5, Re: 170.0, ReT: null, weight: 7.7e-05,
  },

  // ── KaimPLE extra: EN 10216-2 met alpha=1.2e-5 (correct voor warmtenet bij T>100°C) ──

  {
    matRef: 'P235GH+',
    description: 'P235GH+ (verhoogde taaiheid, EN 10216-2) — Re=235 N/mm²',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.2e-5, Re: 235, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'P265GH+',
    description: 'P265GH+ (verhoogde taaiheid, EN 10216-2) — Re=265 N/mm²',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.2e-5, Re: 265, ReT: null, weight: 7.85e-5,
  },
  {
    matRef: 'P355GH',
    description: 'P355GH (Mat. no. 1.0473, EN 10216-2) — Warmtenet hogere druk, Re=355 N/mm²',
    group: 'EN 10216/10217',
    norm: 'EN 10216/10217',
    E: 207000, nu: 0.3, alpha: 1.2e-5, Re: 355, ReT: null, weight: 7.85e-5,
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
    alpha: 1.2e-5,
    Re: 235,
    ReT: null,
    weight: 7.85e-5,
  };
}
