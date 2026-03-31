#!/usr/bin/env node
/**
 * KaimPLE License Generator (PRIVATE - never ship with app!)
 * 
 * Usage: node generate.js --email user@example.com --plan pro --days 365
 *        node generate.js --email user@example.com --plan trial --days 14
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

const email = getArg('email');
const plan = getArg('plan') || 'pro';           // pro | basic | trial
const days = parseInt(getArg('days') || '365');
const name = getArg('name') || '';

if (!email) {
  console.error('Usage: node generate.js --email user@example.com [--plan pro] [--days 365] [--name "John Doe"]');
  process.exit(1);
}

// Load private key
const privPem = fs.readFileSync(path.join(__dirname, 'private.pem'), 'utf-8');
const privateKey = crypto.createPrivateKey(privPem);

// Build license payload
const now = new Date();
const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

const payload = {
  v: 1,                                          // license format version
  email,
  name,
  plan,
  issuedAt: now.toISOString(),
  expiresAt: expiresAt.toISOString(),
  id: crypto.randomUUID(),                       // unique license ID
};

const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

// Sign with Ed25519
const signature = crypto.sign(null, Buffer.from(payloadB64), privateKey);
const sigB64 = signature.toString('base64url');

// Final license key: KAIM-<payload>.<signature>
const licenseKey = `KAIM-${payloadB64}.${sigB64}`;

console.log('\n━━━ KaimPLE License ━━━');
console.log(`Email:   ${email}`);
console.log(`Name:    ${name || '(not set)'}`);
console.log(`Plan:    ${plan}`);
console.log(`Valid:   ${days} days (until ${expiresAt.toISOString().split('T')[0]})`);
console.log(`ID:      ${payload.id}`);
console.log(`\nLicense Key:\n${licenseKey}\n`);
