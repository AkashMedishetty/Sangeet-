/* The Exchange — show state relay (Vercel function + Upstash Redis REST).
   GET  /api/state[?hb=1]  → { now, state, wall }   (hb = wall heartbeat)
   POST /api/state {pin, state} → { now, srev }     (PIN-guarded writes)  */

const KEY = "exchange:state", REV = "exchange:rev", WALL = "exchange:wall";

async function redis(commands) {
  const r = await fetch(process.env.KV_REST_API_URL + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const now = Date.now();
  try {
    if (req.method === "GET") {
      const cmds = [["GET", KEY], ["GET", WALL]];
      if (req.query && req.query.hb) cmds.push(["SET", WALL, String(now), "EX", "30"]);
      const out = await redis(cmds);
      return res.status(200).json({
        now,
        state: out[0].result ? JSON.parse(out[0].result) : null,
        wall: out[1].result ? Number(out[1].result) : 0
      });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const pin = process.env.CONTROL_PIN;
      if (!pin || String(body.pin || "") !== pin) return res.status(401).json({ now, error: "pin" });
      const state = body.state;
      if (!state || typeof state !== "object" || !state.groom || !state.bride) return res.status(400).json({ now, error: "state" });
      const [inc] = await redis([["INCR", REV]]);
      state.srev = inc.result;
      await redis([["SET", KEY, JSON.stringify(state)]]);
      return res.status(200).json({ now, srev: state.srev });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ now, error: "method" });
  } catch (e) {
    return res.status(500).json({ now, error: String(e.message || e) });
  }
};
