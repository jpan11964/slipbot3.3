// models/Notification.js — เก็บประวัติการแจ้งเตือนระบบ
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  key: { type: String, index: true },        // ใช้กันแจ้งซ้ำ เช่น "line_token:2007225467"
  level: { type: String, default: "info" },  // error | warn | info
  category: { type: String, default: "system" }, // line_token | system
  title: { type: String, default: "" },
  message: { type: String, default: "" },
  prefix: { type: String, default: "" },
  linename: { type: String, default: "" },
  channelId: { type: String, default: "" },
  count: { type: Number, default: 1 },       // เกิดซ้ำกี่ครั้ง
  times: { type: [Date], default: [] },      // เวลาที่เกิดแต่ละครั้ง (ใหม่สุดอยู่หน้า)
  readBy: { type: [String], default: [] },   // username ของคนที่กดอ่านแล้ว (แยกตามผู้ใช้)
  createdAt: { type: Date, default: Date.now },
});

// เก็บ 30 วันแล้วลบอัตโนมัติ
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
