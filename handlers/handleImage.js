// handleImage.js
import { sendMessageWait1, sendMessageWait2, sendMessageWait3} from "../reply/text_reply.js";
import { sendMessageSame } from "../reply/same_reply.js";
import { getRandomReplyFromFile } from "./textBot/textUtils/reply.js";
import { loadQRDatabaseFromFile, saveQRDatabaseToFile } from "../utils/qrData.js";
import { addToUserQueue } from "../utils/userQueueManager.js";
import { analyzeSlipImage, streamToBuffer } from "../utils/qrSlipworker.js";
import { handleRegularSlip } from "./Image/handleRegularSlip.js";
import { getLineProfile } from "../utils/getLineProfile.js";
import { recordCustomer } from "../utils/customerStore.js";
import { reportResultToAPI } from "../utils/slipResultManager.js";
import { setUserSentNormalImage, setUserSentSlip, setBotSentReplyWait, hasBotSentReplyWait, setUserSentRewardImage, setUserSentLossAmountImage,
        hasBotSentReplyWaitSlip, setBotSentReplyWaitSlip, setUserSentImage, clearUserMessageHistory, clearUserTimeout } from "./handleEvent.js";
import { isNewCustomer } from "../utils/savePhoneNumber.js";
import { broadcastLog } from "../index.js";
import { getCachedSettings, reloadSettings } from "../utils/settingsManager.js";
import Shop from "../models/Shop.js";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js'; 
import crypto from "crypto";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * ฟังก์ชันสำหรับตรวจสอบสลิปซ้ำ
 * @param {string} qrData - ข้อมูล QR ที่สแกนได้
 * @param {string} userId - รหัสผู้ใช้
 * @param {Map} qrDatabase - ฐานข้อมูล QR Code
 * @param {object} client - LINE client สำหรับส่งข้อความตอบกลับ
 * @param {string} replyToken - reply token สำหรับตอบกลับ LINE
 * @param {string} prefix - รหัสร้าน (ใช้ในการบันทึกข้อมูล)
 */

let shopData = [];

export async function loadShopDataFromDB() {
  try {
    shopData = await Shop.find({});
  } catch (err) {
    console.error("❌ โหลดข้อมูลร้านจาก MongoDB ไม่สำเร็จ:", err.message);
    broadcastLog("❌ โหลดข้อมูลร้านจาก MongoDB ไม่สำเร็จ:", err.message);
    shopData = [];
  }
}

function getImageHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// โหลดข้อมูลร้านและ settings ตอนเริ่ม
(async () => {
  await loadShopDataFromDB();
  await reloadSettings();
})();

const userMessageCount = new Map(); // เก็บจำนวนสลิปที่ผู้ใช้ส่ง
const seenImageHashes = new Map();
const warnedUsersAboutDuplicateImage = new Set();

async function loadShopAndQRData(prefix) {

  const shop = shopData.find((s) => s.prefix === prefix);
  if (!shop) {
    console.log(`❌ ไม่พบร้านที่มี prefix: ${prefix}`);
    broadcastLog(`❌ ไม่พบร้านที่มี prefix: ${prefix}`);
    return {};
  }

  const qrDatabase = (await loadQRDatabaseFromFile(prefix)) || new Map();
  return { shop, qrDatabase };
}

