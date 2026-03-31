/**
 * KaimPLE Offline License Validator
 * Validates cryptographically signed license keys without internet.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Ed25519 public key (SAFE to ship - cannot generate licenses with this)
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAwBpe7bHPpXOhqNIJE5L8rrVw4yRNi4VQmmL808d6axY=
-----END PUBLIC KEY-----`;

const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);

// License storage path
function getLicensePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'license.json');
}

/**
 * Parse and validate a KAIM-xxx.yyy license key
 * Returns { valid, payload, error }
 */
function validateKey(licenseKey) {
  try {
    if (!licenseKey || !licenseKey.startsWith('KAIM-')) {
      return { valid: false, payload: null, error: 'Ongeldige licentie: moet beginnen met KAIM-' };
    }

    const keyBody = licenseKey.slice(5); // remove "KAIM-"
    const dotIdx = keyBody.lastIndexOf('.');
    if (dotIdx < 0) {
      return { valid: false, payload: null, error: 'Ongeldige licentie: verkeerd formaat' };
    }

    const payloadB64 = keyBody.slice(0, dotIdx);
    const sigB64 = keyBody.slice(dotIdx + 1);

    // Verify signature
    const signature = Buffer.from(sigB64, 'base64url');
    const isValid = crypto.verify(null, Buffer.from(payloadB64), publicKey, signature);

    if (!isValid) {
      return { valid: false, payload: null, error: 'Ongeldige licentie: handtekening klopt niet' };
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

    // Check expiration
    const expiresAt = new Date(payload.expiresAt);
    if (expiresAt < new Date()) {
      return { 
        valid: false, 
        payload, 
        error: `Licentie verlopen op ${expiresAt.toISOString().split('T')[0]}` 
      };
    }

    return { valid: true, payload, error: null };

  } catch (err) {
    return { valid: false, payload: null, error: `Licentie fout: ${err.message}` };
  }
}

/**
 * Save license key to disk
 */
function saveLicense(licenseKey) {
  const licensePath = getLicensePath();
  const dir = path.dirname(licensePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(licensePath, JSON.stringify({ key: licenseKey, savedAt: new Date().toISOString() }));
}

/**
 * Load saved license from disk
 */
function loadLicense() {
  const licensePath = getLicensePath();
  if (!fs.existsSync(licensePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
    return data.key || null;
  } catch {
    return null;
  }
}

/**
 * Remove saved license
 */
function removeLicense() {
  const licensePath = getLicensePath();
  if (fs.existsSync(licensePath)) fs.unlinkSync(licensePath);
}

/**
 * Check current license status
 * Returns { licensed, payload, error, daysLeft }
 */
function checkLicense() {
  const key = loadLicense();
  if (!key) {
    return { licensed: false, payload: null, error: 'Geen licentie gevonden', daysLeft: 0 };
  }

  const result = validateKey(key);
  if (!result.valid) {
    return { licensed: false, payload: result.payload, error: result.error, daysLeft: 0 };
  }

  const daysLeft = Math.ceil((new Date(result.payload.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
  return { licensed: true, payload: result.payload, error: null, daysLeft };
}

module.exports = { validateKey, saveLicense, loadLicense, removeLicense, checkLicense };
