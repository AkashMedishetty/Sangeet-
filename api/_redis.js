/* Shared Upstash Redis REST helper + session rules for the API routes. */
const crypto = require("crypto");

const TTL = 60 * 60 * 24 * 30; // a show session lives 30 days, refreshed on every change
const SID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — readable on a screen

async function redis(commands) {
  const r = await fetch(process.env.KV_REST_API_URL + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return r.json();
}

function newSid() {
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += SID_ALPHABET[bytes[i] % SID_ALPHABET.length];
  return s;
}

const validSid = (s) => typeof s === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(s);
const k = (sid, part) => "exchange:" + sid + ":" + part;

function body(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; } }
  return req.body || {};
}

// Constant-time key check against the session's stored key.
async function keyOk(sid, key) {
  if (!validSid(sid) || typeof key !== "string" || !key) return false;
  const [stored] = await redis([["GET", k(sid, "key")]]);
  if (!stored.result) return false;
  const a = Buffer.from(String(stored.result)), b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { redis, newSid, validSid, k, body, keyOk, TTL, crypto };
