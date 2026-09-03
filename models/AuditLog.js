// models/AuditLog.js — ประวัติการใช้งานระบบ ใครกดอะไรเมื่อไหร่
import mongoose from "mongoose";

const auditSchema = new mongoose.Schema({
  ts: { type: Date, required: true },
  username: { type: String, required: true },
  role: String,

  action: { type: String, required: true },  // คีย์ เช่น "shop.add" — ใช้กรอง
  label: String,                             // ข้อความไทยที่แสดงให้อ่าน
  target: String,                            // เป้าหมาย เช่น prefix / ชื่อไลน์ / ชื่อผู้ใช้
  detail: String,                            // รายละเอียดเพิ่มเติม

  method: String,
  path: String,
  status: Number,
  ok: Boolean,       // true = ทำสำเร็จ (HTTP < 400)
  ip: String,
});

// ค้นหาตามผู้ใช้/ประเภท ย้อนหลังตามเวลา
auditSchema.index({ ts: -1 });
auditSchema.index({ username: 1, ts: -1 });
auditSchema.index({ action: 1, ts: -1 });

// เก็บ 90 วันแล้วให้ MongoDB ลบเอง — ต้องตรงกับ AUDIT_RETENTION_DAYS ใน utils/auditLog.js
auditSchema.index({ ts: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("AuditLog", auditSchema);
