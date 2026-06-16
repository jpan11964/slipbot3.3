// savePhoneNumber.js
import Phone from '../models/Phone.js';
import SlipResult from '../models/SlipResult.js';
import { broadcastLog } from "../index.js";
import { broadcastPhoneUpdate } from "../index.js";
import { updateCustomerPhone } from "./customerStore.js";

// ดึงรายชื่อลูกค้าทั้งหมด (ของทุก prefix)
export async function getCustomerList() {
  try {
    return await Phone.find({});
  } catch (err) {
    console.error("❌ อ่านข้อมูลจาก MongoDB ไม่สำเร็จ:", err);   
    return [];
  }
}

// ตรวจสอบว่าเป็นลูกค้าใหม่หรือไม่ (ตาม userId)
export async function isNewCustomer(userId) {
  try {
    const found = await Phone.findOne({ userId });
    return !found;
  } catch (err) {
    console.error("❌ ตรวจสอบลูกค้าเก่าล้มเหลว:", err);
    return false;
  }
}

export async function checkAndUpdatePhoneNumber(phoneNumber, userId, prefix) {
  if (!/^(06|08|09)\d{8}$/.test(phoneNumber)) {
    console.warn('❌ เบอร์ไม่ถูกต้อง:', phoneNumber);
    return;
  }

  const suffix = phoneNumber.slice(-7);
  const lineName = `${prefix}${suffix}`;

  try {
    const result = await SlipResult.updateMany(
      { userId },
      { $set: { phoneNumber, lineName } }
    );
  } catch (err) {
    console.error('❌ อัปเดตเบอร์ใน slipResults ล้มเหลว:', err);
  }
}

// ตรวจจับและบันทึกเบอร์โทรใหม่ลง MongoDB พร้อม prefix
export async function checkAndSavePhoneNumber(text, userId, prefix, linename) {
  const phoneMatch = text.match(/\b(06|08|09)\d{8}\b/);
  if (!phoneMatch) return;

  const phoneNumber = phoneMatch[0];
  const suffix = phoneNumber.slice(-7);           // 7 ตัวท้าย
  const user = `${prefix}${suffix}`;
  const lineName = `${prefix}${suffix}`;            // ประกอบเป็น user

  // อัปเดตเบอร์ใน collection ลูกค้า (customers) เสมอ แม้ Phone จะมีอยู่แล้ว
  await updateCustomerPhone(userId, phoneNumber, prefix);

  try {
    const existing = await Phone.findOne({ userId });
    if (existing) return;

    const newLog = new Phone({
      userId,
      phoneNumber,
      prefix,
      user,
      linename,
    });

    broadcastPhoneUpdate(userId, phoneNumber, lineName);

    await newLog.save();
    console.log(`เพิ่มเบอร์โทรลูกค้าใหม่: ${phoneNumber} ร้าน: ${prefix}`);
    broadcastLog(`เพิ่มเบอร์โทรลูกค้าใหม่: ${phoneNumber} ร้าน: ${prefix}`);

    await checkAndUpdatePhoneNumber(phoneNumber, userId, prefix);
  } catch (err) {
    console.error('❌ บันทึกเบอร์โทรไม่สำเร็จ:', err);
  }
}