// index.js
import express from "express";
import * as line from "@line/bot-sdk";
import session from "express-session";
import MongoStore from "connect-mongo";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { loadCredentialsFromDB } from "./credentials.js";
import Credentials from "./models/Temp.js";
import { ALL_PAGES, ALL_SHOP_BUTTONS, ALL_SETBOT_FUNCS, ALL_ADMIN_PAGES, PAGE_LABELS, SHOP_BUTTON_LABELS, SETBOT_FUNC_LABELS, ADMIN_PAGE_LABELS, ROUTE_BUTTON_MAP, ROUTE_SETBOT_MAP, getUserPermissions } from "./utils/permissions.js";
import { startSlip2goMonitor } from "./utils/slip2goMonitor.js";
import * as crypto from "crypto";
import { handleEvent } from "./handlers/handleEvent.js";
import { loadSettings, saveSettings, reloadSettings } from './utils/settingsManager.js';
import BankAccount from "./models/BankAccount.js";
import dotenv from "dotenv";
import sharp from "sharp";
import UploadedImage from "./models/lineSendingImage.js";
import SlipResult from "./models/SlipResult.js";
import Phone from './models/Phone.js';
import PrefixForshop from "./models/Prefix.js";
import moment from "moment-timezone";
import { connectDB } from "./mongo.js";
import Shop from "./models/Shop.js";
import { checkAndSavePhoneNumber, checkAndUpdatePhoneNumber } from "./utils/savePhoneNumber.js";
import multer from "multer";

const upload = multer();
const uploadsendimage  = multer();

const envFile = process.env.NODE_ENV === "production" ? "info.prod.env" : "info.dev.env"
const envPath = path.join(process.cwd(), envFile)
const fallback = path.join(process.cwd(), "info.env")
dotenv.config({ path: fs.existsSync(envPath) ? envPath : fallback })
console.log(`Loading: ${fs.existsSync(envPath) ? envFile : "info.env (fallback)"}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const baseURL = process.env.URL || `http://localhost:${PORT}`;

const app = express();
const clients = [];
const MAX_LOGS = 1000; // เก็บ log ในหน่วยความจำมากขึ้น เพื่อให้เลื่อนดู log เก่าได้
const logHistory = [];
const logClients = [];

// ตั้ง session ไว้ก่อนเสมอ
// เก็บ session ใน MongoDB → ไม่หลุด login เมื่อ server restart (nodemon ตอน dev)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions",
    ttl: 24 * 60 * 60, // 24 ชั่วโมง (วินาที)
  }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 ชั่วโมง
}));

// ป้องกัน cache
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Static ที่ไม่ต้อง login
app.use(express.static("public")); // สำหรับ login.html
app.use("/views/css", express.static(path.join(__dirname, "views/css")));
app.use("/views/js", express.static(path.join(__dirname, "views/js")));

// Body parser
app.use("/webhook", (req, res, next) => {
  next();
});
app.use("/webhook", express.raw({ type: "application/json" })); // อยู่บนสุด
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== Webhook เดียวแบบ dynamic =====
// อ่าน shop/line จาก DB สดทุก request — เพิ่มร้าน/เปิดบอทมีผลทันที ไม่ต้อง register route ใน RAM
// (เลิกใช้ setupWebhooks/restartWebhooks ในการสร้าง route แล้ว)
app.post("/webhook/:prefix/:channelTag", async (req, res) => {
  try {
    const prefix = req.params.prefix;
    const channelId4 = String(req.params.channelTag).replace(/\.bot$/i, ""); // "2480.bot" → "2480"

    const shop = await Shop.findOne({ prefix });
    const lineAccount = shop?.lines?.find(
      (l) => String(l.channel_id).slice(-4) === channelId4
    );

    if (!shop || !lineAccount) {
      console.warn(`⚠️ webhook ไม่พบร้าน/LINE: ${prefix}/${channelId4}`);
      return res.status(200).send("OK"); // ตอบ 200 กัน LINE ส่งซ้ำรัวๆ
    }

    // req.body เป็น Buffer (จาก express.raw ด้านบน) — แปลงเป็น JSON เอง
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const body = JSON.parse(rawBody.toString("utf8") || "{}");
    const events = body.events || [];

    const accessToken = String(lineAccount.access_token);
    const client = new line.Client({ channelAccessToken: accessToken });

    await Promise.all(
      events.map((ev) => handleEvent(ev, client, prefix, lineAccount.linename, accessToken, baseURL))
    );

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ webhook error:", err?.message || err);
    res.status(200).send("OK"); // อย่าให้ LINE retry ถล่ม
  }
});

// ===== บังคับสิทธิ์ฝั่ง Backend (กันเรียก API ตรงๆ) =====
// OWNER ผ่านทุกอย่าง — ADMIN/USER ต้องมีสิทธิ์ปุ่มนั้นๆ
app.use(async (req, res, next) => {
  // /api/update-shop ใช้ร่วมกันระหว่าง toggle (status) และ edit (name)
  let needed = ROUTE_BUTTON_MAP[req.path];
  if (req.path === "/api/update-shop") {
    needed = (typeof req.body?.status === "boolean" && req.body?.name === undefined) ? "toggle" : "edit";
  }
  const setbotFunc = ROUTE_SETBOT_MAP[req.path]; // ฟังก์ชันย่อยในปุ่มตั้งค่าบอท

  if (!needed && !setbotFunc) return next();

  const u = req.session?.user;
  if (!u) return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบ" });
  if (u.role === "OWNER") return next();

  const perms = await getUserPermissions(u.role, u.username);

  // route ของฟังก์ชันย่อย ต้องมีสิทธิ์ "setbot" + ฟังก์ชันย่อยนั้น
  if (setbotFunc) {
    if (perms.shopButtons.includes("setbot") && perms.setbotFunctions.includes(setbotFunc)) return next();
    return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
  }

  if (perms.shopButtons.includes(needed)) return next();
  return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
});

let shopData = [];

// ╔══════════════════════════════════════════════════════════════╗
// ║                        ROUTE MAP                            ║
// ╠══════════════════════════════════════════════════════════════╣
// ║  SSE / Logs        ~74    GET  /api/logs                    ║
// ║                    ~114   GET  /events                      ║
// ║  Bank Accounts     ~152   GET  /api/bank-accounts           ║
// ║                    ~161   POST /api/add-bank                ║
// ║                    ~184   POST /api/edit-bank               ║
// ║                    ~213   POST /api/update-bank-status      ║
// ║                    ~234   POST /api/delete-bank             ║
// ║  Slip Results      ~259   POST /api/slip-results            ║
// ║                    ~293   GET  /api/slip-results            ║
// ║  Auth / Pages      ~328   GET/POST /login                   ║
// ║                    ~364   GET  /logout                      ║
// ║                    ~371   GET  /  (dashboard shell)         ║
// ║                    ~377   GET  /page/:name                  ║
// ║  Phone / Env       ~386   POST /api/save-phone              ║
// ║                    ~403   GET  /api/env                     ║
// ║  Shops             ~408   GET  /api/shops                   ║
// ║                    ~418   POST /api/add-shop                ║
// ║                    ~464   POST /api/update-line             ║
// ║                    ~510   POST /api/update-shop             ║
// ║                    ~539   POST /api/delete-line             ║
// ║                    ~567   POST /api/add-line                ║
// ║                    ~948   POST /api/delete-shop             ║
// ║  Bonus Image       ~602   POST /api/upload-bonus-image      ║
// ║                    ~641   POST /api/upload-change-bonus-image║
// ║                    ~669   GET  /api/get-bonus-image-original ║
// ║                    ~682   GET  /api/get-bonus-image         ║
// ║                    ~706   POST /api/update-bonusTime-status  ║
// ║                    ~725   POST /api/delete-bonus-image       ║
// ║  Password Image    ~748   GET  /api/get-password-image-original║
// ║                    ~764   POST /api/upload-password-image   ║
// ║                    ~795   GET  /api/get-password-image      ║
// ║                    ~817   POST /api/update-password-status  ║
// ║                    ~836   POST /api/delete-password-image   ║
// ║  Feature Toggles   ~852   POST /api/update-textbot-status   ║
// ║                    ~873   POST /api/update-withdraw-status  ║
// ║                    ~894   POST /api/update-slip-option      ║
// ║  Settings          ~918   GET/POST /api/settings            ║
// ║  LINE Helpers      ~965   POST /api/get-access-token        ║
// ║                    ~1015  POST /api/set-webhook             ║
// ║  Send Message      ~1047  GET  /api/uploaded-image          ║
// ║                    ~1065  DELETE /api/delete-my-upload      ║
// ║                    ~1081  POST /api/user-lookup-batch       ║
// ║                    ~1119  POST /api/send-message            ║
// ║                    ~1236  POST /api/upload-send-image-line  ║
// ╚══════════════════════════════════════════════════════════════╝