export async function handleImageEvent(event, client, prefix, linename, accessToken, baseURL) {
  try {
    const {
      timeLimit,
      sameQrTimeLimit,
      maxMessagesPerUser,
      maxMessagesSamePerUser,
    } = getCachedSettings();
    
    const replyInfoDeposit = await getRandomReplyFromFile('info:deposit');
    const userId = event.source.userId;
    const messageId = event.message.id;
    const NOuser = userId.slice(-10);
    console.log(`📩 มีข้อความภาพ ร้าน: ${linename} [ เลขผู้ใช้: ${NOuser} ]`);
    broadcastLog(`📩 มีข้อความภาพ ร้าน: ${linename} [ เลขผู้ใช้: ${NOuser} ]`);
    
    clearUserTimeout(userId);
    clearUserMessageHistory(userId);
    setUserSentImage(userId);

    addToUserQueue(userId, async () => {
      const { shop, qrDatabase } = await loadShopAndQRData(prefix);
      if (!shop) return;
        try {
          const stream = await client.getMessageContent(messageId);
          const buffer = await streamToBuffer(stream);
          const qrData = await analyzeSlipImage(buffer);
          const profile = await getLineProfile(userId, accessToken);
          const phoneNumber = profile?.phoneNumber || "-";
          const lineName = profile?.displayName || "-";
          recordCustomer({ userId, prefix, linename, displayName: profile?.displayName }); // เก็บชื่อโปรไฟล์ลูกค้า


          if (!qrData) {
            setUserSentNormalImage(userId);
            return;
          }

          if (qrData?.suspicious === true) {
            const hash = getImageHash(buffer);

            if (seenImageHashes.has(hash)) {
              const previousUserId = seenImageHashes.get(hash);

              // ✅ เช็คว่า user ใหม่
              if (previousUserId !== userId) {
                if (!warnedUsersAboutDuplicateImage.has(userId)) {
                  console.warn("⚠️ ผู้ใช้คนใหม่ส่งภาพเดิม และยังไม่เคยเตือนมาก่อน");

                  warnedUsersAboutDuplicateImage.add(userId);
                  setTimeout(() => warnedUsersAboutDuplicateImage.delete(userId), 10 * 60 * 1000); // ลบหลัง 10 นาที.

                  await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "🟡 สลิปนี้ส่งมาในอีกไลน์นึงแล้วนะคะ ขอแอดตรวจสอบ 1-2 นาทีจ้า 🙇‍♀️",
                  });
                } else {
                  console.log("🔁 ผู้ใช้ส่งภาพเดิมอีก แต่เคยเตือนไปแล้ว → ไม่ตอบซ้ำ");
                }
                return;
              }
            }

            // ✅ ไม่เคยส่งหรือเป็น user เดิม → บันทึกใหม่และดำเนินการ
            seenImageHashes.set(hash, userId);

            await processSuspiciousSlip({ event, client, userId, linename, lineName, phoneNumber, prefix, baseURL });
            setUserSentSlip(userId);
            return;
          }

          if (qrData?.LossAmount === true) {
            await processLossAmountimage({ event, client, userId, linename, lineName, phoneNumber, prefix, baseURL });
            setUserSentLossAmountImage(userId);
            return;
          }

          if (qrData?.reward === true) {
            await processRewardimage({ event, client, userId, linename, lineName, phoneNumber, prefix, baseURL });
            setUserSentRewardImage(userId);
            return;
          }

          setUserSentSlip(userId);

          if (!global.qrImageSendLog) {
            global.qrImageSendLog = new Map();
          }

          const now = Date.now();
          const logList = global.qrImageSendLog.get(userId) || [];
          const isNew = await isNewCustomer(userId);

          const validLogs = logList.filter((timestamp) => now - timestamp < timeLimit);

          if (validLogs.length >= maxMessagesPerUser) {
            console.log(`ผู้ใช้ ${userId} ส่งภาพ QR เกิน ${maxMessagesPerUser} ครั้งใน 5 นาที`);
            broadcastLog(`ผู้ใช้ ${userId} ส่งภาพ QR เกิน ${maxMessagesPerUser} ครั้งใน 5 นาที`);
            return;
          }

          validLogs.push(now);
          global.qrImageSendLog.set(userId, validLogs);

          console.log("QR Code ที่สแกนได้:", qrData);

          if (!userMessageCount.has(userId)) {
            userMessageCount.set(userId, { lastSentTime: 0, qrMessageCount: 0 });
          }
          const userInfo = userMessageCount.get(userId);

          // ✅ ตรวจสลิปซ้ำ
          if (qrDatabase.has(qrData)) {
            const handled = await processDuplicateSlip({
              event,
              client,
              qrData,
              qrDatabase,
              userId,
              now,
              sameQrTimeLimit,
              maxMessagesSamePerUser,
              linename,
              lineName,
              prefix,
              phoneNumber,
              baseURL
            });
            if (handled) return;
          }

          // ✅ สลิปใหม่
          await forwardNormalSlip({
            event,
            client,
            qrData,
            qrDatabase,
            userId,
            now,
            timeLimit,
            maxMessagesPerUser,
            prefix,
            shop,
            linename,
            lineName,
            userInfo,
            isNew,
            replyInfoDeposit,
            phoneNumber,
            baseURL
        });
      } catch (err) {
        console.error(`❌ [${userId}] Error inside slip task:`, err);
        broadcastLog(`❌ [${userId}] Error inside slip task: ${err.message}`);
      }
    });
  } catch (error) {
    console.error(`❌ Error processing event for PREFIX ${prefix}: ${error.message}`);
    broadcastLog(`❌ Error processing event for PREFIX ${prefix}: ${error.message}`);
  }
}

