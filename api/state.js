/* The Exchange — show state relay, one record per session.
   GET  /api/state?s=SID[&hb=1]       → { now, state, wall, paired }  (hb = wall heartbeat)
   POST /api/state {s, key, state}    → { now, srev }                 (needs the session key) */
const { redis, validSid, k, body, keyOk, TTL } = require("./_redis");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const now = Date.now();
  try {
    if (req.method === "GET") {
      const sid = String((req.query && req.query.s) || "");
      if (!validSid(sid)) return res.status(400).json({ now, error: "session" });
      const cmds = [["GET", k(sid, "state")], ["GET", k(sid, "wall")], ["GET", k(sid, "paired")]];
      if (req.query.hb) cmds.push(["SET", k(sid, "wall"), String(now), "EX", "30"]);
      const out = await redis(cmds);
      return res.status(200).json({
        now,
        state: out[0].result ? JSON.parse(out[0].result) : null,
        wall: out[1].result ? Number(out[1].result) : 0,
        paired: out[2].result ? Number(out[2].result) : 0
      });
    }

    if (req.method === "POST") {
      const b = body(req);
      if (!(await keyOk(b.s, b.key))) return res.status(401).json({ now, error: "key" });
      const state = b.state;
      if (!state || typeof state !== "object" || !state.groom || !state.bride) return res.status(400).json({ now, error: "state" });
      const [inc] = await redis([["INCR", k(b.s, "rev")]]);
      state.srev = inc.result;
      await redis([
        ["SET", k(b.s, "state"), JSON.stringify(state), "EX", String(TTL)],
        ["EXPIRE", k(b.s, "key"), String(TTL)],
        ["EXPIRE", k(b.s, "rev"), String(TTL)]
      ]);
      return res.status(200).json({ now, srev: state.srev });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ now, error: "method" });
  } catch (e) {
    return res.status(500).json({ now, error: String(e.message || e) });
  }
};
