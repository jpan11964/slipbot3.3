// models/SlipResult.js
import mongoose from "mongoose";

const slipResultSchema = new mongoose.Schema({
  shop: String,
  lineName: String,
  userId: String,           // ✅ เพิ่มบรรทัดนี้
  phoneNumber: String,
  text: String,
  status: String,
  response: String,
  amount: Number,
  ref: String,
  prefix: String,
  reply: String,
  time: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: 259200 } // 3 วัน — ต้องตรงกับ SLIP_RESULT_RETENTION_DAYS ใน index.js เสมอ
  }
});

export default mongoose.models.SlipResult || mongoose.model("SlipResult", slipResultSchema);