// ประวัติ log แบบแบ่งหน้า (ล่าสุดก่อน) — ?skip=0&limit=200
app.get("/api/logs-history", (req, res) => {
  const skip = Math.max(0, parseInt(req.query.skip) || 0);
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 200));
  const newestFirst = logHistory.slice().reverse(); // logHistory เก็บเก่า→ใหม่ จึง reverse เป็นใหม่→เก่า
  res.json(newestFirst.slice(skip, skip + limit));
});

// Endpoint สำหรับสตรีม log "ใหม่" แบบเรียลไทม์ (ประวัติเก่าโหลดผ่าน /api/logs-history)
app.get("/api/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  logClients.push(res);

  req.on("close", () => {
    const index = logClients.indexOf(res);
    if (index > -1) {
      logClients.splice(index, 1);
    }
  });
});

process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET') {
    console.warn('⚠️ [uncaughtException] Connection reset by peer (ignored)');
    // ไม่ต้องปิดแอพ
  } else {
    console.error('❌ [uncaughtException]', err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason.code === 'ECONNRESET') {
    console.warn('⚠️ [unhandledRejection] ECONNRESET (ignored)');
    // ไม่ crash
  } else {
    console.error('❌ [unhandledRejection]', reason);
  }
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  clients.push(res);

  req.on("close", () => {
    clients.splice(clients.indexOf(res), 1);
  });
});

let bankAccounts = {};

export async function loadBankAccounts() {
  try {
    const all = await BankAccount.find();
    const grouped = {};
    for (const entry of all) {
      if (!grouped[entry.prefix]) grouped[entry.prefix] = [];
      grouped[entry.prefix].push({
        name: entry.name,
        account: entry.account,
        status: entry.status
      });
    }
    bankAccounts = grouped;
  } catch (err) {
    console.error("❌ โหลดบัญชีธนาคารล้มเหลว:", err.message);
    bankAccounts = {};
  }
}

// ให้เรียกใช้ตัวแปร global
export function getBankAccounts() {
  return bankAccounts;
}

app.get("/api/bank-accounts", (req, res) => {
  try {
    res.json({ accounts: bankAccounts });
  } catch (err) {
    console.error("❌ โหลดบัญชีล้มเหลว:", err.message);
    res.status(500).json({ error: "โหลดบัญชีไม่สำเร็จ" });
  }
});

app.post("/api/add-bank", async (req, res) => {
  const { prefix, name, number } = req.body;

  if (!prefix || !name || !number) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบ" });
  }

  try {
    await BankAccount.create({
      prefix,
      name,
      account: number,
      status: false
    });

    await loadBankAccounts(); // Reload global variable
    res.json({ success: true });
  } catch (err) {
    console.error("❌ ไม่สามารถเพิ่มบัญชี:", err.message);
    res.status(500).json({ success: false, message: "ไม่สามารถบันทึกข้อมูล" });
  }
});

app.post("/api/edit-bank", async (req, res) => {
  const { prefix, index, name, number } = req.body;

  if (
    typeof prefix !== "string" ||
    typeof index !== "number" ||
    typeof name !== "string" ||
    typeof number !== "string"
  ) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบหรือไม่ถูกต้อง" });
  }

  try {
    const accounts = await BankAccount.find({ prefix });
    if (!accounts[index]) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชีธนาคารที่ต้องการแก้ไข" });
    }

    accounts[index].name = name;
    accounts[index].account = number;
    await accounts[index].save();
    restartWebhooks(); // รีโหลด Webhook ใหม่
    res.json({ success: true });
  } catch (err) {
    console.error("❌ แก้ไขบัญชีล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึก" });
  }
});

app.post("/api/update-bank-status", async (req, res) => {
  const { prefix, index, status } = req.body;

  try {
    const accounts = await BankAccount.find({ prefix });
    if (!accounts[index]) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชีธนาคาร" });
    }

    accounts[index].status = status;
    await accounts[index].save(); // สำคัญมาก ต้อง save หลังเปลี่ยนค่า

    await loadBankAccounts();     // รีโหลด global variable ให้บอทเห็นค่าที่เปลี่ยน
    await setupWebhooks();        // รีโหลด webhook
    res.json({ success: true });
  } catch (err) {
    console.error("❌ ไม่สามารถอัปเดตสถานะบัญชีได้:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post("/api/delete-bank", async (req, res) => {
  const { prefix, index } = req.body;

  if (typeof prefix !== "string" || typeof index !== "number") {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง" });
  }

  try {
    const accounts = await BankAccount.find({ prefix });
    if (!accounts[index]) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชีธนาคารในตำแหน่งนี้" });
    }

    const accountToDelete = accounts[index];
    await BankAccount.deleteOne({ _id: accountToDelete._id });

    res.json({ success: true, message: "ลบบัญชีสำเร็จ" });
  } catch (err) {
    console.error("❌ ลบบัญชีล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบบัญชี" });
  }
});


