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
const plan = getArg('plan') || 'pro';
const days = parseInt(getArg('days') || '365');
const name = getArg('name') || '';

if (!email) {
  console.error('Usage: node generate.js --email user@example.com [--plan pro] [--days 365] [--name "John Doe"]');
  process.exit(1);
}

// Load secret for HMAC
const keyPath = process.env.LICENSE_PRIVATE_KEY_PATH || process.env.KAIM_PRIVATE_KEY_PATH || path.join(__dirname, 'private.pem');
const secret = fs.readFileSync(keyPath, 'utf-8');

const expiresAt = new Date(Date.now() + days * 86400000);
const expiryStr = expiresAt.toISOString().split('T')[0].replace(/-/g, '');

// Generate short key: KAIM-PLAN-YYYYMMDD-HASH
const data = [plan, expiryStr, email].join('|');
const hmac = crypto.createHmac('sha256', secret).update(data).digest('base64url').slice(0, 16);
const licenseKey = `KAIM-${plan.toUpperCase()}-${expiryStr}-${hmac}`;

console.log('\n━━━ KaimPLE License ━━━');
console.log(`Email:   ${email}`);
console.log(`Name:    ${name || '(not set)'}`);
console.log(`Plan:    ${plan}`);
console.log(`Valid:   ${days} days (until ${expiresAt.toISOString().split('T')[0]})`);
console.log(`\nLicense Key: ${licenseKey}\n`);
