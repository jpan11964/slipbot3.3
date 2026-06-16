// utils/permissions.js
// นิยามสิทธิ์ทั้งหมดในระบบ + helper สำหรับอ่านสิทธิ์ของผู้ใช้
import Credentials from "../models/Temp.js";

// เมนู sidebar ทั้งหมด (ต้องตรงกับ /page/:name และ data-page ใน index.html)
export const ALL_PAGES = ["main", "dashboard", "customers", "logs", "settings", "send-message"];

// ปุ่มในหน้าหลัก (การ์ดร้าน + เพิ่มร้าน)
export const ALL_SHOP_BUTTONS = ["toggle", "line", "bank", "setbot", "edit", "delete", "addshop"];

// ฟังก์ชันย่อยภายในปุ่ม "ตั้งค่าบอท"
export const ALL_SETBOT_FUNCS = ["withdraw", "textbot", "slipoption", "bonustime", "password"];

// สิทธิ์ผู้จัดการ — หน้าที่ OWNER มอบให้ ADMIN ได้ (จัดการสิทธิ์ / จัดการ prefix)
export const ALL_ADMIN_PAGES = ["permissions", "prefixes"];

export const ADMIN_PAGE_LABELS = {
  permissions: "จัดการสิทธิ์ผู้ใช้",
  prefixes: "จัดการ Prefix",
};

// label ภาษาไทย ใช้แสดงในหน้าจัดการสิทธิ์
export const PAGE_LABELS = {
  main: "หน้าหลัก",
  dashboard: "การทำงานบอท",
  customers: "จัดการข้อมูลลูกค้า",
  logs: "Logs",
  settings: "ตั้งค่าการตรวจสลิป",
  "send-message": "ส่งข้อความ LINE",
};

export const SHOP_BUTTON_LABELS = {
  toggle: "เปิด/ปิดบอท",
  line: "ไลน์ร้าน",
  bank: "จัดการบัญชีธนาคาร",
  setbot: "ตั้งค่าบอท",
  edit: "แก้ไขร้าน",
  delete: "ลบร้านค้า",
  addshop: "เพิ่มร้านค้า",
};

export const SETBOT_FUNC_LABELS = {
  withdraw: "ปิด/เปิดการถอน",
  textbot: "ปิด/เปิดบอทตอบข้อความ",
  slipoption: "ตัวเลือกการตรวจสลิป",
  bonustime: "ปิด/เปิดการตอบ BonusTime",
  password: "ปิด/เปิดการตอบ ลืม password",
};

// แมป route → ปุ่มที่ต้องมีสิทธิ์ (ใช้ใน middleware ฝั่ง backend)
export const ROUTE_BUTTON_MAP = {
  "/api/add-shop": "addshop",
  "/api/delete-shop": "delete",
  "/api/add-line": "line",
  "/api/update-line": "line",
  "/api/delete-line": "line",
  "/api/add-bank": "bank",
  "/api/edit-bank": "bank",
  "/api/delete-bank": "bank",
  "/api/update-bank-status": "bank",
};

// แมป route → ฟังก์ชันย่อยในปุ่มตั้งค่าบอท (ต้องมีสิทธิ์ "setbot" + ฟังก์ชันย่อยนั้น)
export const ROUTE_SETBOT_MAP = {
  "/api/update-withdraw-status": "withdraw",
  "/api/update-textbot-status": "textbot",
  "/api/update-slip-option": "slipoption",
  "/api/update-bonusTime-status": "bonustime",
  "/api/upload-bonus-image": "bonustime",
  "/api/upload-change-bonus-image": "bonustime",
  "/api/delete-bonus-image": "bonustime",
  "/api/update-password-status": "password",
  "/api/upload-password-image": "password",
  "/api/delete-password-image": "password",
};

// อ่านสิทธิ์ของผู้ใช้จาก DB — OWNER ได้ทุกสิทธิ์เสมอ
export async function getUserPermissions(role, username) {
  if (role === "OWNER") {
    return {
      sidebar: [...ALL_PAGES],
      shopButtons: [...ALL_SHOP_BUTTONS],
      setbotFunctions: [...ALL_SETBOT_FUNCS],
      adminPages: [...ALL_ADMIN_PAGES],
    };
  }
  try {
    const data = await Credentials.findOne();
    const arr = Array.isArray(data?.[role]) ? data[role] : [];
    const user = arr.find(u => u.username === username);
    const p = user?.permissions || {};
    return {
      sidebar: Array.isArray(p.sidebar) ? p.sidebar : [],
      shopButtons: Array.isArray(p.shopButtons) ? p.shopButtons : [],
      setbotFunctions: Array.isArray(p.setbotFunctions) ? p.setbotFunctions : [],
      // เฉพาะ ADMIN เท่านั้นที่ถือสิทธิ์ผู้จัดการได้
      adminPages: role === "ADMIN" && Array.isArray(p.adminPages) ? p.adminPages : [],
    };
  } catch (err) {
    console.error("❌ โหลดสิทธิ์ผู้ใช้ล้มเหลว:", err.message);
    return { sidebar: [], shopButtons: [], setbotFunctions: [], adminPages: [] };
  }
}
