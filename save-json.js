// api/save-json.js
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-api-key"] !== process.env.ACTIONS_API_KEY)
    return res.status(401).json({ error: "unauthorized" });

  try {
    const { filename, content, jsonl = false, folder = "exports" } = req.body || {};
    if (!filename || typeof content === "undefined")
      return res.status(400).json({ error: "filename & content required" });

    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const data =
      typeof content === "string" ? content :
      jsonl ? content : JSON.stringify(content, null, 2);

    const buf = Buffer.from(data, "utf8");
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const path = `${folder}/${Date.now()}_${safe}`;

    const { error: upErr, data: up } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(path, buf, { contentType: "application/json", upsert: true });
    if (upErr) throw upErr;

    const { error: signErr, data: signed } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 hari
    if (signErr) throw signErr;

    return res.status(200).json({ url: signed.signedUrl, size: buf.length, sha256, id: up.path });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
