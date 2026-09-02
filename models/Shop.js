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
    status: Boolean,
    slipCheckOption: String,
    registerlink: String,
    loginlink: String,
});

export default mongoose.model("Shop", ShopSchema);
