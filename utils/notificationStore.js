// utils/notificationStore.js — ตัวจัดการการแจ้งเตือนระบบ
//
// เก็บใน memory เป็นหลัก แล้ว persist ลง MongoDB เมื่อทำได้
// เหตุผล: การแจ้งเตือน "MongoDB ขัดข้อง" ต้องทำงานได้ตอน MongoDB ล่ม
// ซึ่งตอนนั้นเขียนลง DB ไม่ได้ — ถ้าพึ่ง DB อย่างเดียวจะไม่มีวันแจ้งได้เลย
//
// สถานะ "อ่านแล้ว" แยกตามผู้ใช้ (readBy = รายชื่อ username ที่กดอ่าน)
// ผู้ใช้ A กดอ่านแล้วตัวเลขหายเฉพาะ A — ผู้ใช้ B ยังเห็นตัวเลขอยู่
import Notification from "../models/Notification.js";

const MAX_MEMORY = 100;
const MAX_TIMES = 50; // เก็บเวลาที่เกิดซ้ำได้มากสุดกี่ครั้งต่อรายการ

let memory = []; // ใหม่สุดอยู่หน้าสุด

// ---- ระบบ subscribe สำหรับส่ง realtime (SSE) ----
// index.js เป็นคน subscribe แล้ว push ให้ browser — แยกแบบนี้เพื่อเลี่ยง circular import
// callback ไม่รับ payload เพราะแต่ละ client เห็นจำนวนค้างอ่านไม่เท่ากัน
// index.js ต้องคำนวณของแต่ละคนเองด้วย unreadCount(username)
const listeners = new Set();

export function onNotification(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* client หลุดไปแล้ว ไม่ต้องสนใจ */ }
  }
}

// เพิ่มการแจ้งเตือน
// เรื่องเดียวกันจากร้านเดียวกัน (key เดิม) จะรวมเป็นรายการเดียวเสมอ ไม่แยกให้รก
// แล้วนับ count + เก็บเวลาที่เกิดแต่ละครั้งไว้ใน times
export async function addNotification({
  level = "info",
  category = "system",
  title = "",
  message = "",
  prefix = "",
  linename = "",
  channelId = "",
  key = "",
} = {}) {
  const now = new Date();
  const dedupeKey = key || `${category}:${title}:${prefix}:${linename}`;

  const existing = memory.find((n) => n.key === dedupeKey);

  if (existing) {
    existing.count += 1;
    existing.createdAt = now;
    existing.readBy = []; // เกิดซ้ำ = ทุกคนต้องเห็นใหม่
    existing.message = message || existing.message;
    existing.times.unshift(now);
    if (existing.times.length > MAX_TIMES) existing.times.length = MAX_TIMES;
    memory = [existing, ...memory.filter((n) => n !== existing)];
  } else {
    memory.unshift({
      key: dedupeKey,
      level,
      category,
      title,
      message,
      prefix,
      linename,
      channelId,
      count: 1,
      times: [now],
      readBy: [],
      createdAt: now,
    });
    if (memory.length > MAX_MEMORY) memory.length = MAX_MEMORY;
  }

  console.log(`[แจ้งเตือน:${level}] ${title} — ${message}`);
  emit(); // ส่งให้ browser ทันที

  // persist ลง DB แบบ best-effort (ถ้า DB ล่มก็ไม่เป็นไร ยังมีใน memory)
  const saved = memory.find((n) => n.key === dedupeKey);
  try {
    await Notification.updateOne(
      { key: dedupeKey },
      {
        $set: {
          level, category, title, message, prefix, linename, channelId,
          count: saved.count,
          times: saved.times,
          readBy: [],
          createdAt: now,
        },
      },
      { upsert: true }
    );
  } catch {
    // เงียบไว้ — DB อาจล่มอยู่ ซึ่งเป็นเคสที่เราต้องแจ้งเตือนพอดี
  }
}

// อ่านรายการแจ้งเตือนของผู้ใช้คนหนึ่ง (จาก memory — เร็วและใช้ได้แม้ DB ล่ม)
// แปลง readBy → read เฉพาะของ user คนนั้น ไม่ส่งรายชื่อคนอื่นออกไป
export function listNotifications(limit = 50, username = "") {
  return memory.slice(0, limit).map((n) => ({
    key: n.key,
    level: n.level,
    category: n.category,
    title: n.title,
    message: n.message,
    prefix: n.prefix,
    linename: n.linename,
    channelId: n.channelId,
    count: n.count,
    times: n.times,
    createdAt: n.createdAt,
    read: (n.readBy || []).includes(username),
  }));
}

// จำนวนที่ผู้ใช้คนนี้ยังไม่ได้อ่าน
export function unreadCount(username = "") {
  return memory.filter((n) => !(n.readBy || []).includes(username)).length;
}

// ผู้ใช้คนนี้กดอ่านทั้งหมด — ไม่กระทบผู้ใช้คนอื่น
export function markAllRead(username = "") {
  if (!username) return;
  let changed = false;
  memory.forEach((n) => {
    if (!n.readBy) n.readBy = [];
    if (!n.readBy.includes(username)) {
      n.readBy.push(username);
      changed = true;
    }
  });
  if (changed) {
    Notification.updateMany(
      { readBy: { $ne: username } },
      { $addToSet: { readBy: username } }
    ).catch(() => {});
    emit();
  }
}

export function clearNotifications() {
  memory = [];
  Notification.deleteMany({}).catch(() => {});
  emit();
}

// ลบการแจ้งเตือนของ key นั้น (เช่น ไลน์กลับมาใช้งานได้แล้ว)
export function resolveNotification(key) {
  const before = memory.length;
  memory = memory.filter((n) => n.key !== key);
  Notification.deleteMany({ key }).catch(() => {});
  if (memory.length !== before) emit();
}

// โหลดของเก่าจาก DB เข้า memory ตอน start (ให้ไม่หายเมื่อ restart)
export async function loadNotificationsFromDB(limit = MAX_MEMORY) {
  try {
    const docs = await Notification.find().sort({ createdAt: -1 }).limit(limit).lean();
    memory = docs.map((d) => ({
      key: d.key, level: d.level, category: d.category, title: d.title,
      message: d.message, prefix: d.prefix, linename: d.linename,
      channelId: d.channelId, count: d.count || 1,
      times: Array.isArray(d.times) && d.times.length ? d.times : [d.createdAt],
      readBy: Array.isArray(d.readBy) ? d.readBy : [],
      createdAt: d.createdAt,
    }));
    console.log(`โหลดการแจ้งเตือนเดิม ${memory.length} รายการ`);
  } catch (err) {
    console.error("โหลดการแจ้งเตือนจาก DB ไม่สำเร็จ:", err.message);
  }
}