// POST: รับ slip ใหม่ + บันทึก MongoDB + broadcast
app.post("/api/slip-results", async (req, res) => {
  try {
    const now = moment().tz('Asia/Bangkok').toDate();

    const newSlip = {
      shop: req.body.shop,
      lineName: req.body.lineName,
      phoneNumber: req.body.phoneNumber,
      userId: req.body.userId,
      text: req.body.text,
      status: req.body.status,
      response: req.body.response,
      prefix: req.body.prefix,
      amount: req.body.amount,
      ref: req.body.ref,
      reply: req.body.reply,
      time: req.body.time,
      createdAt: now,
    };
    
    await SlipResult.create(newSlip);

    // ส่งผ่าน SSE
    const data = `data: ${JSON.stringify(newSlip)}\n\n`;
    clients.forEach(client => client.write(data));

    res.status(201).json({ message: "บันทึกแล้ว" });
  } catch (err) {
    console.error("❌ บันทึก SlipResult ล้มเหลว:", err.message);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

// GET: ดึง slip ภายใน 24 ชม. แบบแบ่งหน้า (ล่าสุดก่อน) — ?skip=0&limit=200
app.get("/api/slip-results", async (req, res) => {
  try {
    const skip = Math.max(0, parseInt(req.query.skip) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const results = await SlipResult.find({ createdAt: { $gte: oneDayAgo } })
      .sort({ createdAt: -1 })   // ล่าสุดก่อน
      .skip(skip)
      .limit(limit);

    res.json(results);
  } catch (err) {
    console.error("❌ โหลด slip results ล้มเหลว:", err.message);
    res.status(500).json({ message: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

export async function loadShopData() {
  try {
    shopData = await Shop.find().lean(); // ดึงจาก MongoDB แล้วเก็บในตัวแปร global
    console.log(`✅ โหลดร้านค้าสำเร็จ ${shopData.length} ร้าน`);
  } catch (error) {
    console.error("❌ ไม่สามารถโหลดร้านค้าจาก MongoDB:", error?.stack || error);
    shopData = [];
  }
}

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect("/login");
}

// Route: หน้า login
app.get("/login", (req, res) => {
  if (req.session?.user) return res.redirect("/"); // 👈 เปลี่ยนเป็น /
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const { owner, admins, users } = await loadCredentialsFromDB();

  let role = null;

  // ✅ ตรวจสอบสิทธิ์
  if (owner.username === username && owner.password === password) {
    role = "OWNER";
  } else if (admins.some(a => a.username === username && a.password === password)) {
    role = "ADMIN";
  } else if (users.some(m => m.username === username && m.password === password)) {
    role = "USER";
  }

  if (role) {
    // ✅ เก็บข้อมูล session เฉพาะที่จำเป็น
    req.session.user = {
      username,
      role,
      loginAt: Date.now()
    };

    console.log(`✅ Login สำเร็จ: ${username} (${role}) → sessionID: ${req.sessionID}`);
    return res.redirect("/");
  }

  return res.redirect("/login?error=1");
});

// Route: logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// เข้าหน้าหลัก index ต้อง login
app.get("/", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});


// อ่านตัวกรองร้านที่ผู้ใช้คนนี้เลือกไว้ (array = เฉพาะร้านนั้น, null = แสดงทุกร้าน)
async function getUserDisplayedShops(role, username) {
  try {
    const data = await Credentials.findOne();
    const arr = Array.isArray(data?.[role]) ? data[role] : [];
    const user = arr.find(u => u.username === username);
    return Array.isArray(user?.displayedShops) ? user.displayedShops : null;
  } catch {
    return null;
  }
}

// ข้อมูลผู้ใช้ที่ล็อกอินอยู่ + สิทธิ์ + ตัวกรองร้านของผู้ใช้คนนี้
app.get("/api/me", isAuthenticated, async (req, res) => {
  const { username, role } = req.session.user;
  const permissions = await getUserPermissions(role, username);
  const displayedShops = await getUserDisplayedShops(role, username);
  res.json({ username, role, permissions, displayedShops });
});

// บันทึกตัวกรองร้านต่อผู้ใช้ — { prefixes: [...] } = เฉพาะร้านนั้น, { prefixes: null } = แสดงทุกร้าน
app.post("/api/my-shop-filter", isAuthenticated, async (req, res) => {
  const { username, role } = req.session.user;
  const { prefixes } = req.body || {};
  try {
    if (Array.isArray(prefixes)) {
      await Credentials.updateOne(
        {},
        { $set: { [`${role}.$[u].displayedShops`]: prefixes.map(String) } },
        { arrayFilters: [{ "u.username": username }] }
      );
    } else {
      await Credentials.updateOne(
        {},
        { $unset: { [`${role}.$[u].displayedShops`]: "" } },
        { arrayFilters: [{ "u.username": username }] }
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("❌ บันทึกตัวกรองร้านล้มเหลว:", err.message);
    res.status(500).json({ success: false });
  }
});

// สำหรับโหลดเนื้อหาย่อย เช่น main.html ฯลฯ
app.get("/page/:name", isAuthenticated, async (req, res) => {
  const name = req.params.name;
  const { username, role } = req.session.user;

  // หน้าผู้จัดการ (จัดการสิทธิ์ / จัดการ prefix) — OWNER หรือ ADMIN ที่ได้รับสิทธิ์
  if (name === "permissions" || name === "prefixes") {
    if (!(await userCanManage(req.session.user, name))) {
      return res.status(403).send("คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
    }
    return res.sendFile(path.join(__dirname, "views", `${name}.html`));
  }

  const allowed = ["main", "dashboard", "settings", "logs", "send-message"];
  if (!allowed.includes(name)) {
    return res.status(404).send("ไม่พบหน้านี้");
  }

  // บังคับสิทธิ์ sidebar (OWNER ผ่านเสมอ)
  if (role !== "OWNER") {
    const perms = await getUserPermissions(role, username);
    if (!perms.sidebar.includes(name)) {
      return res.status(403).send("คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
    }
  }

  res.sendFile(path.join(__dirname, "views", `${name}.html`));
});

// ===== สิทธิ์ผู้จัดการ (OWNER หรือ ADMIN ที่ได้รับมอบ) =====
// page = "permissions" หรือ "prefixes"
async function userCanManage(sessionUser, page) {
  if (!sessionUser) return false;
  if (sessionUser.role === "OWNER") return true;
  if (sessionUser.role === "ADMIN") {
    const perms = await getUserPermissions("ADMIN", sessionUser.username);
    return perms.adminPages.includes(page);
  }
  return false;
}

function requireManage(page) {
  return async (req, res, next) => {
    const u = req.session?.user;
    if (!u) return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบ" });
    if (await userCanManage(u, page)) return next();
    return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
  };
}

// จัดการได้เฉพาะ role ที่ต่ำกว่า — OWNER จัดการ ADMIN+USER, ADMIN จัดการได้แค่ USER
function canManageTargetRole(sessionUser, targetRole) {
  if (sessionUser?.role === "OWNER") return ["ADMIN", "USER"].includes(targetRole);
  if (sessionUser?.role === "ADMIN") return targetRole === "USER";
  return false;
}

// รายการสิทธิ์ทั้งหมดในระบบ + รายชื่อผู้ใช้ (ADMIN/USER) พร้อมสิทธิ์ปัจจุบัน
app.get("/api/permissions/users", isAuthenticated, requireManage("permissions"), async (req, res) => {
  try {
    // อ่านจาก raw collection ตรงๆ เลี่ยงปัญหา Mongoose schema cache / field ที่ไม่อยู่ใน schema
    const data = await Credentials.collection.findOne({}) || {};

    // รองรับ field ชื่อเก่า (USERS/MARKETING) เผื่อยังไม่ได้ migrate
    const roleArr = (role) => {
      if (role === "USER") return data.USER || data.USERS || data.MARKETING || [];
      return data[role] || [];
    };

    const buildList = (role) =>
      (Array.isArray(roleArr(role)) ? roleArr(role) : []).map(u => ({
        username: u.username,
        role,
        sidebar: Array.isArray(u.permissions?.sidebar) ? u.permissions.sidebar : [],
        shopButtons: Array.isArray(u.permissions?.shopButtons) ? u.permissions.shopButtons : [],
        setbotFunctions: Array.isArray(u.permissions?.setbotFunctions) ? u.permissions.setbotFunctions : [],
        adminPages: Array.isArray(u.permissions?.adminPages) ? u.permissions.adminPages : [],
      }));

    res.json({
      pages: ALL_PAGES.map(k => ({ key: k, label: PAGE_LABELS[k] })),
      shopButtons: ALL_SHOP_BUTTONS.map(k => ({ key: k, label: SHOP_BUTTON_LABELS[k] })),
      setbotFuncs: ALL_SETBOT_FUNCS.map(k => ({ key: k, label: SETBOT_FUNC_LABELS[k] })),
      adminPages: ALL_ADMIN_PAGES.map(k => ({ key: k, label: ADMIN_PAGE_LABELS[k] })),
      isOwner: req.session.user.role === "OWNER", // เฉพาะ OWNER จึงแก้สิทธิ์ผู้จัดการได้
      // OWNER เห็น ADMIN+USER, ADMIN เห็นเฉพาะ USER
      users: req.session.user.role === "OWNER"
        ? [...buildList("ADMIN"), ...buildList("USER")]
        : [...buildList("USER")],
    });
  } catch (err) {
    console.error("❌ โหลดรายการสิทธิ์ล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// บันทึกสิทธิ์ของผู้ใช้คนหนึ่ง
app.post("/api/permissions/update", isAuthenticated, requireManage("permissions"), async (req, res) => {
  const { role, username, sidebar, shopButtons, setbotFunctions, adminPages } = req.body || {};
  if (!["ADMIN", "USER"].includes(role) || !username) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ถูกต้อง" });
  }
  if (!canManageTargetRole(req.session.user, role)) {
    return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์จัดการบัญชีระดับนี้" });
  }
  try {
    const validSidebar = (Array.isArray(sidebar) ? sidebar : []).filter(k => ALL_PAGES.includes(k));
    // ปุ่มในหน้าหลักจะเก็บได้เฉพาะเมื่อมีสิทธิ์เมนูหน้าหลัก (main) เท่านั้น
    const validButtons = validSidebar.includes("main")
      ? (Array.isArray(shopButtons) ? shopButtons : []).filter(k => ALL_SHOP_BUTTONS.includes(k))
      : [];
    // ฟังก์ชันย่อยจะเก็บเฉพาะเมื่อมีสิทธิ์ปุ่ม setbot เท่านั้น
    const validSetbot = validButtons.includes("setbot")
      ? (Array.isArray(setbotFunctions) ? setbotFunctions : []).filter(k => ALL_SETBOT_FUNCS.includes(k))
      : [];

    const set = {
      [`${role}.$[u].permissions.sidebar`]: validSidebar,
      [`${role}.$[u].permissions.shopButtons`]: validButtons,
      [`${role}.$[u].permissions.setbotFunctions`]: validSetbot,
    };

    // สิทธิ์ผู้จัดการ — เฉพาะ OWNER เท่านั้นที่มอบได้ และมอบให้ ADMIN เท่านั้น (กันการยกระดับสิทธิ์ตัวเอง)
    if (req.session.user.role === "OWNER") {
      set[`${role}.$[u].permissions.adminPages`] = (role === "ADMIN")
        ? (Array.isArray(adminPages) ? adminPages : []).filter(k => ALL_ADMIN_PAGES.includes(k))
        : [];
    }

    const result = await Credentials.updateOne(
      {},
      { $set: set },
      { arrayFilters: [{ "u.username": username }] }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้นี้" });
    }
    res.json({ success: true, message: "บันทึกสิทธิ์เรียบร้อย" });
  } catch (err) {
    console.error("❌ บันทึกสิทธิ์ล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// ตรวจชื่อผู้ใช้ซ้ำในทุก role
function usernameExists(data, username) {
  return ["OWNER", "ADMIN", "USER"].some(r =>
    (Array.isArray(data?.[r]) ? data[r] : []).some(u => u.username === username)
  );
}

// สร้างบัญชีผู้ใช้ใหม่
app.post("/api/permissions/create-user", isAuthenticated, requireManage("permissions"), async (req, res) => {
  const role = req.body?.role;
  const username = req.body?.username?.trim();
  const password = req.body?.password?.trim();
  if (!["ADMIN", "USER"].includes(role) || !username || !password) {
    return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
  }
  if (!canManageTargetRole(req.session.user, role)) {
    return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์สร้างบัญชีระดับนี้" });
  }
  try {
    const data = await Credentials.findOne();
    if (usernameExists(data, username)) {
      return res.status(409).json({ success: false, message: "มีชื่อผู้ใช้นี้อยู่แล้ว" });
    }
    await Credentials.updateOne({}, {
      $push: { [role]: { username, password, permissions: { sidebar: [], shopButtons: [] } } }
    });
    res.json({ success: true, message: "สร้างบัญชีเรียบร้อย" });
  } catch (err) {
    console.error("❌ สร้างบัญชีล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// แก้ไขบัญชี (ชื่อผู้ใช้ / รหัสผ่าน)
app.post("/api/permissions/edit-user", isAuthenticated, requireManage("permissions"), async (req, res) => {
  const role = req.body?.role;
  const oldUsername = req.body?.oldUsername;
  const username = req.body?.username?.trim();
  const password = req.body?.password?.trim();
  if (!["ADMIN", "USER"].includes(role) || !oldUsername || !username) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ถูกต้อง" });
  }
  if (!canManageTargetRole(req.session.user, role)) {
    return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์จัดการบัญชีระดับนี้" });
  }
  try {
    const data = await Credentials.findOne();
    if (username !== oldUsername && usernameExists(data, username)) {
      return res.status(409).json({ success: false, message: "มีชื่อผู้ใช้นี้อยู่แล้ว" });
    }
    const set = { [`${role}.$[u].username`]: username };
    if (password) set[`${role}.$[u].password`] = password;

    const result = await Credentials.updateOne(
      {}, { $set: set }, { arrayFilters: [{ "u.username": oldUsername }] }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้นี้" });
    }
    res.json({ success: true, message: "แก้ไขเรียบร้อย" });
  } catch (err) {
    console.error("❌ แก้ไขบัญชีล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// ลบบัญชี
app.post("/api/permissions/delete-user", isAuthenticated, requireManage("permissions"), async (req, res) => {
  const role = req.body?.role;
  const username = req.body?.username;
  if (!["ADMIN", "USER"].includes(role) || !username) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ถูกต้อง" });
  }
  if (!canManageTargetRole(req.session.user, role)) {
    return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์ลบบัญชีระดับนี้" });
  }
  try {
    const result = await Credentials.updateOne({}, { $pull: { [role]: { username } } });
    if (!result.modifiedCount) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้นี้" });
    }
    res.json({ success: true, message: "ลบบัญชีเรียบร้อย" });
  } catch (err) {
    console.error("❌ ลบบัญชีล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// ===== จัดการ Prefix (OWNER หรือ ADMIN ที่ได้รับสิทธิ์) =====
// collection prefixes เก็บเป็น 1 document field `prefix` เป็น array — ใช้ raw collection
app.get("/api/prefixes", isAuthenticated, requireManage("prefixes"), async (req, res) => {
  try {
    const doc = await PrefixForshop.collection.findOne({});
    const list = Array.isArray(doc?.prefix) ? doc.prefix : [];
    res.json({ prefixes: list });
  } catch (err) {
    console.error("❌ โหลด prefixes ล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post("/api/add-prefix", isAuthenticated, requireManage("prefixes"), async (req, res) => {
  const prefix = req.body?.prefix?.trim().toUpperCase();
  if (!prefix) return res.status(400).json({ success: false, message: "กรุณากรอก prefix" });
  try {
    const doc = await PrefixForshop.collection.findOne({});
    const list = Array.isArray(doc?.prefix) ? doc.prefix : [];
    if (list.includes(prefix)) {
      return res.status(409).json({ success: false, message: "มี prefix นี้อยู่แล้ว" });
    }
    if (doc) {
      await PrefixForshop.collection.updateOne({ _id: doc._id }, { $addToSet: { prefix } });
    } else {
      await PrefixForshop.collection.insertOne({ prefix: [prefix] });
    }
    res.json({ success: true, message: "เพิ่ม prefix เรียบร้อย" });
  } catch (err) {
    console.error("❌ เพิ่ม prefix ล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post("/api/delete-prefix", isAuthenticated, requireManage("prefixes"), async (req, res) => {
  const prefix = req.body?.prefix;
  if (!prefix) return res.status(400).json({ success: false, message: "ข้อมูลไม่ถูกต้อง" });
  try {
    // กันลบ prefix ที่ยังมีร้านใช้อยู่
    const usedByShop = await Shop.findOne({ prefix });
    if (usedByShop) {
      return res.status(400).json({ success: false, message: `ลบไม่ได้: มีร้าน "${usedByShop.name}" ใช้ prefix นี้อยู่` });
    }
    await PrefixForshop.collection.updateOne({}, { $pull: { prefix } });
    res.json({ success: true, message: "ลบ prefix เรียบร้อย" });
  } catch (err) {
    console.error("❌ ลบ prefix ล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// เปลี่ยนรหัสผ่านของตัวเอง (ทุก role ที่ล็อกอินอยู่)
app.post("/api/change-password", isAuthenticated, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const { username, role } = req.session.user;

  if (!currentPassword || !newPassword?.trim()) {
    return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
  }
  try {
    const data = await Credentials.findOne();
    const arr = Array.isArray(data?.[role]) ? data[role] : [];
    const user = arr.find(u => u.username === username);
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบบัญชีผู้ใช้" });
    if (user.password !== currentPassword) {
      return res.status(403).json({ success: false, message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    }

    await Credentials.updateOne(
      {},
      { $set: { [`${role}.$[u].password`]: newPassword.trim() } },
      { arrayFilters: [{ "u.username": username }] }
    );
    res.json({ success: true, message: "เปลี่ยนรหัสผ่านเรียบร้อย" });
  } catch (err) {
    console.error("❌ เปลี่ยนรหัสผ่านล้มเหลว:", err.message);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post('/api/save-phone', async (req, res) => {
  const { phoneNumber, userId, prefix } = req.body;

  if (!phoneNumber || !userId || !prefix) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบ' });
  }

  try {
    await checkAndSavePhoneNumber(phoneNumber, userId, prefix);
    await checkAndUpdatePhoneNumber(phoneNumber, userId, prefix);
    res.json({ message: 'บันทึกเบอร์โทรสำเร็จ' });
  } catch (err) {
    console.error('❌ บันทึกเบอร์โทรจาก Admin ล้มเหลว:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

app.get("/api/env", (req, res) => {
  res.json({ URL: process.env.URL });
});


// 4) Endpoint สำหรับส่งข้อมูลร้านค้า
app.get("/api/shops", async (req, res) => {
  try {
    const shops = await Shop.find({}, { bonusImage: 0, passwordImage: 0 });
    res.json({ shops });
  } catch (error) {
    console.error("❌ ไม่สามารถโหลดข้อมูลร้านค้าจาก MongoDB:", error.message);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลร้านค้าได้" });
  }
});

app.post("/api/add-shop", async (req, res) => {
    const { name, prefix } = req.body;
  
    if (!name || !prefix) {
      return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }  

    try {
      // ตรวจสอบว่ามี prefix ซ้ำหรือไม่
      const existingShop = await Shop.findOne({ prefix });
      if (existingShop) {
        return res.status(400).json({ success: false, message: "Prefix นี้ถูกใช้ไปแล้ว" });
      }
  
      const existingStat = await PrefixForshop.findOne({ Prefix: prefix });

      if (!existingStat) {
        return res.status(400).json({
          success: false,
          message: `ไม่สามารถเพิ่มร้านได้: prefix '${prefix}' ไม่อยู่ในระบบ`
        });
      }
  
      // บันทึกร้านค้าใหม่ลง MongoDB
      const newShop = new Shop({
        name,
        prefix,
        lines: [],
        status: false,
        slipCheckOption: "duplicate",
        statusBot: false,
        statusWithdraw: false,
        statusBonusTime: false,
        statusPassword: false,
      });
      await newShop.save();
  
      restartWebhooks(); // รีโหลด Webhook ใหม่
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding shop:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเพิ่มร้านค้า" });
    }
  });

// API สำหรับแก้ไขบัญชี LINE
app.post("/api/update-line", async (req, res) => {
  const { prefix, index, linename, access_token, secret_token, channel_id } = req.body;

  if (!prefix || index === undefined || !linename || !access_token || !secret_token || !channel_id) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
  }

  const shortChannelId = String(channel_id).slice(-4); // ใช้ 4 ตัวท้าย

  try {
    const shop = await Shop.findOne({ prefix });
    if (!shop) {
      return res.status(404).json({ success: false, message: "ไม่พบร้านค้านี้" });
    }

    if (!shop.lines || !shop.lines[index]) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชี LINE ที่ต้องการแก้ไข" });
    }

    // ตรวจสอบว่า shortChannelId นี้ซ้ำกับบัญชีอื่น (ยกเว้น index เดิม)
    const isDuplicate = shop.lines.some((line, i) => {
      const lineShortId = String(line.channel_id).slice(-4);
      return i !== index && lineShortId === shortChannelId;
    });

    if (isDuplicate) {
      return res.status(409).json({ success: false, message: "บัญชี LINE นี้มีอยู่แล้ว (Channel ID ซ้ำ)" });
    }

    // อัปเดตเฉพาะรายการนี้
    shop.lines[index] = {
      linename,
      access_token,
      secret_token,
      channel_id
    };

    await shop.save();
    return res.json({ success: true, message: "อัปเดตบัญชี LINE สำเร็จ!" });
  } catch (error) {
    console.error("❌ Error updating LINE account:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตบัญชี LINE" });
  }
});

// API อัปเดตชื่อร้าน และสถานะร้านค้า
app.post("/api/update-shop", async (req, res) => {
  const { prefix, name, status } = req.body;

  if (!prefix) {
    return res.status(400).json({ success: false, message: "กรุณาระบุ prefix ของร้านค้า" });
  }

  try {
    const shop = await Shop.findOne({ prefix });

    if (!shop) {
      return res.status(404).json({ success: false, message: "ไม่พบร้านค้านี้" });
    }

    if (name) shop.name = name;
    if (typeof status === "boolean") shop.status = status;

    await shop.save();
    restartWebhooks();

    res.json({ success: true, message: "อัปเดตร้านค้าเรียบร้อย" });
  } catch (error) {
    console.error("❌ Error updating shop:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตร้านค้า" });
  }
});


// เพิ่ม API สำหรับลบบัญชี LINE
app.post("/api/delete-line", async (req, res) => {
  const { prefix, index } = req.body;

  if (!prefix || index === undefined) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
  }

  try {
    const shop = await Shop.findOne({ prefix });
    if (!shop) {
      return res.status(404).json({ success: false, message: "ไม่พบร้านค้านี้" });
    }

    if (!shop.lines || shop.lines.length <= index) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชี LINE ที่ต้องการลบ" });
    }

    shop.lines.splice(index, 1);
    await shop.save();

    res.json({ success: true, message: "ลบบัญชี LINE สำเร็จ!" });
  } catch (error) {
    console.error("❌ Error deleting LINE account:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบบัญชี LINE" });
  }
});

// API สำหรับเพิ่มบัญชี LINE ใหม่เข้าไปในร้านค้า
app.post("/api/add-line", async (req, res) => {
  const { prefix, linename, access_token, secret_token, channel_id } = req.body;

  if (!prefix || !linename || !access_token || !secret_token || !channel_id) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน!" });
  }

  try {
    const shop = await Shop.findOne({ prefix });
    if (!shop) {
      return res.status(404).json({ success: false, message: "ไม่พบร้านค้านี้!" });
    }

    const isDuplicate = shop.lines.some(line => line.channel_id === channel_id);
    if (isDuplicate) {
      return res.status(409).json({ success: false, message: "บัญชี LINE นี้ถูกเพิ่มไว้แล้ว" });
    }

    shop.lines.push({
      linename,
      access_token,
      secret_token,
      channel_id    // เพิ่มตรงนี้
    });

    await shop.save();

    restartWebhooks();
    res.json({ success: true, message: "เพิ่มบัญชี LINE สำเร็จ!" });
  } catch (error) {
    console.error("❌ Error adding LINE account:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเพิ่มบัญชี LINE" });
  }
});

app.post("/api/upload-bonus-image", upload.single("image"), async (req, res) => {
  try {
    const { prefix } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "ไม่พบไฟล์ภาพที่อัปโหลด" });
    }

    const shop = await Shop.findOne({ prefix });
    if (!shop) return res.status(404).json({ success: false, message: "ไม่พบร้านค้า" });

    // ตรวจว่า slot ไหนว่าง
    const hasImage1 = shop.bonusImage?.image1?.data;
    const hasImage2 = shop.bonusImage?.image2?.data;

    if (hasImage1 && hasImage2) {
      return res.status(400).json({ success: false, message: "มีรูป BonusTime ครบ 2 รูปแล้ว กรุณาเปลี่ยนหรือลบก่อน" });
    }

    const slot = hasImage1 ? "image2" : "image1";

    const imageBuffer = await sharp(req.file.buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg()
      .toBuffer();

    await Shop.findOneAndUpdate(
      { prefix },
      { [`bonusImage.${slot}`]: { data: imageBuffer, contentType: "image/jpeg" } },
      { new: true, upsert: true }
    );

    res.json({ success: true, message: `บันทึก ${slot} เรียบร้อย`, slot });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/upload-change-bonus-image", upload.single("image"), async (req, res) => {
  try {
    const { prefix, index } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "ไม่พบไฟล์ภาพที่อัปโหลด" });
    }

    const slot = index === "2" ? "image2" : "image1";

    const imageBuffer = await sharp(req.file.buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg()
      .toBuffer();

    await Shop.findOneAndUpdate(
      { prefix },
      { [`bonusImage.${slot}`]: { data: imageBuffer, contentType: "image/jpeg" } },
      { new: true, upsert: true }
    );

    res.json({ success: true, message: `เปลี่ยน ${slot} เรียบร้อย`, slot });
  } catch (err) {
    console.error("❌ Upload Change Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/api/get-bonus-image-original', async (req, res) => {
  const { prefix, index } = req.query;
  const slot = index === "2" ? "image2" : "image1";

  const shop = await Shop.findOne({ prefix });
  if (!shop || !shop.bonusImage?.[slot]?.data) return res.sendStatus(404);

  res.set('Content-Type', shop.bonusImage[slot].contentType || 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(shop.bonusImage[slot].data);
});

// เสิร์ฟรูป BonusTime (optimized)
app.get("/api/get-bonus-image", async (req, res) => {
  const { prefix, index } = req.query;
  const slot = index === "2" ? "image2" : "image1";

  const shop = await Shop.findOne({ prefix });

  if (!shop || !shop.bonusImage?.[slot]?.data) {
    return res.status(404).json({ success: false, message: "ยังไม่ได้อัปโหลดรูป BonusTime" });
  }

  try {
    const optimized = await sharp(shop.bonusImage[slot].data)
      .resize(600)
      .jpeg({ quality: 70 })
      .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.send(optimized);
  } catch (err) {
    console.error("❌ Sharp Error:", err);
    res.status(500).send("Server error");
  }
});

app.post("/api/update-bonusTime-status", async (req, res) => {
  const { prefix, statusBonusTime } = req.body;

  try {
    const shop = await Shop.findOneAndUpdate(
      { prefix },
      { statusBonusTime },
      { new: true }
    );

    if (!shop) return res.json({ success: false, message: "ไม่พบร้านค้า" });

    res.json({ success: true, message: "อัปเดตสถานะ BonusTime เรียบร้อย" });
  } catch (err) {
    console.error("❌ Error updating BonusTime status:", err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post("/api/delete-bonus-image", async (req, res) => {
  try {
    const { prefix, index } = req.body;
    const shop = await Shop.findOne({ prefix });
    if (!shop) return res.status(404).json({ success: false, message: "ไม่พบร้านค้า" });

    if (index === "1" || index === "2") {
      // ลบเฉพาะ slot
      const slot = index === "2" ? "image2" : "image1";
      await Shop.findOneAndUpdate({ prefix }, { $unset: { [`bonusImage.${slot}`]: "" } });
      res.json({ success: true, message: `ลบ ${slot} สำเร็จ` });
    } else {
      // ลบทั้งหมด
      shop.bonusImage = undefined;
      await shop.save();
      res.json({ success: true, message: "ลบรูป BonusTime ทั้งหมดสำเร็จ" });
    }
  } catch (err) {
    console.error("❌ Error deleting bonus image:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/api/get-password-image-original', async (req, res) => {
  const { prefix } = req.query;

  const shop = await Shop.findOne({ prefix });
  if (!shop || !shop.passwordImage) return res.sendStatus(404);

  const imageBuffer = shop.passwordImage.data;
  const contentType = shop.passwordImage.contentType || 'image/png';

  res.set('Content-Type', contentType);
  res.set('Cache-Control', 'no-store'); // 🔒 ป้องกัน cache
  res.send(imageBuffer); // ต้องส่ง raw buffer ตรง ๆ
});



app.post("/api/upload-password-image", upload.single("image"), async (req, res) => {
  try {
    const { prefix } = req.body;

    let imageBuffer = req.file.buffer;

    // แปลงเป็น JPEG เสมอ
    imageBuffer = await sharp(imageBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg()
      .toBuffer();

    await Shop.findOneAndUpdate(
      { prefix },
      {
        passwordImage: {
          data: imageBuffer,
          contentType: "image/jpeg",
        },
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, message: "บันทึกภาพ ลืม Password เรียบร้อย" });
  } catch (error) {
    console.error("❌ upload error:", error);
    res.status(500).json({ error: "ไม่สามารถอัปโหลดรูปได้" });
  }
});

// เสิร์ฟรูป password จริง
app.get("/api/get-password-image", async (req, res) => {
  const { prefix } = req.query;
  const shop = await Shop.findOne({ prefix });

  if (!shop || !shop.passwordImage?.data) {
    return res.status(404).json({ success: false, message: "ยังไม่ได้อัปโหลดรูป ลืม Password" });
  }

  try {
    const optimized = await sharp(shop.passwordImage.data)
      .resize(600) // จำกัดความกว้าง
      .jpeg({ quality: 70 }) // ลดคุณภาพลง
      .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.send(optimized);
  } catch (err) {
    console.error("❌ Sharp Error:", err);
    res.status(500).send("Server error");
  }
});

app.post("/api/update-password-status", async (req, res) => {
  const { prefix, statusPassword } = req.body;

  try {
    const shop = await Shop.findOneAndUpdate(
      { prefix },
      { statusPassword },
      { new: true }
    );

    if (!shop) return res.json({ success: false, message: "ไม่พบร้านค้า" });

    res.json({ success: true, message: "อัปเดตสถานะ Password เรียบร้อย" });
  } catch (err) {
    console.error("❌ Error updating Password status:", err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post("/api/delete-password-image", async (req, res) => {
  try {
    const { prefix } = req.body;
    const shop = await Shop.findOne({ prefix });
    if (!shop) return res.status(404).json({ success: false, message: "ไม่พบร้านค้า" });

    shop.passwordImage = undefined; // ลบค่าออก
    await shop.save();

    res.json({ success: true, message: "ลบรูป Password สำเร็จ" });
  } catch (err) {
    console.error("❌ Error deleting password image:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/update-textbot-status', async (req, res) => {
  const { prefix, statusBot } = req.body;

  try {
    const shop = await Shop.findOneAndUpdate(
      { prefix },
      { statusBot },
      { new: true }
    );

    if (!shop) {
      return res.json({ success: false, message: "ไม่พบร้านค้า" });
    }

    res.json({ success: true, message: "อัปเดตสถานะบอทข้อความเรียบร้อย" });
  } catch (err) {
    console.error("❌ Error updating text bot status:", err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post('/api/update-withdraw-status', async (req, res) => {
  const { prefix, statusWithdraw } = req.body;

  try {
    const shop = await Shop.findOneAndUpdate(
      { prefix },
      { statusWithdraw },
      { new: true }
    );

    if (!shop) {
      return res.json({ success: false, message: "ไม่พบร้านค้า" });
    }

    res.json({ success: true, message: "อัปเดตสถานะ ปิด/เปิด การถอน เรียบร้อย" });
  } catch (err) {
    console.error("❌ Error updating withdraw status:", err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post("/api/update-slip-option", async (req, res) => {
  const { prefix, slipCheckOption } = req.body;

  if (!prefix || !slipCheckOption) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
  }
  try {
    const shop = await Shop.findOne({ prefix });
    if (!shop) {
      return res.status(404).json({ success: false, message: "ไม่พบร้านค้านี้" });
    }

    shop.status = false;
    shop.slipCheckOption = slipCheckOption;
    await shop.save();

    res.json({ success: true, message: "บันทึกการเปลี่ยนแปลงสำเร็จ" });
  } catch (error) {
    console.error("❌ Error updating slip check option:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตตัวเลือกตรวจสลิป" });
  }
});


app.get('/api/settings', async (req, res) => {
  try {
    const settings = await loadSettings(); // 👉 โหลดจาก MongoDB
    if (!settings) throw new Error("ไม่พบ settings");

    // แปลงหน่วยสำหรับ frontend: timeLimit + sameQrTimeLimit ms→นาที
    res.json({
      ...settings,
      timeLimit: settings.timeLimit / 60000,
      sameQrTimeLimit: settings.sameQrTimeLimit / 60000
    });
  } catch (err) {
    console.error("❌ โหลด settings ไม่สำเร็จ:", err.message);
    res.status(500).json({ error: "โหลด settings ไม่สำเร็จ" });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    await saveSettings(req.body); // 👉 บันทึกลง MongoDB
    await reloadSettings(); // 👉 โหลดใหม่เข้าตัวแปร global
    restartWebhooks();     // 👉 ถ้าจำเป็นต้องใช้ settings กับ webhook
    res.json({ success: true });
  } catch (err) {
    console.error("❌ บันทึก settings ไม่สำเร็จ:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint สำหรับลบร้านค้า
app.post("/api/delete-shop", async (req, res) => {
  const { prefix } = req.body;

  try {
    const result = await Shop.deleteOne({ prefix });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบร้านค้าด้วย prefix นี้" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error deleting shop:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบร้านค้า" });
  }
});

app.post("/api/get-access-token", async (req, res) => {
  const { channelId, secretToken } = req.body;

  if (!channelId || !secretToken) {
    return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
  }

  try {
    // 1. ขอ access_token
    const tokenRes = await fetch("https://api.line.me/v2/oauth/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: channelId,
        client_secret: secretToken,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ success: false, message: "ขอ access_token ไม่สำเร็จ" });
    }

    const access_token = tokenData.access_token;

    // 2. ดึงชื่อ LINE OA จาก /v2/bot/info
    const infoRes = await fetch("https://api.line.me/v2/bot/info", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const infoData = await infoRes.json();

    const display_name = infoData.displayName || "LINE";

    // ส่งทั้ง access_token และ display_name กลับไป
    res.json({
      success: true,
      access_token,
      display_name,
    });
  } catch (error) {
    console.error("❌ Error in /api/get-access-token:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

app.post('/api/set-webhook', async (req, res) => {
  const { accessToken, webhookURL } = req.body;

  if (!accessToken || !webhookURL) {
    return res.status(400).json({ success: false, message: "ต้องระบุ accessToken และ webhookURL" });
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ endpoint: webhookURL })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ LINE API error:", result);
      return res.status(500).json({ success: false, message: "ตั้งค่า Webhook ไม่สำเร็จ", result });
    }

    return res.json({ success: true, result });

  } catch (err) {
    console.error("❌ set-webhook error:", err);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดขณะตั้งค่า Webhook", error: err.message });
  }
});

app.get('/api/uploaded-image', async (req, res) => {
  try {
    const { username, sessionId } = req.query;
    if (!username) return res.status(400).send('Missing params');

    const imageDoc = await UploadedImage.findOne({ username, sessionId });
    if (!imageDoc || !imageDoc.data) return res.status(404).send('Not found');

    res.set('Content-Type', imageDoc.contentType || 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(imageDoc.data);

  } catch (err) {
    console.error('❌ Error /uploaded-image:', err);
    res.status(500).send('Server error');
  }
});

app.delete("/api/delete-my-upload", async (req, res) => {
  const sessionId = req.sessionID;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: "Session ไม่พบ" });
  }

  try {
    const result = await UploadedImage.deleteMany({ sessionId });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("❌ ลบรูปภาพล้มเหลว:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/user-lookup-batch', async (req, res) => {
  const { usernames } = req.body;
  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.json({ results: [] });
  }

  try {
    const phones = await Phone.find({ user: { $in: usernames } });
    const userMap = new Map();
    phones.forEach(p => userMap.set(p.user, p.userId));

    // ค้นหา prefix ที่จำเป็นทั้งหมดครั้งเดียว
    const uniquePrefixes = [...new Set(usernames.map(u => u.substring(0, 3)))];
    const shops = await Shop.find({ prefix: { $in: uniquePrefixes } });
    const prefixMap = new Map();
    shops.forEach(shop => {
      prefixMap.set(shop.prefix, shop.lines?.[0]?.access_token || null);
    });

    const results = usernames.map(username => {
      const userId = userMap.get(username);
      const prefix = username.substring(0, 3);
      return {
        username,
        found: !!userId,
        userId,
        accessToken: prefixMap.get(prefix) || null,
      };
    });

    return res.json({ results });

  } catch (err) {
    console.error("❌ batch lookup error:", err);
    return res.status(500).json({ results: [] });
  }
});

app.post('/api/send-message', uploadsendimage.fields([{ name: 'image', maxCount: 1 }]), async (req, res) => {
    const { userId, message } = req.body;
    const sessionId = req.sessionID;
    const username = req.session?.user?.username;

    if (!userId)
        return res.status(400).json({ success: false, error: "Missing userId" });

    if (!username || !sessionId)
        return res.status(400).json({ success: false, error: "Missing session or username" });

    try {
        const phone = await Phone.findOne({ userId });
        if (!phone || !phone.prefix)
            return res.status(404).json({ success: false, error: "User not found in database" });

        const shop = await Shop.findOne({ prefix: phone.prefix });
        if (!shop || !shop.lines || shop.lines.length === 0)
            return res.status(404).json({ success: false, error: "No LINE OA found for shop" });

        // เตรียมรูปภาพ (ถ้ามีรูปใหม่เท่านั้น)
        let imageUrl = null;
        let uploadedImage = null;
        
        // เช็คเฉพาะกรณีมีรูปใหม่ส่งมาเท่านั้น
        if (req.files?.image?.[0]) {
            uploadedImage = await UploadedImage.create({
                username,
                sessionId,
                data: req.files.image[0].buffer,
                contentType: req.files.image[0].mimetype,
                uploadedAt: new Date()
            });
            
            const timestamp = Date.now();
            imageUrl = `${baseURL}/api/uploaded-image?username=${encodeURIComponent(username)}&sessionId=${encodeURIComponent(sessionId)}&cache_bust=${timestamp}`;
        }

        if (!imageUrl && !message) {
            return res.status(400).json({ success: false, error: "Missing message and image" });
        }

        // ส่งข้อความและรูปภาพ
        for (const lineInfo of shop.lines) {
            const client = new line.Client({ channelAccessToken: lineInfo.access_token });

            try {
                // ส่งรูปก่อน (ถ้ามี)
                let imageSent = false;

                if (imageUrl) {
                    try {
                        await client.pushMessage(userId, {
                            type: "image",
                            originalContentUrl: imageUrl,
                            previewImageUrl: imageUrl
                        });
                        
                        // รอให้ LINE ดึงรูปไปก่อน
                        await UploadedImage.deleteOne({ username, sessionId });
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        imageSent = true;
                    } catch (error) {
                        console.error('❌ ไม่สามารถส่งรูปภาพ:', error);
                    }
                }
                
                // ส่งข้อความ (ถ้ามี)
                if (message) {
                    await client.pushMessage(userId, { 
                        type: "text", 
                        text: message 
                    });
                }

                // หลังส่งเสร็จทั้งหมด ถ้าส่งรูปสำเร็จให้ลบรูปจากฐานข้อมูล
                if (imageSent) {
                    try {
                        await UploadedImage.deleteMany({ sessionId });
                    } catch (error) {
                        console.error('❌ เกิดข้อผิดพลาดในการลบรูปภาพจากฐานข้อมูล:', error);
                    }
                }

                broadcastLog(
                    `📨 ส่ง ${imageSent ? 'ภาพ' : ''}${imageSent && message ? ' + ' : ''}${message ? 'ข้อความ' : ''} จาก ${username} ไปยัง ${userId} ผ่านร้าน ${lineInfo.linename}`
                );

                return res.json({
                    success: true,
                    usedLine: lineInfo.linename,
                    shopName: shop.name,
                    type: imageSent && message ? "image+text" : (imageSent ? "image" : "text")
                });

            } catch (err) {
                console.error(`❌ ไม่สามารถส่งผ่าน ${lineInfo.linename}:`, err);
                console.error('Error details:', err.response?.data || err.message);
                
                // ส่ง log ให้ admin ทราบ
                broadcastLog(
                    `❌ ส่งไม่สำเร็จ: ${userId} (${err.message}) - ลองส่งผ่าน ${lineInfo.linename} ไม่ได้`
                );
            }
        }

        return res.status(500).json({
            success: false,
            error: "ไม่สามารถส่งข้อความหรือภาพผ่าน LINE OA ใด ๆ ได้"
        });

    } catch (err) {
        console.error("❌ send-message error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
});

app.post("/api/upload-send-image-line", uploadsendimage.single("image"), async (req, res) => {
  try {
    // ปฏิเสธทันทีหากไม่มีไฟล์
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "ไม่พบไฟล์ภาพที่ส่งมา หรือไฟล์ไม่ถูกต้อง" });
    }

    // อนุญาตเฉพาะ mimetype ที่ LINE รองรับ
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "รองรับเฉพาะไฟล์ภาพเท่านั้น" });
    }

    const username = req.session?.user?.username || "unknown";
    const sessionId = req.sessionID || "unknown";

    if (!sessionId || !username) {
      return res.status(400).json({ error: "ไม่มี session" });
    }

    const result = await UploadedImage.findOneAndUpdate(
    { username, sessionId },
    {
        $set: {
            data: req.file.buffer,
            contentType: req.file.mimetype,
            uploadedAt: new Date(),
        }
    },
    {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
    }
    );

    res.json({
      success: true,
      message: "✅ อัปโหลดรูปภาพสำเร็จ",
      fileId: result._id.toString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "เกิดข้อผิดพลาดระหว่างอัปโหลด" });
  }
});

// ฟังก์ชันสำหรับส่ง Logs ไปยัง Clients
export function broadcastLog(message) {
  const timestamp = new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok"
  });

  const logEntry = `[ ${timestamp} ] ${message}`;

  // เก็บ log ลงในประวัติ
  logHistory.push(logEntry);
  if (logHistory.length > MAX_LOGS) {
    logHistory.splice(0, logHistory.length - MAX_LOGS);
  }

  // ส่ง log ไปยัง clients แบบ real-time
  const data = `data: ${logEntry}\n\n`;
  logClients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      console.error("Error sending log to client:", error);
    }
  });
}

export function broadcastPhoneUpdate(userId, phoneNumber, lineName) {
  const phoneData = { userId, phoneNumber, lineName };
  const data = `event: phoneUpdate\ndata: ${JSON.stringify(phoneData)}\n\n`;

  let successCount = 0;

  clients.forEach((client, index) => {
    try {
      client.write(data);
      successCount++;
    } catch (error) {
      console.error(`❌ ส่งไม่สำเร็จกับ client[${index}]:`, error);
    }
  });
}

// webhook ใช้ route เดียวแบบ dynamic แล้ว (ดูด้านบน) — setupWebhooks เหลือแค่ refresh cache
const setupWebhooks = async () => {
  await loadShopData(); // refresh cache ร้านค้า (ไม่ต้อง register route อีกแล้ว)
};

// เรียกหลังแก้ข้อมูลร้าน/LINE/ธนาคาร — refresh cache เท่านั้น (route ไม่ต้องสร้างใหม่)
export const restartWebhooks = async () => {
  try {
    console.log("พบการแก้ไขข้อมูล รีโหลดข้อมูลแล้ว...");
    broadcastLog("พบการแก้ไขข้อมูล รีโหลดข้อมูลแล้ว...");
    await loadBankAccounts();
    await setupWebhooks();
  } catch (err) {
    console.error("❌ restartWebhooks ล้มเหลว:", err?.message || err);
    broadcastLog(`❌ restartWebhooks ล้มเหลว: ${err?.message || err}`);
  }
};

app.listen(PORT, async () => {
  console.log(`🟢 Server started at port ${PORT}`);
  broadcastLog(`🟢 Server started at port ${PORT}`);

  try {
    await connectDB();
    await migrateRoleToUser();
    await loadBankAccounts();
    await setupWebhooks();
    startSlip2goMonitor(); // เริ่มมอนิเตอร์โควต้า Slip2Go + แจ้งเตือน Telegram
    console.log("All services initialized");
  } catch (err) {
    console.error("Initialization failed:", err);
  }
});

// ย้ายข้อมูล role เดิม (MARKETING หรือ USERS) → USER (รันครั้งเดียว, idempotent)
async function migrateRoleToUser() {
  try {
    for (const oldName of ["MARKETING", "USERS"]) {
      const res = await Credentials.collection.updateMany(
        { [oldName]: { $exists: true }, USER: { $exists: false } },
        { $rename: { [oldName]: "USER" } }
      );
      if (res.modifiedCount) console.log(`ℹ️  ย้าย role ${oldName} → USER สำเร็จ (${res.modifiedCount} เอกสาร)`);
    }
  } catch (err) {
    console.error("❌ ย้าย role → USER ล้มเหลว:", err.message);
  }
}
