// regularSlipChecker.js
import { sendMessageRight } from "../../reply/right_reply.js";
import { sendMessageWait3 } from "../../reply/text_reply.js";
import { sendMessageOld } from "../../reply/oldpic_reply.js";
import { sendMessageWrong } from "../../reply/wrong_reply.js";
import { sendMessageMinimum } from "../../reply/minimum_reply.js";
import { sendImageToSlip2Go } from "./slipService.js"; 
import { saveQRDatabaseToFile } from "../../utils/qrData.js";
import bankCodeMapping from "../../utils/bankCodeMapping.js";
import { setBotSentReplyWait, setBotSentInfo, hasSentInfo } from "../handleEvent.js";
import { reportResultToAPI } from "../../utils/slipResultManager.js";
import { broadcastLog } from "../../index.js";
import { isAccountNumberMatch } from "../../utils/accountUtils.js";
import BankAccount from "../../models/BankAccount.js";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js'; 

/**
 * ฟังก์ชันสำหรับตรวจสอบสลิปแบบปกติ
 * @param {object} client - LINE client สำหรับส่งข้อความตอบกลับ
 * @param {string} messageId - รหัสข้อความสำหรับดึงเนื้อหารูป
 * @param {string} replyToken - reply token สำหรับตอบกลับ LINE
 * @param {string} prefix - รหัสร้าน (ใช้ในการบันทึกข้อมูล)
 * @param {Map} qrDatabase - ฐานข้อมูล QR Code
 * @param {string} qrData - ข้อมูล QR ที่สแกนได้
 * @param {string} userId - รหัสผู้ใช้ที่ส่งสลิป
 */

dayjs.extend(utc);
dayjs.extend(timezone);

// ต่อท้ายข้อความ "สลิปถูกต้อง" เมื่อร้านปิดการตรวจบัญชีปลายทางทั้งที่มีบัญชีอยู่ในระบบ
// เพราะกรณีนั้นระบบไม่ได้ยืนยันเลยว่าโอนเข้าบัญชีไหน ถ้าลูกค้าโอนตามบัญชีเก่าในประวัติ
// จะไม่มีอะไรมาดักให้ — จึงต้องเตือนให้ไปดูบัญชีล่าสุดที่หน้าเว็บทุกครั้ง
const CHECK_ACCOUNT_NOTICE =
  "กรุณาตรวจสอบบัญชีฝากที่หน้าเว็บทุกครั้งก่อนทำรายการโอน " +
  "รบกวนไม่ทำรายการโอนตามประวัตินะคะ ธนาคารมีการเปลี่ยนอยู่ตลอดเวลา ขอบคุณค่ะ🙏😁";

// ผ่อนผันหลังกดปิดบัญชี — สลิปที่โอนเข้าบัญชีนั้นยังผ่านแบบเงียบๆ ได้ในช่วงนี้
// (ลูกค้าเห็นเลขบัญชีบนหน้าเว็บก่อนร้านสลับบัญชี แล้วกำลังโอนอยู่พอดี ไม่ควรโดนตีตก)
const BANK_DISABLE_GRACE_MS = 5 * 60 * 1000;

// ผ่อนผันหลังเปิดบัญชี "ใบแรก" ของร้าน — ยังไม่เริ่มตรวจจริงในช่วงนี้
// แอดมินมักทยอยเปิดทีละใบ ถ้าเริ่มตรวจทันทีที่เปิดใบแรก สลิปที่โอนเข้าบัญชีที่ยังไม่ทันเปิด
// จะโดนต่อข้อความเตือนทั้งที่บัญชีนั้นกำลังจะถูกเปิดอยู่แล้ว
const BANK_ENABLE_GRACE_MS = 30 * 1000;

