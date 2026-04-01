#!/usr/bin/env node
/**
 * Patches @expo/ngrok to work with ngrok v3 binary.
 *
 * Problem: @expo/ngrok bundles ngrok v2 which is EOL (service shut down).
 * Fix: swap in ngrok v3 binary + patch the wrapper for v3 API compatibility.
 *
 * Run automatically via `npm install` (postinstall script).
 */

const fs = require("fs");
const path = require("path");

const APP_DIR = path.resolve(__dirname, "..");
const NGROK_DIR = path.join(APP_DIR, "node_modules", "@expo", "ngrok");

// --- 1. Replace ngrok v2 binary with v3 from the `ngrok` npm package ---
function swapBinary() {
  const v3Bin = path.join(APP_DIR, "node_modules", "ngrok", "bin", "ngrok");
  const targetBin = path.join(
    APP_DIR,
    "node_modules",
    "@expo",
    "ngrok-bin-darwin-arm64",
    "ngrok"
  );

  if (!fs.existsSync(v3Bin)) {
    console.log("[fix-ngrok-v3] ngrok v3 binary not found — run: npm install ngrok");
    return false;
  }
  if (!fs.existsSync(targetBin)) {
    console.log("[fix-ngrok-v3] @expo/ngrok-bin-darwin-arm64 not found — skipping");
    return false;
  }

  fs.copyFileSync(v3Bin, targetBin);
  console.log("[fix-ngrok-v3] Swapped ngrok v2 binary with v3");
  return true;
}

// --- 2. Patch index.js: strip v2-only fields before tunnel API call ---
function patchIndex() {
  const file = path.join(NGROK_DIR, "index.js");
  let src = fs.readFileSync(file, "utf8");

  const OLD = `async function connectRetry(opts, retryCount = 0) {
  opts.name = String(opts.name || uuid.v4());
  try {
    const response = await ngrokClient.startTunnel(opts);
    return response.public_url;`;

  const NEW = `async function connectRetry(opts, retryCount = 0) {
  // ngrok v3 API only accepts tunnel-specific fields
  const tunnelOpts = {
    name: String(opts.name || uuid.v4()),
    proto: opts.proto || "http",
    addr: String(opts.addr || opts.port || 80),
  };
  if (opts.hostname) tunnelOpts.hostname = opts.hostname;
  if (opts.subdomain) tunnelOpts.subdomain = opts.subdomain;
  if (opts.host_header) tunnelOpts.host_header = opts.host_header;
  if (opts.domain) tunnelOpts.domain = opts.domain;
  if (opts.schemes) tunnelOpts.schemes = opts.schemes;
  if (opts.inspect !== undefined) tunnelOpts.inspect = opts.inspect;
  if (opts.auth) tunnelOpts.auth = opts.auth;
  if (opts.bind_tls !== undefined) tunnelOpts.bind_tls = opts.bind_tls;
  try {
    const response = await ngrokClient.startTunnel(tunnelOpts);
    return response.public_url;`;

  if (src.includes("ngrok v3 API")) {
    console.log("[fix-ngrok-v3] index.js already patched");
    return;
  }
  if (!src.includes(OLD)) {
    console.log("[fix-ngrok-v3] WARNING: index.js has unexpected content — skipping patch");
    return;
  }

  src = src.replace(OLD, NEW);
  fs.writeFileSync(file, src);
  console.log("[fix-ngrok-v3] Patched index.js (tunnel opts)");
}

// --- 3. Patch process.js: v2 `authtoken` command → v3 `config add-authtoken` ---
function patchProcess() {
  const file = path.join(NGROK_DIR, "src", "process.js");
  let src = fs.readFileSync(file, "utf8");

  const OLD = '  const authtoken = ["authtoken", token];';
  const NEW = '  const authtoken = ["config", "add-authtoken", token];';

  if (src.includes('"config", "add-authtoken"')) {
    console.log("[fix-ngrok-v3] process.js already patched");
    return;
  }
  if (!src.includes(OLD)) {
    console.log("[fix-ngrok-v3] WARNING: process.js has unexpected content — skipping patch");
    return;
  }

  src = src.replace(OLD, NEW);
  fs.writeFileSync(file, src);
  console.log("[fix-ngrok-v3] Patched process.js (authtoken command)");
}

// --- Run ---
console.log("[fix-ngrok-v3] Applying ngrok v3 patches...");
if (swapBinary()) {
  patchIndex();
  patchProcess();
}
console.log("[fix-ngrok-v3] Done.");
