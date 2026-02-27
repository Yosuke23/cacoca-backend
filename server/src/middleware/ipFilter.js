// server/src/middleware/ipFilter.js
import axios from "axios";

// --- 環境変数 ---
const IP_MODE = process.env.IP_MODE || "SELF";
const ALLOWED_COUNTRY = "JP";

// ALLOW_IP を配列として正規化（カンマ区切り対応）
const ALLOW_IPS = (process.env.ALLOW_IP || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

let cachedIp = null;
let cachedCountry = null;

// -----------------------
// IP 正規化（IPv6 / ::ffff 対応）
// -----------------------
function normalizeIp(ip) {
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) {
    return ip.replace("::ffff:", "");
  }
  return ip;
}

// -----------------------
// クライアントIP取得（Render対応）
// -----------------------
function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return normalizeIp(forwarded.split(",")[0].trim());
  }
  return normalizeIp(req.socket.remoteAddress);
}

// -----------------------
// 国コード取得（キャッシュ付き）
// -----------------------
async function lookupCountry(ip) {
  try {
    if (cachedIp === ip && cachedCountry !== null) {
      return cachedCountry;
    }

    const res = await axios.get(`https://ipapi.co/${ip}/json/`);
    const country = res.data.country;

    cachedIp = ip;
    cachedCountry = country;
    return country;
  } catch (err) {
    console.error("IP lookup failed:", err.message);
    return null;
  }
}

// -----------------------
// IP フィルタ本体
// -----------------------
export default async function ipFilter(req, res, next) {
  const ip = getClientIP(req);

  console.log("[IP CHECK]", {
    mode: IP_MODE,
    ip,
    allowIps: ALLOW_IPS,
  });

  // ローカルは常に許可
  if (ip === "127.0.0.1" || ip === "::1") {
    return next();
  }

  // -----------------------
  // SELF モード（指定IPのみ許可）
  // -----------------------
  if (IP_MODE === "SELF") {
    if (ALLOW_IPS.length === 0) {
      return res.status(500).json({
        error: true,
        message: "ALLOW_IP が設定されていません。",
      });
    }

    if (!ALLOW_IPS.includes(ip)) {
      return res.status(403).json({
        error: true,
        mode: "SELF",
        message: "アクセス拒否：指定IPのみ許可されています",
        yourIP: ip,
      });
    }

    return next();
  }

  // ------------------------
  // JAPAN モード（日本のみ許可）
  // ------------------------
  if (IP_MODE === "JAPAN") {
    const country = await lookupCountry(ip);

    if (country !== ALLOWED_COUNTRY) {
      return res.status(403).json({
        error: true,
        mode: "JAPAN",
        message: "日本国内からのアクセスのみ許可されています",
        yourIP: ip,
        detectedCountry: country,
      });
    }

    return next();
  }

  // ------------------------
  // モード不正
  // ------------------------
  return res.status(500).json({
    error: true,
    message: `IP_MODE=${IP_MODE} は無効です（SELF または JAPAN を設定）`,
  });
}
