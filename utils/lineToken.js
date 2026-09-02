// utils/lineToken.js
// จัดการ LINE channel access token: ออก token ใหม่, auto-refresh ตามเวลา (4 วัน),
// และ healing client ที่จับ 401 → ออก token ใหม่ → retry ให้อัตโนมัติ (กู้ใน event เดิม)
import line from "@line/bot-sdk";
import Shop from "../models/Shop.js";
import Setting from "../models/Setting.js";

const REFRESH_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000; // 4 วัน
const SETTING_KEY = "token-refresh-meta";

// ---- ตรวจว่าเป็น error เรื่อง auth (token ตาย) หรือไม่ ----
export function isAuthError(err) {
  const status = err?.status || err?.statusCode || err?.originalError?.response?.status || err?.response?.status;
  return status === 401;
}

// ---- ออก channel access token ใหม่จาก channel_id + secret ----
// (client_credentials — ตัวเดียวกับที่หน้า frontend กด verify เรียก)
export async function issueChannelToken(channelId, secret) {
  const res = await fetch("https://api.line.me/v2/oauth/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: String(channelId),
      client_secret: String(secret),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error(`ออก token ไม่สำเร็จ (channel ${String(channelId).slice(-4)}): ${data.error_description || data.error || res.status}`);
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

// ---- refresh token ของ 1 line (single-flight ต่อ channel — กันยิงขอรัวๆ) ----
const inflight = new Map(); // channelId -> Promise<newToken|null>

export function refreshShopLineToken({ prefix, channelId, secret, staleToken }) {
  const key = String(channelId);
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    // เผื่อมี event อื่น refresh ไปแล้ว → ใช้ตัวใน DB เลย ไม่ต้องออกใหม่
    const shop = await Shop.findOne({ prefix }).lean();
    const dbLine = shop?.lines?.find((l) => String(l.channel_id) === key);
    if (dbLine?.access_token && dbLine.access_token !== staleToken) {
      return dbLine.access_token;
    }

    const cid = channelId || dbLine?.channel_id;
    const sec = secret || dbLine?.secret_token;
    if (!cid || !sec) return null;

    const { access_token } = await issueChannelToken(cid, sec);
    await Shop.updateOne(
      { prefix, "lines.channel_id": String(channelId) },
      { $set: { "lines.$.access_token": access_token } }
    );
    console.log(`🔄 ออก token ใหม่ (401 fallback) ร้าน ${prefix} channel ...${key.slice(-4)}`);
    return access_token;
  })().catch((err) => {
    console.error(`❌ refresh token ล้มเหลว ร้าน ${prefix} channel ...${key.slice(-4)}:`, err.message);
    return null;
  }).finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

// ---- Healing client: ครอบ method ของ LINE SDK client ----
// ทุก call ถ้าเจอ 401 → refresh token → สร้าง client ใหม่ → retry 1 ครั้ง
// สร้างครั้งเดียวใน webhook handler → ทุก reply/push/getProfile ที่ส่งลง handler ได้ heal อัตโนมัติ
export function createHealingClient({ prefix, linename, channelId, secret, token }) {
  let currentToken = token;
  let client = new line.Client({ channelAccessToken: currentToken });

  const call = async (method, args) => {
    try {
      return await client[method](...args);
    } catch (err) {
      if (!isAuthError(err)) throw err;
      const newToken = await refreshShopLineToken({ prefix, channelId, secret, staleToken: currentToken });
      if (!newToken) throw err; // refresh ไม่ได้ → โยน error เดิม (ไม่วน loop)
      currentToken = newToken;
      client = new line.Client({ channelAccessToken: currentToken });
      return await client[method](...args); // retry ครั้งเดียว
    }
  };

  return {
    replyMessage: (...args) => call("replyMessage", args),
    pushMessage: (...args) => call("pushMessage", args),
    getMessageContent: (...args) => call("getMessageContent", args),
    getProfile: (...args) => call("getProfile", args),
    get accessToken() { return currentToken; },
  };
}

// ---- Auto-refresh ตามเวลา: วนออก token ใหม่ให้ทุก line ----
export async function refreshAllShopTokens() {
  const shops = await Shop.find().lean();
  let ok = 0;
  let fail = 0;

  for (const shop of shops) {
    for (const l of shop.lines || []) {
      if (!l.channel_id || !l.secret_token) continue;
      try {
        const { access_token } = await issueChannelToken(l.channel_id, l.secret_token);
        await Shop.updateOne(
          { prefix: shop.prefix, "lines.channel_id": String(l.channel_id) },
          { $set: { "lines.$.access_token": access_token } }
        );
        ok++;
      } catch (err) {
        fail++;
        console.error(`❌ refresh token ร้าน ${shop.prefix} channel ...${String(l.channel_id).slice(-4)}:`, err.message);
      }
    }
  }

  console.log(`🔄 Auto-refresh token เสร็จ: สำเร็จ ${ok} / ล้มเหลว ${fail}`);
  return { ok, fail };
}

// ---- เก็บ/อ่านเวลา refresh ล่าสุด (กัน Render restart แล้วยิงขอ token รัวๆ) ----
async function getLastRefresh() {
  const doc = await Setting.findOne({ key: SETTING_KEY }).lean();
  return doc?.value?.lastRefreshAt || 0;
}
async function setLastRefresh(ts) {
  await Setting.updateOne(
    { key: SETTING_KEY },
    { $set: { value: { lastRefreshAt: ts } } },
    { upsert: true }
  );
}

// ---- ตั้ง scheduler: catch-up ตอน start (ถ้าเกิน 4 วัน) + interval ทุก 4 วัน ----
export async function startTokenRefreshScheduler() {
  try {
    const last = await getLastRefresh();
    if (!last || Date.now() - last >= REFRESH_INTERVAL_MS) {
      console.log("🔄 ถึงกำหนด refresh token (ตอน start) — เริ่ม refresh...");
      await refreshAllShopTokens();
      await setLastRefresh(Date.now());
    } else {
      const nextInMs = REFRESH_INTERVAL_MS - (Date.now() - last);
      console.log(`⏳ ยังไม่ถึงกำหนด refresh token — อีก ~${Math.round(nextInMs / 3600000)} ชม.`);
    }
  } catch (err) {
    console.error("❌ token refresh (start) ล้มเหลว:", err.message);
  }

  setInterval(async () => {
    try {
      await refreshAllShopTokens();
      await setLastRefresh(Date.now());
    } catch (err) {
      console.error("❌ token refresh (interval) ล้มเหลว:", err.message);
    }
  }, REFRESH_INTERVAL_MS);
}
