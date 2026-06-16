// utils/customerStore.js — บันทึก/อัปเดตลูกค้าใน collection "customers"
import Customer from "../models/Customer.js";

// บันทึกลูกค้าที่ทักเข้ามา (upsert ตาม userId — ไม่ซ้ำ) โดยไม่ยุ่งกับเบอร์ที่มีอยู่
export async function recordCustomer({ userId, prefix, linename, displayName }) {
  if (!userId) return;
  const set = {};
  if (prefix) set.prefix = prefix;
  if (linename) set.linename = linename;
  if (displayName && displayName !== "-") set.displayName = displayName;
  try {
    const update = { $setOnInsert: { phoneNumber: "", user: "" } };
    if (Object.keys(set).length) update.$set = set;
    await Customer.updateOne({ userId }, update, { upsert: true });
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
