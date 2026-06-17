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
  baseURL
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

        if (bankList.length === 0) {
        } else {
          const activeAccounts = bankList.filter(acc => acc.status === true); //คัดเฉพาะบัญชีที่เปิด
      
              if (activeAccounts.length === 0) {
                console.log("ข้ามการตรวจสอบบัญชี ไม่มีบัญชีที่เปิดใช้ในการตรวจสอบ.... ");
                broadcastLog("ข้ามการตรวจสอบบัญชี ไม่มีบัญชีที่เปิดใช้ในการตรวจสอบ.... ");
              } else {
                const receiverAccount = data.receiver?.account?.bank?.account || "ไม่ระบุ";
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
              data.receiver?.account?.bank?.account || "ไม่ระบุ"
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


