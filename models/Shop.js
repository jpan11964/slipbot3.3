// models/Shop.js
import mongoose from "mongoose";

const LineSchema = new mongoose.Schema({
    linename: String,
    channel_id: String,
    access_token: String,
    secret_token: String,
    main: Boolean,
    tokenError: Boolean,   // true = ขอ access token ไม่สำเร็จ (ไลน์หลุด/ถูกระงับ)
    tokenErrorAt: Date,    // เวลาที่เจอปัญหาล่าสุด
    // แยกจาก tokenError เพราะตัวต่ออายุ token ทุก 4 วันจะล้าง tokenError ให้เอง
    // ถ้าเอา webhook มารวมธงเดียวกัน ไฟแดงจะหายทั้งที่ webhook ยังตั้งผิดอยู่
    webhookError: Boolean,   // true = Webhook URL ที่ LINE ไม่ตรงกับของระบบ / ยิงมาไม่ถึง
    webhookErrorAt: Date,
}, { _id: false });

const ShopSchema = new mongoose.Schema({
    name: String,
    prefix: String,
    lines: [LineSchema],
    bonusImage: {
        image1: { data: Buffer, contentType: String },
        image2: { data: Buffer, contentType: String },
    },
    passwordImage: {
    data: Buffer,
    contentType: String,
    },
    statusBot: Boolean,
    statusWithdraw: Boolean,
    statusBonusTime: Boolean,
    statusPassword: Boolean,
    // ตรวจว่าบัญชีปลายทางในสลิปตรงกับบัญชีของร้านไหม
    // default: true และฝั่งโค้ดเช็คด้วย !== false — ร้านเก่าที่ยังไม่มีฟิลด์นี้จึงยังตรวจอยู่เหมือนเดิม
    // (ถ้าเช็คแบบ truthy ตรงๆ ร้านเก่าทั้งหมดจะกลายเป็น "ปิดตรวจ" เงียบๆ ทันทีที่ deploy)
    statusBankCheck: { type: Boolean, default: true },
    status: Boolean,
    slipCheckOption: String,
    registerlink: String,
    loginlink: String,
});

export default mongoose.model("Shop", ShopSchema);
