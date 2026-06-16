// utils/slip2goMonitor.js
// เช็คโควต้า Slip2Go เป็นระยะ แล้วแจ้งเตือน Telegram (บอท SLIP2GO) เมื่อ estimatedQuotaSlip ถึงระดับที่กำหนด
import { sendTelegram } from "./telegram.js";

const ACCOUNT_INFO_URL = "https://connect.slip2go.com/api/account/info";
const CHECK_INTERVAL_MS = 3 * 60 * 1000; // เช็คทุก 5 นาที
const ZERO_REPEAT_MS = 60 * 60 * 1000;   // เหลือ 0 → เตือนซ้ำทุก 1 ชั่วโมง
const THRESHOLDS = [300, 100, 50];  // แจ้งครั้งเดียวต่อระดับ (0 จัดการแยก)

const alerted = new Set(); // ระดับที่แจ้งไปแล้ว
let lastZeroAlertAt = 0;

function notify(message) {
  return sendTelegram(
    process.env.TELEGRAM_BOT_SLIP2GO_TOKEN,
    process.env.TELEGRAM_SLIP2GO_CHAT_ID,
    message
  );
}

export async function checkSlip2goQuota() {
  const apiKey = process.env.SLIP2GO_API_KEY;
  if (!apiKey) return;

  let quota, creditRemaining;

  // 🧪 โหมดทดสอบ: ถ้าตั้ง SLIP2GO_TEST_QUOTA ไว้ จะใช้ค่านั้นแทนการเรียก API จริง
  //    เช่น SLIP2GO_TEST_QUOTA=250 → ทดสอบแจ้งเตือนระดับ 300 (ลบ env นี้ออกเมื่อทดสอบเสร็จ)
  const testQuota = process.env.SLIP2GO_TEST_QUOTA;
  if (testQuota !== undefined && testQuota !== "") {
    quota = Number(testQuota);
    // โหมดทดสอบ: ตั้งเครดิตได้ด้วย SLIP2GO_TEST_CREDIT (ไม่ตั้ง = 0 เพื่อให้ผ่านเงื่อนไขแจ้งเตือน)
    const testCredit = process.env.SLIP2GO_TEST_CREDIT;
    creditRemaining = (testCredit !== undefined && testCredit !== "") ? Number(testCredit) : 0;
  } else {
    try {
      const res = await fetch(ACCOUNT_INFO_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });

      // อ่านเป็น text ก่อน แล้วค่อย parse — กันกรณี API ตอบกลับเป็น HTML (เช่น 502/403) แล้ว .json() พัง
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        console.warn(`⚠️ Slip2Go ตอบกลับไม่ใช่ JSON (HTTP ${res.status}) — ข้ามรอบนี้`);
        return;
      }

      if (!res.ok) {
        console.warn(`⚠️ Slip2Go ตอบกลับ HTTP ${res.status}: ${json?.message || ""} — ข้ามรอบนี้`);
        return;
      }

      quota = json?.data?.estimatedQuotaSlip;
      creditRemaining = json?.data?.creditRemaining;
      if (typeof quota !== "number") {
        console.warn("⚠️ Slip2Go quota: ไม่พบ estimatedQuotaSlip", json?.message || "");
        return;
      }
    } catch (err) {
      console.error("❌ เช็คโควต้า Slip2Go ล้มเหลว:", err.message);
      return;
    }
  }

  // แจ้งเตือนเฉพาะเมื่อเครดิตเหลือต่ำกว่า 50 เท่านั้น — เครดิตยังเหลือ >= 50 ถือว่ายังปกติ
  if (typeof creditRemaining === "number" && creditRemaining >= 50) {
    alerted.clear();
    lastZeroAlertAt = 0;
    return;
  }

  // เติมเครดิตกลับมา (โควต้าสูงกว่าทุกระดับ) → reset เพื่อให้แจ้งใหม่ได้รอบหน้า
  if (quota > THRESHOLDS[0]) {
    alerted.clear();
    lastZeroAlertAt = 0;
    return;
  }

  // เหลือ 0 หรือติดลบ → เตือนซ้ำทุกชั่วโมง
  if (quota <= 0) {
    if (Date.now() - lastZeroAlertAt >= ZERO_REPEAT_MS) {
      await notify(`🛑 โควต้า Slip2Go หมดแล้ว (estimatedQuotaSlip = ${quota})\nกรุณาเติมเครดิตด่วน`);
      lastZeroAlertAt = Date.now();
    }
    THRESHOLDS.forEach(t => alerted.add(t)); // มาร์คทุกระดับว่าแจ้งแล้ว
    return;
  }

  // ระดับ 500/300/100/50 — แจ้งครั้งเดียวต่อระดับ
  // (ถ้ากระโดดข้ามหลายระดับในครั้งเดียว แจ้งระดับต่ำสุดที่ถึง 1 ครั้ง แล้วมาร์คที่เหลือไว้)
  const crossed = THRESHOLDS.filter(t => quota <= t && !alerted.has(t));
  if (crossed.length) {
    const level = Math.min(...crossed);
    await notify(`⚠️ โควต้า Slip2Go เหลือเพียง ${quota} แล้ว`);
    crossed.forEach(t => alerted.add(t));
  }
}

export function startSlip2goMonitor() {
  if (!process.env.SLIP2GO_API_KEY) {
    console.warn("⚠️ ไม่ได้ตั้ง SLIP2GO_API_KEY — ข้ามการมอนิเตอร์โควต้า Slip2Go");
    return;
  }
  checkSlip2goQuota(); // เช็คครั้งแรกทันทีตอน start
  setInterval(checkSlip2goQuota, CHECK_INTERVAL_MS);
}
