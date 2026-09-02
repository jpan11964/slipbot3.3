import line from "@line/bot-sdk";
import Phone from '../models/Phone.js'; // ดึง user จาก MongoDB

export async function getLineProfile(userId, accessToken, client = null) {
  if (!userId || !accessToken) {
    console.warn("⚠️ userId หรือ accessToken ไม่ถูกต้อง", {
      userId,
      tokenPreview: accessToken?.slice(0, 10)
    });
    return {
      displayName: "-",
    };
  }

  try {
    // ตรวจสอบว่ามี user หรือไม่ จาก MongoDB
    const phoneRecord = await Phone.findOne({ userId });

    // ถ้าเจอข้อมูลใน MongoDB → ใช้ชื่อ user จากระบบแทน
    if (phoneRecord && phoneRecord.user) {
      return {
        displayName: phoneRecord.user,
        phoneNumber: phoneRecord.phoneNumber,
      };
    }

    // ถ้าไม่มีข้อมูล user → ลองดึงโปรไฟล์จาก LINE
    // ใช้ healing client ที่ส่งมา (heal 401 ได้) ถ้าไม่มีค่อยสร้างเอง
    const lineClient = client || new line.Client({ channelAccessToken: accessToken });
    const profile = await lineClient.getProfile(userId);
    return {
      displayName: profile?.displayName || "-",
    };

  } catch (err) {
    // แยก log กรณี 400 vs อื่น ๆ
    if (err?.status === 400 || err?.response?.status === 400 || err?.status === 404 || err?.response?.status === 404) {
      console.warn("⚠️ เกิดข้อผิดพลาดขณะดึงโปรไฟล์ LINE: code 400/404", {
        userId,
        tokenPreview: accessToken.slice(0, 10)
      });
    } else {
      console.error("❌ เกิดข้อผิดพลาดขณะดึงโปรไฟล์ LINE:", err);
    }

    return {
      displayName: "-",
      phoneNumber: "-",
    };
  }
}