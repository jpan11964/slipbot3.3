// models/Credentials.js
import mongoose from "mongoose";

const roleSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  // ร้านที่ผู้ใช้คนนี้เลือกแสดง (ตัวกรองหน้าหลัก/dashboard) — ไม่มี/ null = แสดงทุกร้าน
  displayedShops: { type: [String], default: undefined },
  // สิทธิ์ที่ OWNER กำหนดให้ผู้ใช้คนนี้ (ใช้กับ ADMIN/USER เท่านั้น — OWNER ได้ทุกสิทธิ์เสมอ)
  permissions: {
    sidebar: { type: [String], default: [] },         // เมนู sidebar ที่เห็นได้ เช่น ["main","dashboard"]
    shopButtons: { type: [String], default: [] },     // ปุ่มในหน้าหลัก เช่น ["toggle","line","bank"]
    setbotFunctions: { type: [String], default: [] }, // ฟังก์ชันย่อยในปุ่มตั้งค่าบอท เช่น ["withdraw","textbot"]
    adminPages: { type: [String], default: [] },      // สิทธิ์ผู้จัดการ (เฉพาะ ADMIN) เช่น ["permissions","prefixes"]
  }
});

// ใช้ schema หลักที่เก็บเป็นกลุ่ม role
const credentialsSchema = new mongoose.Schema({
  OWNER: [roleSchema],
  ADMIN: [roleSchema],
  USER: [roleSchema]
});

const Credentials =
  mongoose.models.Credentials ||
  mongoose.model("Credentials", credentialsSchema);

export default Credentials;