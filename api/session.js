/* The Exchange — show sessions.
   POST {action:"create"}            → { sid, key }      a new show session
   POST {action:"pair", s, key}      → { ok }            a phone scanned the QR  */
const { redis, newSid, k, body, keyOk, TTL, crypto } = require("./_redis");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const now = Date.now();
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ now, error: "method" }); }
  try {
    const b = body(req);

    if (b.action === "create") {
      for (let tries = 0; tries < 5; tries++) {
        const sid = newSid(), key = crypto.randomBytes(18).toString("base64url");
        const [set] = await redis([["SET", k(sid, "key"), key, "NX", "EX", String(TTL)]]);
        if (set.result === "OK") return res.status(200).json({ now, sid, key });
      }
      return res.status(500).json({ now, error: "busy" });
    }

    if (b.action === "pair") {
      if (!(await keyOk(b.s, b.key))) return res.status(401).json({ now, error: "key" });
      await redis([["SET", k(b.s, "paired"), String(now), "EX", String(TTL)], ["EXPIRE", k(b.s, "key"), String(TTL)]]);
      return res.status(200).json({ now, ok: true });
    }

    return res.status(400).json({ now, error: "action" });
  } catch (e) {
    return res.status(500).json({ now, error: String(e.message || e) });
  }
};
