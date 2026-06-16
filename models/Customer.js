// models/Customer.js — เก็บลูกค้า "ทุกคน" ที่ทักเข้ามา (ไม่ว่ามีเบอร์หรือไม่) ไม่ซ้ำ (key = userId)
import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // userId ไลน์ของลูกค้า (กันซ้ำ)
  prefix: { type: String, default: "" },                  // prefix ร้านที่ลูกค้าเข้ามา
  linename: { type: String, default: "" },                // ชื่อไลน์ร้านที่ลูกค้าทักมา
  displayName: { type: String, default: "" },             // ชื่อโปรไฟล์ไลน์ลูกค้า (ถ้าดึงได้)
  phoneNumber: { type: String, default: "" },             // เบอร์โทร (ว่างถ้ายังไม่มี)
  user: { type: String, default: "" },                    // {prefix}+เลขท้ายเบอร์ 7 ตัว (ว่างถ้ายังไม่มีเบอร์)
}, { timestamps: true });

const Customer = mongoose.models.Customer || mongoose.model("Customer", customerSchema);
export default Customer;
