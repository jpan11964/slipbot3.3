// models/BankAccount.js
import mongoose from "mongoose";

const bankAccountSchema = new mongoose.Schema({
  prefix: { type: String, required: true },
  name: { type: String, required: true },
  account: { type: String, required: true },
  status: { type: Boolean, default: false },
  // เวลาที่กดปิดบัญชีนี้ล่าสุด — ใช้ผ่อนผันให้สลิปที่โอนเข้าบัญชีนี้ยังผ่านได้อีก 5 นาที
  // (ลูกค้าที่เห็นเลขบัญชีบนหน้าเว็บก่อนร้านจะสลับบัญชี กำลังโอนอยู่พอดี จะได้ไม่โดนตีตกทันที)
  // ไม่มีค่า = ปิดมานานแล้ว/ไม่เคยปิด — ถือว่าพ้นช่วงผ่อนผันไปแล้ว
  disabledAt: Date,
  // เวลาที่บัญชีนี้ถูกเปิดในฐานะ "ใบแรกของร้าน" (ตอนที่ยังไม่มีใบไหนเปิดอยู่เลย)
  // ใช้หน่วงการเริ่มตรวจไว้ 30 วิ ระหว่างที่แอดมินทยอยเปิดบัญชีที่เหลือ
  firstEnabledAt: Date,
});

export default mongoose.model("BankAccount", bankAccountSchema);
