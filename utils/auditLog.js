// utils/auditLog.js — บันทึกว่า "ใครกดอะไร" ทุกการกระทำที่เปลี่ยนแปลงข้อมูล
//
// ทำไมดักที่ฝั่ง server ไม่ใช่ไปผูก onclick ทุกปุ่ม:
//   1. ครอบคลุมอัตโนมัติ — เพิ่ม route ใหม่แล้วไม่ต้องไปแก้ปุ่ม (ไม่มีทางลืม)
//   2. ปลอมไม่ได้ — client ส่งอะไรมาก็บันทึกตามผลจริงที่เกิดกับข้อมูล
//   3. บันทึก "ผลลัพธ์" ด้วย (สำเร็จ/ล้มเหลว) ไม่ใช่แค่ "ตั้งใจจะกด"
import AuditLog from "../models/AuditLog.js";

export const AUDIT_RETENTION_DAYS = 90; // ต้องตรงกับ TTL index ใน models/AuditLog.js

// ตัดข้อความยาวๆ (เช่น base64 ของรูป) ไม่ให้บวมฐานข้อมูล
function short(v, max = 80) {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// หยิบค่าแรกที่เจอจาก body (รองรับหลายชื่อฟิลด์ เพราะแต่ละ route ตั้งชื่อไม่เหมือนกัน)
const pick = (body, ...keys) => {
  for (const k of keys) {
    const v = body?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
};

const onOff = (v) => (v === true || v === "true" ? "เปิด" : "ปิด");

// ===== ฟิลด์ที่ห้ามบันทึกลงฐานข้อมูลเด็ดขาด =====
const SECRET_KEYS = [
  "password", "currentpassword", "newpassword", "confirmpassword",
  "access_token", "accesstoken", "secret_token", "secrettoken",
  "token", "apikey", "api_key", "secret", "sessionsecret", "credential",
];

const isSecret = (key) => {
  const k = String(key).toLowerCase();
  return SECRET_KEYS.includes(k) || k.includes("password") || k.includes("token") || k.includes("secret");
};

// สรุปทั้ง body เป็นข้อความ โดยตัดฟิลด์ลับทิ้งก่อนเสมอ
// ใช้กับ route ที่รับค่าหลายตัวและอยากเห็นภาพรวม (เช่น /api/settings)
function safeSummary(body, max = 160) {
  if (!body || typeof body !== "object") return "";
  const clean = {};
  for (const [k, v] of Object.entries(body)) {
    if (isSecret(k)) continue;                    // ตัดทิ้ง ไม่แม้แต่ใส่ "***"
    if (v && typeof v === "object") continue;     // ของซ้อนชั้น (เช่น buffer รูป) ไม่ต้องเก็บ
    clean[k] = v;
  }
  return short(clean, max);
}

// ===== แคตตาล็อกการกระทำ =====
// key = path ของ route, label = ข้อความไทย, target/detail = ดึงจาก body
// route ที่ไม่อยู่ในนี้ก็ยังถูกบันทึก แต่ใช้ path เป็นชื่อแทน — จะได้ไม่มีอะไรตกหล่น
export const AUDIT_ACTIONS = {
  // ----- เข้าสู่ระบบ -----
  "/login": { action: "auth.login", label: "เข้าสู่ระบบ" },
  "/api/change-password": { action: "auth.changePassword", label: "เปลี่ยนรหัสผ่านตัวเอง" },

  // ----- ร้านค้า -----
  "/api/add-shop": { action: "shop.add", label: "เพิ่มร้านค้า", target: b => pick(b, "prefix"), detail: b => pick(b, "name") },
  "/api/update-shop": { action: "shop.update", label: "แก้ไขร้านค้า", target: b => pick(b, "prefix"), detail: b => pick(b, "name", "newName") },
  "/api/delete-shop": { action: "shop.delete", label: "ลบร้านค้า", target: b => pick(b, "prefix") },

  // ----- บัญชี LINE -----
  "/api/add-line": { action: "line.add", label: "เพิ่มบัญชี LINE", target: b => pick(b, "prefix"), detail: b => pick(b, "linename") },
  "/api/update-line": { action: "line.update", label: "แก้ไขบัญชี LINE", target: b => pick(b, "prefix"), detail: b => pick(b, "linename") },
  "/api/delete-line": { action: "line.delete", label: "ลบบัญชี LINE", target: b => pick(b, "prefix"), detail: b => pick(b, "linename", "index") },
  "/api/get-access-token": { action: "line.token", label: "ขอ access token ของ LINE", target: b => pick(b, "prefix"), detail: b => pick(b, "linename") },
  "/api/set-webhook": { action: "line.webhook", label: "ตั้งค่า webhook ของ LINE", target: b => pick(b, "prefix"), detail: b => pick(b, "linename") },

  // ----- บัญชีธนาคาร -----
  "/api/add-bank": { action: "bank.add", label: "เพิ่มบัญชีธนาคาร", target: b => pick(b, "prefix"), detail: b => `${pick(b, "name")} ${pick(b, "account")}`.trim() },
  "/api/edit-bank": { action: "bank.edit", label: "แก้ไขบัญชีธนาคาร", target: b => pick(b, "prefix"), detail: b => `${pick(b, "name")} ${pick(b, "account")}`.trim() },
  "/api/delete-bank": { action: "bank.delete", label: "ลบบัญชีธนาคาร", target: b => pick(b, "prefix"), detail: b => pick(b, "name", "index") },
  "/api/update-bank-status": { action: "bank.status", label: "เปิด/ปิดบัญชีธนาคาร", target: b => pick(b, "prefix"), detail: b => `${pick(b, "name", "index")} → ${onOff(b?.status)}` },

  // ----- ตั้งค่าบอทของร้าน -----
  "/api/update-textbot-status": { action: "setbot.textbot", label: "เปิด/ปิดบอทตอบข้อความ", target: b => pick(b, "prefix"), detail: b => onOff(b?.statusBot ?? b?.status) },
  "/api/update-withdraw-status": { action: "setbot.withdraw", label: "เปิด/ปิดการถอน", target: b => pick(b, "prefix"), detail: b => onOff(b?.statusWithdraw ?? b?.status) },
  "/api/update-slip-option": { action: "setbot.slipOption", label: "เปลี่ยนตัวเลือกตรวจสลิป", target: b => pick(b, "prefix"), detail: b => pick(b, "slipCheckOption", "option") },
  "/api/update-bonusTime-status": { action: "setbot.bonusTime", label: "เปิด/ปิดการตอบ BonusTime", target: b => pick(b, "prefix"), detail: b => onOff(b?.statusBonusTime ?? b?.status) },
  "/api/update-password-status": { action: "setbot.password", label: "เปิด/ปิดการตอบลืมรหัสผ่าน", target: b => pick(b, "prefix"), detail: b => onOff(b?.statusPassword ?? b?.status) },

  // ----- รูปภาพ -----
  "/api/upload-bonus-image": { action: "image.bonusUpload", label: "อัปโหลดรูป BonusTime", target: b => pick(b, "prefix") },
  "/api/upload-change-bonus-image": { action: "image.bonusChange", label: "เปลี่ยนรูป BonusTime", target: b => pick(b, "prefix"), detail: b => (pick(b, "index") ? `รูปที่ ${pick(b, "index")}` : "") },
  "/api/delete-bonus-image": { action: "image.bonusDelete", label: "ลบรูป BonusTime", target: b => pick(b, "prefix"), detail: b => (pick(b, "index") ? `รูปที่ ${pick(b, "index")}` : "ทั้งหมด") },
  "/api/upload-password-image": { action: "image.passwordUpload", label: "อัปโหลดรูปรหัสผ่าน", target: b => pick(b, "prefix") },
  "/api/delete-password-image": { action: "image.passwordDelete", label: "ลบรูปรหัสผ่าน", target: b => pick(b, "prefix") },

  // ----- ตั้งค่าระบบ -----
  "/api/settings": { action: "settings.update", label: "บันทึกการตั้งค่าระบบสลิป", detail: b => safeSummary(b) },

  // ----- Prefix -----
  "/api/add-prefix": { action: "prefix.add", label: "เพิ่ม Prefix", target: b => pick(b, "prefix") },
  "/api/delete-prefix": { action: "prefix.delete", label: "ลบ Prefix", target: b => pick(b, "prefix") },

  // ----- สิทธิ์ผู้ใช้ -----
  "/api/permissions/update": { action: "perm.update", label: "แก้ไขสิทธิ์ผู้ใช้", target: b => pick(b, "username"), detail: b => pick(b, "role") },
  "/api/permissions/create-user": { action: "perm.createUser", label: "สร้างบัญชีผู้ใช้", target: b => pick(b, "username"), detail: b => pick(b, "role") },
  "/api/permissions/edit-user": { action: "perm.editUser", label: "แก้ไขบัญชีผู้ใช้", target: b => pick(b, "username", "oldUsername"), detail: b => pick(b, "newUsername", "role") },
  "/api/permissions/delete-user": { action: "perm.deleteUser", label: "ลบบัญชีผู้ใช้", target: b => pick(b, "username"), detail: b => pick(b, "role") },

  // ----- ลูกค้า / ข้อความ -----
  "/api/customer-phone": { action: "customer.phone", label: "แก้ไขเบอร์ลูกค้า", target: b => pick(b, "userId"), detail: b => pick(b, "phone") },
  "/api/send-message": { action: "message.send", label: "ส่งข้อความหาลูกค้า", target: b => pick(b, "userId", "prefix"), detail: b => short(pick(b, "message", "text"), 60) },
  "/api/upload-send-image-line": { action: "message.uploadImage", label: "อัปโหลดรูปสำหรับส่งข้อความ" },
  "/api/delete-my-upload": { action: "message.deleteUpload", label: "ลบรูปที่อัปโหลดไว้" },

  // ----- แจ้งเตือน -----
  "/api/notifications/clear": { action: "noti.clear", label: "ล้างการแจ้งเตือนทั้งหมด" },
  "/api/notifications/test": { action: "noti.test", label: "สร้างการแจ้งเตือนทดสอบ" },
};

// route ที่ไม่ต้องบันทึก — เกิดถี่มากและไม่ใช่การกระทำที่คนตั้งใจกด
export const AUDIT_SKIP = new Set([
  "/api/my-shop-filter",     // จำตัวกรองหน้าจอของแต่ละคน
  "/api/notifications/read", // แค่ทำเครื่องหมายว่าอ่านแล้ว
  "/api/slip-results",       // บอทเขียนเอง ไม่ใช่คนกด
  "/api/save-phone",         // บอทเขียนเอง
  "/api/user-lookup-batch",  // แค่ค้นหา ไม่ได้แก้อะไร
]);

// ===== เขียนลง MongoDB แบบเป็นชุด =====
// การกดปุ่มไม่ถี่เท่า log ทั่วไป แต่ก็ไม่ควรค้าง response ไว้รอ DB
const buffer = [];
let flushTimer = null;

async function flush() {
  flushTimer = null;
  if (!buffer.length) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await AuditLog.insertMany(batch, { ordered: false });
  } catch (err) {
    console.error("บันทึกประวัติการใช้งานไม่สำเร็จ:", err.message);
  }
}

export function recordAudit(entry) {
  buffer.push({ ts: new Date(), ...entry });
  if (buffer.length >= 30) return void flush();
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 1500);
    flushTimer.unref?.();
  }
}

