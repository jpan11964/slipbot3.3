// mongo.js
import mongoose from "mongoose";
import dns from "dns";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { addNotification } from "./utils/notificationStore.js";

// บังคับ Node.js c-ares ใช้ Google DNS โดยตรง — เฉพาะ Windows เท่านั้น
// แก้ปัญหา querySrv ECONNREFUSED บน Windows ที่ localhost DNS ไม่ตอบสนอง
// บน production (Render/Linux) ปล่อยใช้ DNS resolver ของระบบ — override ไม่จำเป็น
// และเป็นตัวแปรที่ทำให้ resolve node ของ Atlas เพี้ยนได้
if (process.platform === "win32") {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
}

const envFile = process.env.NODE_ENV === "production" ? "info.prod.env" : "info.dev.env"
const envPath = path.join(process.cwd(), envFile)
const fallback = path.join(process.cwd(), "info.env")
dotenv.config({ path: fs.existsSync(envPath) ? envPath : fallback })

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      family: 4,
    });
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connect failed:", err.message);
    addNotification({
      key: "system:mongo_connect_failed",
      level: "error",
      category: "system",
      title: "เชื่อมต่อฐานข้อมูลไม่ได้",
      message: `ต่อ MongoDB ไม่สำเร็จ กำลังลองใหม่อัตโนมัติ (${err.message})`,
    });
    // retry only if initial connect fails
    setTimeout(() => {
      connectDB();
    }, 5000);
  }
}

let reconnecting = false;

// เมื่อ disconnected → ลอง reconnect
mongoose.connection.on("disconnected", () => {
  if (!reconnecting) {
    console.warn("⚠️ MongoDB disconnected. Reconnecting...");
    addNotification({
      key: "system:mongo_disconnected",
      level: "warn",
      category: "system",
      title: "ฐานข้อมูลหลุดการเชื่อมต่อ",
      message: "MongoDB หลุดการเชื่อมต่อ กำลังเชื่อมต่อใหม่อัตโนมัติ",
    });
    reconnecting = true;
    setTimeout(async () => {
      await connectDB();
      reconnecting = false;
    }, 5000);
  }
});

// เมื่อ error → log ไว้
mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err.message);
  addNotification({
    key: "system:mongo_error",
    level: "error",
    category: "system",
    title: "ฐานข้อมูลขัดข้อง",
    message: `MongoDB error: ${err.message}`,
  });
});

export default mongoose;
