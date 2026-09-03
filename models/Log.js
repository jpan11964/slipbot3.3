// models/Log.js — log การใช้งาน เก็บลง MongoDB เพื่อไม่ให้หายตอน server restart
import mongoose from "mongoose";

const logSchema = new mongoose.Schema({
  ts: { type: Date, required: true },
  text: { type: String, required: true },
});

// MongoDB ลบเองเมื่อเกิน 3 วัน — ต้องตรงกับ LOG_RETENTION_DAYS ใน index.js
logSchema.index({ ts: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

export default mongoose.model("Log", logSchema);
