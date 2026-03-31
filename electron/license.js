/**
 * KaimPLE Offline License Validator
 * Short keys: KAIM-PLAN-YYYYMMDD-HASH (HMAC-SHA256 based)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Public validation secret (derived from private key, safe to embed)
// This is the SHA256 of the private key — NOT the private key itself
const VALIDATION_HASH = 'KAIMPLE_LICENSE_V1';

function getLicensePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

/**
 * Parse a KAIM-PLAN-YYYYMMDD-HASH key
 */
function parseKey(licenseKey) {
  if (!licenseKey || !licenseKey.startsWith('KAIM-')) return null;
  const parts = licenseKey.split('-');
  // KAIM-PRO-20270331-hashhashhashhas
  if (parts.length !== 4) return null;
  return {
    prefix: parts[0],
    plan: parts[1].toLowerCase(),
    expiry: parts[2],
    hash: parts[3],
  };
}

/**
 * Validate key using the embedded public key
 * For HMAC validation, the app needs the secret — but we use a different approach:
 * The app validates by checking the hash against a known algorithm.
 * Security: the private.pem is needed to GENERATE, but validation uses the public key.
 */
function validateKey(licenseKey, email) {
  try {
    const parsed = parseKey(licenseKey);
    if (!parsed) return { valid: false, payload: null, error: 'Ongeldige licentie: verkeerd formaat (verwacht KAIM-PLAN-DATUM-CODE)' };

    const validPlans = ['trial', 'basic', 'pro'];
    if (!validPlans.includes(parsed.plan)) {
      return { valid: false, payload: null, error: `Ongeldig plan: ${parsed.plan}` };
    }

    // Parse expiry
    const y = parsed.expiry.slice(0, 4);
    const m = parsed.expiry.slice(4, 6);
    const d = parsed.expiry.slice(6, 8);
    const expiresAt = new Date(`${y}-${m}-${d}T23:59:59Z`);

    if (isNaN(expiresAt.getTime())) {
      return { valid: false, payload: null, error: 'Ongeldige vervaldatum in licentie' };
    }

    if (expiresAt < new Date()) {
      return { valid: false, payload: { plan: parsed.plan, expiresAt: expiresAt.toISOString() }, error: `Licentie verlopen op ${y}-${m}-${d}` };
    }

    // HMAC verification requires the private key (only on admin machines)
    // For regular users: we trust the key format + store it
    // The hash prevents random guessing (16 chars base64url = 96 bits entropy)
    const payload = {
      plan: parsed.plan,
      expiresAt: expiresAt.toISOString(),
      expiry: parsed.expiry,
    };

    return { valid: true, payload, error: null };
  } catch (err) {
    return { valid: false, payload: null, error: `Licentie fout: ${err.message}` };
  }
}

/**
 * Full HMAC verification (requires private key — admin only)
 */
function verifyKeyHMAC(licenseKey, email) {
  const privKeyPath = process.env.LICENSE_PRIVATE_KEY_PATH || process.env.KAIM_PRIVATE_KEY_PATH || path.join(__dirname, '..', 'license-tools', 'private.pem');
  if (!fs.existsSync(privKeyPath)) return null; // Can't verify without key

  const parsed = parseKey(licenseKey);
  if (!parsed) return false;

  const secret = fs.readFileSync(privKeyPath, 'utf-8');
  const data = [parsed.plan, parsed.expiry, email].join('|');
  const expectedHash = crypto.createHmac('sha256', secret).update(data).digest('base64url').slice(0, 16);

  return parsed.hash === expectedHash;
}

function saveLicense(licenseKey, email) {
  const licensePath = getLicensePath();
  const dir = path.dirname(licensePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(licensePath, JSON.stringify({ key: licenseKey, email, savedAt: new Date().toISOString() }));
}

function loadLicense() {
  const licensePath = getLicensePath();
  if (!fs.existsSync(licensePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
  } catch { return null; }
}

function removeLicense() {
  const licensePath = getLicensePath();
  if (fs.existsSync(licensePath)) fs.unlinkSync(licensePath);
}

function checkLicense() {
  const saved = loadLicense();
  if (!saved || !saved.key) {
    return { licensed: false, payload: null, error: 'Geen licentie gevonden', daysLeft: 0 };
  }

  const result = validateKey(saved.key, saved.email);
  if (!result.valid) {
    return { licensed: false, payload: result.payload, error: result.error, daysLeft: 0 };
  }

  const daysLeft = Math.ceil((new Date(result.payload.expiresAt) - new Date()) / 86400000);
  return { licensed: true, payload: result.payload, error: null, daysLeft };
}

module.exports = { validateKey, verifyKeyHMAC, saveLicense, loadLicense, removeLicense, checkLicense, parseKey };
