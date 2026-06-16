// utils/customerStore.js — บันทึก/อัปเดตลูกค้าใน collection "customers"
import Customer from "../models/Customer.js";
import line from "@line/bot-sdk";

// ดึงชื่อโปรไฟล์ LINE จริงโดยตรง (ไม่ผ่าน getLineProfile ที่จะคืนรหัส user แทน)
async function fetchLineDisplayName(userId, accessToken) {
  try {
    const client = new line.Client({ channelAccessToken: accessToken });
    const profile = await client.getProfile(userId);
    return profile?.displayName || "";
  } catch (err) {
    const status = err?.status || err?.statusCode || err?.response?.status;
    // 400/401/404 = block/unfollow หรือ token ใช้ไม่ได้ → ข้ามเงียบๆ
    if (status === 400 || status === 401 || status === 404) {
      console.warn(`⚠️ ดึงชื่อ LINE ไม่ได้ [${status}] userId=${userId?.slice(-8)}`);
      return "";
    }
    console.warn("⚠️ ดึงชื่อ LINE ไม่สำเร็จ:", err.message);
    return "";
  }
}

// บันทึกลูกค้าที่ทักเข้ามา (upsert ตาม userId — ไม่ซ้ำ) โดยไม่ยุ่งกับเบอร์ที่มีอยู่
// ถ้า record ยังไม่มี displayName และมี accessToken → ดึงจาก LINE แล้วอัปเดตกลับ
export async function recordCustomer({ userId, prefix, linename, displayName, accessToken }) {
  if (!userId) return;
  const set = {};
  if (prefix) set.prefix = prefix;
  if (linename) set.linename = linename;
  if (displayName && displayName !== "-") set.displayName = displayName;
  try {
    const update = { $setOnInsert: { phoneNumber: "", user: "" } };
    if (Object.keys(set).length) update.$set = set;
    // new: true → ได้ doc หลังอัปเดต ไว้เช็คว่ามี displayName หรือยัง
    const doc = await Customer.findOneAndUpdate({ userId }, update, {
      upsert: true,
      new: true,
    });

    // ลูกค้ามีอยู่แล้วแต่ยังไม่มี displayName → ดึงจาก LINE แล้วอัปเดตกลับ
    const needName = doc && (!doc.displayName || doc.displayName === "-");
    if (needName && accessToken) {
      const name = await fetchLineDisplayName(userId, accessToken);
      if (name && name !== "-") {
        await Customer.updateOne({ userId }, { $set: { displayName: name } });
        console.log(`บันทึกชื่อลูกค้า: "${name}" [${userId?.slice(-8)}]`);
      }
    } else if (needName && !accessToken) {
      console.warn(`⚠️ ลูกค้ายังไม่มีชื่อแต่ไม่มี accessToken [${userId?.slice(-8)}]`);
    }
  } catch (err) {
    console.error("❌ บันทึกลูกค้าล้มเหลว:", err.message);
  }
}

// อัปเดตเบอร์ลูกค้า → ตั้ง user เป็น {prefix}+เลขท้าย 7 ตัว (upsert เผื่อยังไม่มีในระบบ)
export async function updateCustomerPhone(userId, phoneNumber, prefix) {
  const phone = String(phoneNumber || "");
  if (!userId || !/^\d{9,10}$/.test(phone)) return null;
  const user = `${prefix || ""}${phone.slice(-7)}`;
  try {
    await Customer.updateOne(
      { userId },
      { $set: { phoneNumber: phone, user, ...(prefix ? { prefix } : {}) } },
      { upsert: true }
    );
    return user;
  } catch (err) {
    console.error("❌ อัปเดตเบอร์ลูกค้าล้มเหลว:", err.message);
    return null;
  }
}