async function processSuspiciousSlip({ event, client, userId, linename, lineName, phoneNumber, prefix, baseURL }) {
  console.log("⚠️ พบสลิปต้องสงสัย ( อาจเป็นภาพสลิป แต่ไม่มี QRcode หรือ ปลอมสลิป )");
  broadcastLog("⚠️ พบสลิปต้องสงสัย ( อาจเป็นภาพสลิป แต่ไม่มี QRcode หรือ ปลอมสลิป )");
  setBotSentReplyWait(userId);
  await reportResultToAPI(baseURL, { 
    time: getCurrentTimeOnly(),
    shop: linename,
    lineName,
    prefix,
    status: "พบสลิปต้องสงสัย (ไม่มี QRcode หรือปลอมสลิป)",
    response: "ตอบกลับแล้ว",
    userId: userId,
    phoneNumber,
    reply: "🟡 น้องแอดมินกำลังตรวจสอบให้นะค้าา ขออภัยที่ล่าช้านะ ขอเวลา 1-2 นาทีค่า",
  });
  await sendMessageWait3(event.replyToken, client);
}

async function processRewardimage({ event, client, userId, linename, lineName, phoneNumber, prefix, baseURL }) {
  console.log('พบรูปภาพหน้า "เล่นกิจกรรม"');
  broadcastLog('พบรูปภาพหน้า "เล่นกิจกรรม"');
  if (hasBotSentReplyWait(userId)) return;
  setBotSentReplyWait(userId);
  await reportResultToAPI(baseURL, { 
    time: getCurrentTimeOnly(),
    shop: linename,
    lineName,
    prefix,
    status: "รูปภาพ ''เล่นกิจกรรม''",
    response: "ตอบกลับแล้ว",
    userId: userId,
    phoneNumber,
    reply: "🟢 น้องแอดมินกำลังตรวจสอบให้นะค้าา ขออภัยที่ล่าช้านะ ขอเวลา 1-2 นาทีค่า",
  });
  await sendMessageWait1(event.replyToken, client);
}

async function processLossAmountimage({ event, client, userId, linename, lineName, phoneNumber, prefix, baseURL }) {
  console.log('พบรูปภาพหน้า "คืนยอดเสีย"');
  broadcastLog('พบรูปภาพหน้า "คืนยอดเสีย"');
  if (hasBotSentReplyWait(userId)) return;
  setBotSentReplyWait(userId);
  await reportResultToAPI(baseURL, { 
    time: getCurrentTimeOnly(),
    shop: linename,
    lineName,
    prefix,
    status: "รูปภาพ ''ยอดเสีย''",
    response: "ตอบกลับแล้ว",
    userId: userId,
    phoneNumber,
    reply: "🟢 ขอเวลาหนูตรวจสอบสักครู่นะคะ แป๊บเดียวเท่านั้น เดี๋ยวน้องแอดมินรีบแจ้งให้ทราบนะคะ",
  });
  await sendMessageWait1(event.replyToken, client);
}

