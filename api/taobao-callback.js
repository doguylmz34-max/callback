// api/taobao-callback.js
// Vercel (Node 18+)

import crypto from "node:crypto";

function utcTimestamp() {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  // UTC "YYYY-MM-DD HH:MM:SS"
  return (
    d.getUTCFullYear() +
    "-" +
    pad(d.getUTCMonth() + 1) +
    "-" +
    pad(d.getUTCDate()) +
    " " +
    pad(d.getUTCHours()) +
    ":" +
    pad(d.getUTCMinutes()) +
    ":" +
    pad(d.getUTCSeconds())
  );
}

function signSha256(params, secret) {
  // sign alanını imzaya dahil ETME
  const entries = Object.entries(params).filter(([k]) => k !== "sign");
  const base = entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}${v}`)
    .join("");
  return crypto.createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

export default async function handler(req, res) {
  try {
    const fullUrl = new URL(req.url, `https://${req.headers.host}`);
    const code = fullUrl.searchParams.get("code");
    const state = fullUrl.searchParams.get("state");
    const error = fullUrl.searchParams.get("error");
    const error_description = fullUrl.searchParams.get("error_description");

    if (error) {
      return res.status(400).json({ ok: false, error, error_description });
    }
    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "Missing code",
        hint:
          "Tarayıcıda yetki verildikten sonra bu endpoint ?code=... ile çağrılır.",
      });
    }

    const autoExchange = process.env.TAOBAO_AUTO_TOKEN_EXCHANGE === "1";
    if (!autoExchange) {
      return res.status(200).json({
        ok: true,
        message:
          "Authorization code alındı. Bu 'code' değerini terminal betiğine verin ya da AUTO EXCHANGE'i açın.",
        code,
        state,
      });
    }

    const APP_KEY = process.env.TAOBAO_APP_KEY || "503764";
    const APP_SECRET =
      process.env.TAOBAO_APP_SECRET || "yYbmSax1KRBpzIT5cOVX05vzjDTJw3Dg";

    // Token CREATE için gerekli parametreler (JSON DEĞİL, FORM-ENCODED ve İMZALI)
    const params = {
      app_key: APP_KEY,
      sign_method: "sha256",
      timestamp: utcTimestamp(), // UTC
      code, // callback ile geldi
    };
    params.sign = signSha256(params, APP_SECRET);

    const body = new URLSearchParams(params);

    const tokenResp = await fetch("https://api.taobao.global/rest/auth/token/create", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const raw = await tokenResp.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      json = { raw };
    }

    if (!tokenResp.ok) {
      return res
        .status(tokenResp.status)
        .json({ ok: false, step: "token_create", detail: json });
    }

    // json => { access_token, refresh_token, expires_in, ... }
    return res.status(200).json({ ok: true, step: "token_created", code, tokens: json });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
