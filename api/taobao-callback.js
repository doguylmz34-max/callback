// api/taobao-callback.js
// Vercel Serverless Function (Node 18+). Ek paket gerekmez.

export default async function handler(req, res) {
  try {
    // İstek bilgilerini loglayalım (gizli veri loglamayın)
    console.log("TAOBAO_CB", {
      method: req.method,
      url: req.url,
      headers: {
        "user-agent": req.headers["user-agent"],
        host: req.headers.host,
      },
    });

    // Query paramlarını al
    const fullUrl = new URL(req.url, `https://${req.headers.host}`);
    const code = fullUrl.searchParams.get("code");
    const state = fullUrl.searchParams.get("state");
    const error = fullUrl.searchParams.get("error");
    const error_description = fullUrl.searchParams.get("error_description");

    if (error) {
      return res.status(400).json({ ok: false, error, error_description });
    }

    if (!code) {
      // Varsa body'yi kısaltıp loglayalım (debug amaçlı)
      let body = "";
      for await (const chunk of req) body += chunk;
      console.log("TAOBAO_CB_BODY", body.slice(0, 2000));

      return res.status(400).json({
        ok: false,
        error: "Missing code",
        hint:
          "Yetkilendirme linkini tarayıcıda açıp izin verin; platform bu endpoint'e ?code=...&state=... ile döner.",
      });
    }

    // (Opsiyonel) CSRF koruması için state doğrulayın:
    // - generate_authorize_url.py ile ürettiğiniz state'i bir yerde saklayıp burada karşılaştırın.

    // İsterseniz otomatik token almayı açın:
    // Vercel project env'e TAOBAO_AUTO_TOKEN_EXCHANGE=1 koyarsanız bu bölüm çalışır
    const autoExchange = process.env.TAOBAO_AUTO_TOKEN_EXCHANGE === "1";

    if (!autoExchange) {
      // Sadece code'u göster
      return res.status(200).json({
        ok: true,
        message:
          "Authorization code alındı. Bu 'code' değerini terminaldeki betiğe yapıştırın veya AUTO EXCHANGE'i açın.",
        code,
        state,
      });
    }

    // Otomatik token değişimi (code -> access_token)
    const APP_KEY = process.env.TAOBAO_APP_KEY || "503764";
    const APP_SECRET =
      process.env.TAOBAO_APP_SECRET || "yYbmSax1KRBpzIT5cOVX05vzjDTJw3Dg";
    const REDIRECT_URI =
      process.env.TAOBAO_REDIRECT_URI ||
      "https://callback-rho.vercel.app/api/taobao-callback";

    const tokenResp = await fetch(
      "https://api.taobao.global/rest/auth/token/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: APP_KEY,
          client_secret: APP_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      }
    );

    const text = await tokenResp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!tokenResp.ok) {
      return res.status(tokenResp.status).json({
        ok: false,
        step: "token_create",
        code_received: code,
        detail: json,
      });
    }

    // Burada json -> { access_token, refresh_token, expires_in, ... }
    // Not: Bunları DB/KV'de güvenli saklayın (örnek amaçlı direkt döndürüyoruz).
    return res.status(200).json({
      ok: true,
      step: "token_created",
      code,
      tokens: json,
    });
  } catch (e) {
    console.error("TAOBAO_CB_ERROR", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