async function processDuplicateSlip({
  event,
  client,
  qrData,
  qrDatabase,
  userId,
  now,
  sameQrTimeLimit,
  maxMessagesSamePerUser,
  linename,
  lineName,
  prefix,
  phoneNumber,
  baseURL
}) {

  const qrInfo = qrDatabase.get(qrData);
  if (!qrInfo) {
    console.log(`⚠️ ไม่พบข้อมูล qrInfo ในฐานข้อมูลภายใน memory`);
    return false;
  }

  const userEntry = qrInfo.users.get(userId);
  const tranRef = qrData.length > 20 ? qrData.slice(-20) : qrData;

  // กรณีผู้ใช้เดิมเคยส่งมาแล้ว
  if (userEntry) {
    const lastSentTime = userEntry.lastSentTime || 0;
    const sameMessageCount = userEntry.messageCount || 0;

    if (hasBotSentReplyWaitSlip(userId) || hasBotSentReplyWait(userId)) {
       return;
    }

    // ⏳ ภายในเวลา sameQrTimeLimit → อาจตอบ "รอสักครู่"
    if (now - lastSentTime < sameQrTimeLimit) {
      if (sameMessageCount < maxMessagesSamePerUser) {
        setBotSentReplyWaitSlip(userId);
        setBotSentReplyWait(userId);
        console.log(`ตอบกลับ "รอสักครู่" ครั้งแรกให้กับ ${userId}`);
        broadcastLog(`ตอบกลับ "รอสักครู่" ครั้งแรกให้กับ ${userId}`);

        await reportResultToAPI(baseURL, { 
          time: getCurrentTimeOnly(),
          shop: linename,
          lineName,
          prefix,
          status: "สลิปซ้ำ ไม่เกิน 1 ชั่วโมง",
          response: "ตอบกลับแล้ว",
          amount: qrInfo.amount,
          ref: qrData,
          userId: userId,
          phoneNumber,
        });

        await sendMessageWait2(event.replyToken, client);

        // บันทึกว่าเคยส่งแล้ว
        qrInfo.users.set(userId, {
          lastSentTime: now,
          messageCount: sameMessageCount + 1,
        });

        saveQRDatabaseToFile(prefix, qrDatabase);
        return true;
      } else {
        console.log(`เพิกเฉย: ผู้ใช้ ${userId} สลิปนี้ส่งมาเกิน ${maxMessagesSamePerUser} ครั้ง`);
        broadcastLog(`เพิกเฉย: ผู้ใช้ ${userId} สลิปนี้ส่งมาเกิน ${maxMessagesSamePerUser} ครั้ง`);
        return true;
      }
    }
  }

  console.log(`🔴 พบสลิป QR Code ซ้ำ`);
  broadcastLog(`🔴 พบสลิป QR Code ซ้ำ`);

  await reportResultToAPI(baseURL, { 
    time: getCurrentTimeOnly(),
    shop: linename,
    lineName,
    prefix,
    status: "สลิปซ้ำเดิม",
    response: "ตอบกลับแล้ว",
    amount: qrInfo.amount,
    ref: qrData,
    userId: userId,
    phoneNumber
  });

  await sendMessageSame(
    event.replyToken,
    client,
    new Date(qrInfo.firstDetected).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
    }) + " น.",
    tranRef
  );

  // หากเป็นผู้ใช้ใหม่ ให้เพิ่ม user เข้าไปด้วย
  if (!userEntry) {
    qrInfo.users.set(userId, {
      lastSentTime: now,
      messageCount: 1,
    });
  } else {
    userEntry.lastSentTime = now;
    userEntry.messageCount += 1;
  }

  saveQRDatabaseToFile(prefix, qrDatabase);
  return true;
}

async function forwardNormalSlip({
  event,
  client,
  qrData,
  qrDatabase,
  userId,
  now,
  timeLimit,
  maxMessagesPerUser,
  prefix,
  shop,
  linename,
  lineName,
  userInfo,
  isNew,
  replyInfoDeposit,
  phoneNumber,
  baseURL
}) {

  userMessageCount.set(userId, {
    lastSentTime: now,
    qrMessageCount: userInfo.qrMessageCount + 1,
  });

  const tranRef = qrData.length > 20 ? qrData.slice(-20) : qrData;
  const qrEntry = {
    firstDetected: now,
    users: new Map([[userId, { lastSentTime: now, messageCount: 1 }]]),
    firstSent: new Date()
  };

if (shop.slipCheckOption === "duplicate") {
  console.log('ร้านเปิดการตอบเฉพาะสลิปวนซ้ำ');
  return;
}

  if (shop.slipCheckOption === "all") {
    const slipData = await handleRegularSlip(
      client,
      event.message.id,
      event.replyToken,
      prefix,
      qrDatabase,
      qrData,
      userId,
      lineName,
      linename,
      tranRef,
      isNew,
      replyInfoDeposit,
      phoneNumber,
      baseURL
    );
    if (slipData && slipData.amount !== undefined) {
      qrEntry.amount = slipData.amount;
    }
  }

  qrDatabase.set(qrData, qrEntry);
  saveQRDatabaseToFile(prefix, qrDatabase);
}


function getCurrentTimeOnly() {
  return dayjs().tz('Asia/Bangkok').format('HH:mm') + ' น.';
}