export async function handleRegularSlip(
  client,
  messageId,
  replyToken,
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
  baseURL,
  checkBankAccount = true   // สวิตช์ "ปิด/เปิดการตรวจบัญชีปลายทาง" ของร้าน (default เปิด)
) {
  try {
    const now = Date.now();
    const Slip2GoResponse = await sendImageToSlip2Go(client, messageId);
    const bankList = await BankAccount.find({ prefix });

    const thaiTime = dayjs().tz("Asia/Bangkok").format("HH:mm") + " น.";
    if (Slip2GoResponse.status === "valid") {
    const data = Slip2GoResponse.data?.data;
        if (!data || data.amount == null) return { amount: undefined };
        const Amount = data.amount;

      // หากไม่ได้รับ Amount (กรณี SlipOK error, timeout, ฯลฯ)
      if (Amount === undefined || Amount === null) {
        return { amount: undefined };
      }

      // สร้าง entry สำหรับ QR code นี้
      const qrEntry = {
        firstDetected: now,
        users: new Map([[userId, { lastSentTime: now, messageCount: 1 }]])
      };

      qrEntry.amount = Amount;

      qrDatabase.set(qrData, qrEntry);
      saveQRDatabaseToFile(prefix, qrDatabase);

        // ต้องต่อข้อความเตือนให้ไปดูบัญชีล่าสุดที่หน้าเว็บไหม
        // ติดธงเมื่อสลิป "ผ่าน" ทั้งที่ระบบไม่ได้ยืนยันว่าโอนเข้าบัญชีที่ร้านใช้อยู่จริง
        let needAccountNotice = false;

        if (!checkBankAccount) {
          // ร้านปิดสวิตช์ "ตรวจบัญชีปลายทาง" ไว้ — ข้ามด่านนี้ แต่ยังตรวจยอดเงิน/วันที่ต่อตามปกติ
          console.log("ข้ามการตรวจสอบบัญชี ร้านปิดการตรวจบัญชีปลายทางไว้.... ");
          broadcastLog("ข้ามการตรวจสอบบัญชี ร้านปิดการตรวจบัญชีปลายทางไว้.... ");
          // ร้านที่ยังไม่มีบัญชีในระบบเลยไม่ต้องเตือน — เตือนไปก็ไม่มีบัญชีให้ไปดูที่หน้าเว็บ
          needAccountNotice = bankList.length > 0;
        } else if (bankList.length === 0) {
        } else {
          const activeAccounts = bankList.filter(acc => acc.status === true); //คัดเฉพาะบัญชีที่เปิด

              // ยังไม่เปิดบัญชีไหนเลย = ร้านยังไม่ได้เริ่มใช้การตรวจ ผ่านเงียบๆ ไม่ต้องเตือน
              // (จะเริ่มเตือนเมื่อร้านเปิดบัญชีอย่างน้อย 1 ใบแล้วเท่านั้น)
              //
              // เพิ่งเปิดบัญชี "ใบแรก" ไปไม่ถึง 30 วิ ก็ยังไม่เริ่มตรวจเหมือนกัน
              // เพราะแอดมินกำลังทยอยเปิดบัญชีที่เหลืออยู่ ถ้าเริ่มตรวจทันที
              // สลิปที่โอนเข้าบัญชีที่ยังไม่ทันเปิดจะโดนต่อข้อความเตือนทั้งที่ไม่ได้ผิดอะไร
              const firstEnabledAt = Math.max(
                0, ...activeAccounts.map(acc => (acc.firstEnabledAt ? new Date(acc.firstEnabledAt).getTime() : 0)));
              const settingUp = firstEnabledAt > 0 && (Date.now() - firstEnabledAt) < BANK_ENABLE_GRACE_MS;

              if (activeAccounts.length === 0 || settingUp) {
                const why = activeAccounts.length === 0
                  ? "ไม่มีบัญชีที่เปิดใช้ในการตรวจสอบ"
                  : `เพิ่งเปิดบัญชีใบแรกไม่ถึง ${BANK_ENABLE_GRACE_MS / 1000} วิ รอให้เปิดบัญชีที่เหลือก่อน`;
                console.log(`ข้ามการตรวจสอบบัญชี ${why}.... `);
                broadcastLog(`ข้ามการตรวจสอบบัญชี ${why}.... `);
              } else {
                const receiverAccount = data.receiver?.account?.bank?.account || "";

                // ไม่มีเลขบัญชีปลายทางให้ตรวจเลย — เกิดได้ 2 กรณี
                //   1) Slip2Go ไม่คืนฟิลด์นี้มา (ข้อมูลไม่ครบ)
                //   2) ธนาคารมาสก์ไว้หมดทุกหลัก (xxx-x-xxxxx-x) ไม่เหลือเลขให้เทียบ
                //
                // ห้ามตอบ "บัญชีปลายทางผิด" เพราะสลิปอาจโอนถูกบัญชีจริงๆ แค่ข้อมูลไม่มา
                // (ของเดิมตกมาถึงลูปข้างล่างแล้วไม่ตรงสักบัญชี → กล่าวหาลูกค้าผิด)
                // และห้ามปล่อยผ่าน เพราะถ้ามาสก์หมดทุกหลักจะกลายเป็นไวลด์การ์ดที่ตรงกับทุกบัญชี
                // → ส่งให้แอดมินตรวจแทน แบบเดียวกับสลิปต้องสงสัย/ตรวจไม่ทัน
                if (!/[0-9]/.test(receiverAccount)) {
                  const shown = receiverAccount || "ไม่มีข้อมูล";
                  console.log(`🟡 สลิปไม่มีเลขบัญชีปลายทางให้ตรวจสอบ (ค่าที่ได้: ${shown})`);
                  broadcastLog(`🟡 สลิปไม่มีเลขบัญชีปลายทางให้ตรวจสอบ (ค่าที่ได้: ${shown})`);
                  setBotSentReplyWait(userId);
                  await sendMessageWait3(replyToken, client);
                  await reportResultToAPI( baseURL, {
                    time: thaiTime,
                    shop: linename,
                    lineName,
                    prefix,
                    status: "ตรวจบัญชีปลายทางไม่ได้",
                    response: "ตอบกลับแล้ว",
                    amount: Amount,
                    ref: qrData,
                    userId: userId,
                    phoneNumber,
                    reply: "🟡 น้องแอดมินกำลังตรวจสอบให้นะค้าา ขออภัยที่ล่าช้านะ ขอเวลา 1-2 นาทีค่า",
                  });
                  return { amount: Amount };
                }

                let accountMatched = false;
            
                for (const account of activeAccounts) {
                  console.log(`✅ กำลังตรวจสอบบัญชี: ${receiverAccount} กับ ${account.account}`);
                  broadcastLog(`✅ กำลังตรวจสอบบัญชี: ${receiverAccount} กับ ${account.account}`);
                  if (isAccountNumberMatch(receiverAccount, account.account)) {
                    console.log(`🎯 หมายเลขบัญชีตรงกับ: ${receiverAccount}`);
                    broadcastLog(`🎯 หมายเลขบัญชีตรงกับ: ${receiverAccount}`);
                    accountMatched = true;
                    break;
                  } else {
                    console.log(`❌ หมายเลขบัญชีไม่ตรงกับ: ${receiverAccount}`);
                    broadcastLog(`❌ หมายเลขบัญชีไม่ตรงกับ: ${receiverAccount}`);
                  }
                }

                // ไม่ตรงบัญชีที่เปิดอยู่ → ลองเทียบกับบัญชีของร้านที่ "ปิดไป" ก่อนตีตก
                // เพราะเงินเข้าบัญชีของร้านจริง แค่ร้านสลับบัญชีไปแล้ว การตีตกทำให้ลูกค้าเดือดร้อนเกินเหตุ
                //   ปิดไปไม่เกิน 5 นาที = ลูกค้าน่าจะเห็นเลขบัญชีก่อนร้านสลับ แล้วกำลังโอนอยู่พอดี → ผ่านเงียบๆ
                //   ปิดไปนานแล้ว        = โอนตามประวัติเก่า → ผ่านได้ แต่ต้องเตือนให้ไปดูบัญชีล่าสุดที่หน้าเว็บ
                if (!accountMatched) {
                  const disabledMatch = bankList.find(acc =>
                    acc.status !== true && isAccountNumberMatch(receiverAccount, acc.account));

                  if (disabledMatch) {
                    const disabledAt = disabledMatch.disabledAt ? new Date(disabledMatch.disabledAt).getTime() : 0;
                    const withinGrace = disabledAt > 0 && (Date.now() - disabledAt) < BANK_DISABLE_GRACE_MS;

                    accountMatched = true;
                    needAccountNotice = !withinGrace;
                    const howLong = withinGrace
                      ? `เพิ่งปิดไปไม่ถึง ${BANK_DISABLE_GRACE_MS / 60000} นาที ผ่อนผันให้ผ่าน`
                      : "ปิดมานานแล้ว ผ่านแต่แนบข้อความเตือน";
                    console.log(`🟡 โอนเข้าบัญชีที่ปิดอยู่: ${disabledMatch.account} — ${howLong}`);
                    broadcastLog(`🟡 โอนเข้าบัญชีที่ปิดอยู่: ${disabledMatch.account} — ${howLong}`);
                  }
                }

                if (!accountMatched) {
                  console.log(`🔴 พบสลิปบัญชีปลายทางไม่ถูกต้อง`);
                  broadcastLog(`🔴 พบสลิปบัญชีปลายทางไม่ถูกต้อง`);
                  await sendMessageWrong(replyToken, client,
                    tranRef, data.amount, data.sender?.account?.name || "ไม่ระบุ",
                    data.sender?.account?.bank?.account || "ไม่ระบุ",
                    data.receiver?.account?.name || "ไม่ระบุ",
                    data.receiver?.account?.bank?.account || "ไม่ระบุ"
                  );
                  await reportResultToAPI( baseURL, {
                    time: thaiTime,
                    shop: linename,
                    lineName,
                    prefix,
                    status: "บัญชีปลายทางผิด",
                    response: "ตอบกลับแล้ว",
                    amount: Amount,
                    ref: qrData,
                    userId: userId,
                    phoneNumber
                  });
                  return { amount: Amount };
                }
            }
          }

            const fromBank = data.sender.bank?.name || "ไม่ระบุ";
            const toBank = data.receiver.bank?.name || "ไม่ระบุ";
            const transactionDate = dayjs(data.dateTime).tz("Asia/Bangkok");

            const daysDifference = dayjs().tz("Asia/Bangkok").diff(transactionDate, 'day');

            const timeOnly = transactionDate.format("HH:mm") + " น.";

            // วันที่ + เดือน + ปีไทย
            const monthsThai = [
              "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
              "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
            ];

            const formattedTransactionDateTime = `${transactionDate.date()} ${
              monthsThai[transactionDate.month()]
            } ${transactionDate.year() + 543} ${timeOnly}`;
            
            if (Amount < process.env.MINIMUM_AMOUNT) {
              console.log(`🟡 พบสลิปยอดเงินต่ำกว่ากำหนด จำนวน ${Amount} บาท`);
              broadcastLog(`🟡 พบสลิปยอดเงินต่ำกว่ากำหนด จำนวน ${Amount} บาท`);
              await sendMessageMinimum(
                replyToken,
                client,
                formattedTransactionDateTime,
                tranRef,
                data.amount,
                data.sender?.account?.name || "ไม่ระบุ",
                fromBank,
                data.sender?.account?.bank?.account || "ไม่ระบุ",
                data.receiver?.account?.name || "ไม่ระบุ",
                toBank,
                data.receiver?.account?.bank?.account || "ไม่ระบุ"
              );
              await reportResultToAPI( baseURL, {
                time: thaiTime,
                shop: linename,
                lineName,
                prefix,
                status: "สลิปยอดเงินต่ำ",
                response: "ตอบกลับแล้ว",
                amount: Amount,
                ref: qrData,
                userId: userId,
                phoneNumber
              });
              return { amount: Amount };
            }

            // ตรวจสอบวันที่เกิน 2 วัน
            if (daysDifference > 2) {
              console.log("🟡 พบสลิปย้อนหลังเกิน 2 วัน");
              broadcastLog("🟡 พบสลิปย้อนหลังเกิน 2 วัน");
              await sendMessageOld(replyToken,client,formattedTransactionDateTime,
                tranRef,data.amount,data.sender?.account?.name || "ไม่ระบุ",
                fromBank, data.sender?.account?.bank?.account || "ไม่ระบุ",
                data.receiver?.account?.name || "ไม่ระบุ", toBank,
                data.receiver?.account?.bank?.account || "ไม่ระบุ"
              );
              await reportResultToAPI( baseURL, {
                time: thaiTime,
                shop: linename,
                lineName,
                prefix,
                status: "สลิปย้อนหลัง",
                response: "ตอบกลับแล้ว",
                amount: Amount,
                ref: qrData,
                userId: userId,
                phoneNumber
              });
              return { amount: Amount };
            }
  
            // หากผ่านทุกการตรวจสอบ ตอบกลับว่า "สลิปถูกต้องและใหม่"
            console.log("🟢 สลิปถูกต้อง");
            broadcastLog("🟢 สลิปถูกต้อง");

            // ตอบกลับหลัก
            await sendMessageRight(
              replyToken,
              client,
              formattedTransactionDateTime,
              tranRef,
              data.amount,
              data.sender?.account?.name || "ไม่ระบุ",
              fromBank,
              data.sender?.account?.bank?.account || "ไม่ระบุ",
              data.receiver?.account?.name || "ไม่ระบุ",
              toBank,
              data.receiver?.account?.bank?.account || "ไม่ระบุ",
              needAccountNotice ? CHECK_ACCOUNT_NOTICE : ""
            );


            await reportResultToAPI( baseURL, {
              time: thaiTime,
              shop: linename,
              lineName,
              prefix,
              status: "สลิปถูกต้อง",
              response: "ตอบกลับแล้ว",
              amount: Amount,
              ref: qrData,
              userId: userId,
              phoneNumber
            });
            return { amount: Amount };
          }        
          
            if (Slip2GoResponse.status === "timeout" || Slip2GoResponse.status === "ignored" ) {
              console.log("สถานะ: ใช้เวลาตรวจสอบนานเกินไป");
              broadcastLog("สถานะ: ใช้เวลาตรวจสอบนานเกินไป");
              await sendMessageWait3(replyToken, client);
              setBotSentReplyWait(userId);
              await reportResultToAPI( baseURL, {
                time: thaiTime,
                shop: linename,
                lineName,
                prefix,
                status: "ใช้เวลาตรวจสอบนานเกินไป",
                response: "ตอบกลับแล้ว",
                amount: undefined,
                userId: userId,
                phoneNumber,
                reply: "🟡 น้องแอดมินกำลังตรวจสอบให้นะค้าา ขออภัยที่ล่าช้านะ ขอเวลา 1-2 นาทีค่า",
              });
              return { amount: undefined };
            }

          
            if ( Slip2GoResponse.status === "error" ) {
              await reportResultToAPI( baseURL, {
                time: thaiTime,
                shop: linename,
                lineName,
                prefix,
                status: "เกิดข้อผิดพลาดระหว่างตรวจสอบ",
                response: "ไม่ได้ตอบกลับ",
                amount: undefined,
                ref: qrData,
                userId: userId,
                phoneNumber
              });
              return { amount: undefined };
            }

          } catch (err) {
            console.error(`❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป: ${err.message}`);
            broadcastLog(`❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป: ${err.message}`);
            return { amount: undefined };
          }
        }

function getBankName(bankCode) {
  if (!bankCode || bankCode.trim() === "") {
    return ""; 
  }
  return bankCodeMapping[bankCode]?.fullName || "ไม่ระบุ";
}


