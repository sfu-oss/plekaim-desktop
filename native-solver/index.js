/**
 * KaimPLE Native FEM Engine — JS wrapper
 *
 * Loads the compiled C++ engine and exposes solve().
 * The engine handles the COMPLETE FEM pipeline natively:
 *   subdivision → sparse assembly → solve → forces → stresses → UC
 *
 * Input:  JS object with model data (nodes, elements, mat, BCs, soil, loads)
 * Output: JS object with results (nodeResults[], stats, maxUC, maxVM)
 */

let engine = null;
let loadError = null;

try {
  engine = require('./build/Release/kaimple_engine');
} catch (e) {
  try {
    engine = require('./build/Debug/kaimple_engine');
  } catch (e2) {
    loadError = e.message;
  }
}

function isAvailable() {
  return engine !== null;
}

function getLoadError() {
  return loadError;
}

/**
 * Run complete FEM analysis natively.
 *
 * @param {object} input - Model data matching FemSolverInput interface
 * @returns {{ nodeResults, maxUC, maxVM, nNodes, nElements, nDof, nnz, stats }}
 */
function solve(input) {
  if (!engine) {
    throw new Error('Native engine not available: ' + (loadError || 'unknown'));
  }
  return engine.solve(input);
}

module.exports = { isAvailable, getLoadError, solve };