// เขียนของที่ค้างให้หมดก่อนปิดโปรเซส
export const flushAudit = flush;

// ===== สร้างรายการบันทึกจาก request =====
// หมายเหตุความปลอดภัย: ฟังก์ชันนี้อ่านเฉพาะฟิลด์ที่ระบุไว้ในแคตตาล็อกเท่านั้น
// จึงไม่มีทางเผลอบันทึกรหัสผ่าน / access_token / secret_token ลงฐานข้อมูล
export function buildAuditEntry(req, res) {
  const path = req.path;
  const spec = AUDIT_ACTIONS[path];
  const body = req.body && typeof req.body === "object" ? req.body : {};

  let target = "";
  let detail = "";
  try {
    target = spec?.target ? String(spec.target(body) || "") : "";
    detail = spec?.detail ? String(spec.detail(body) || "") : "";
  } catch {
    // ตัวดึงข้อมูลพังไม่ควรทำให้ request ล้ม — บันทึกเท่าที่ได้
  }

  // route ที่ยังไม่มีในแคตตาล็อก — เดาเป้าหมายจากฟิลด์ที่พบบ่อย (ไม่แตะฟิลด์ลับ)
  if (!spec && !target) target = pick(body, "prefix", "username", "userId", "name");

  return {
    username: req.session?.user?.username || "-",
    role: req.session?.user?.role || "",
    action: spec?.action || "other" + path.replace(/\//g, "."),
    label: spec?.label || path,
    target: short(target, 120),
    detail: short(detail, 200),
    method: req.method,
    path,
    status: res.statusCode,
    ok: res.statusCode < 400,
    ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "",
  };
}

// ===== อ่านประวัติ =====
export async function listAudit({ q = "", username = "", action = "", from = "", to = "", skip = 0, limit = 100 } = {}) {
  const filter = {};
  if (username) filter.username = username;
  if (action) filter.action = action;
  if (from || to) {
    filter.ts = {};
    if (from) filter.ts.$gte = new Date(from);
    if (to) filter.ts.$lte = new Date(to);
  }
  if (q) {
    // escape อักขระพิเศษก่อน ไม่งั้นผู้ใช้พิมพ์ "(" แล้ว regex พัง
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ label: rx }, { target: rx }, { detail: rx }, { username: rx }];
  }

  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ ts: -1 }).skip(skip).limit(limit).lean(),
  ]);
  return { total, rows };
}

// ตัวเลือกสำหรับ dropdown ตัวกรอง — เอาเฉพาะที่มีอยู่จริงในข้อมูล
export async function auditFilterOptions() {
  const [users, actions] = await Promise.all([
    AuditLog.distinct("username"),
    AuditLog.distinct("action"),
  ]);
  const labelOf = {};
  for (const spec of Object.values(AUDIT_ACTIONS)) labelOf[spec.action] = spec.label;
  return {
    users: users.filter(Boolean).sort(),
    actions: actions.filter(Boolean).sort().map(a => ({ action: a, label: labelOf[a] || a })),
  };
}
