// handlerText.js
import { askGPT, categorizeFromGptReply } from "./textBot/textUtils/gptCategorizer.js";
import { detectCategory } from "./textBot/textUtils/keywords.js";
import { getRandomReplyFromFile, getBonustimeReply, getPasswordReply, checkSuspiciousLink, sendMessageWait1, sendMessageWait2 } from "./textBot/textUtils/reply.js";
import { saveCategoryForUser, hasCategory, hasCategoryInHour, shouldReplyCategory } from "./textBot/textUtils/userCategoryMemory.js";
import { getTime, clearUserTimeout, hasUserSentImage, hasUserSentNormalImage, setUserSentAnyText, hasUserSentAnyText, setUserSentAnyTextisnotoffensive, hasUserSentAnyTextisnotoffensive, setUserSentAnyTextisnotGreeting, setBotSentReplyWait, setBotEndSituation, hasBotEndSituation, hasBotSentThank,
         hasBotSentReplyWait, setUserSentWithdraw ,hasUserSentAnyTextisnotGreeting, hasUserSentWithdraw, setBotSentAskinfo, hasBotSentAskInfo, hasUserSentRewardImage, setBotSentThank,
         setUserSentActivity, hasUserSentSentActivity, hasUserSentComplain, setUserSentComplain, hasBotSentComplain, setBotSentComplain, setBotSentOffensive, hasBotSentOffensive, setUserSentOffensive, hasUserSentOffensive,  hasUserSentLossAmountImage, hasUserSentSlip, hasBotSentGreeting, setBotSentGreeting,
         isWithin15min, isWithin1min, clearUserMessageHistory, waitTimeouts, userMessageHistory } from "./handleEvent.js";
import { getLineProfile } from "../utils/getLineProfile.js";
import { recordCustomer } from "../utils/customerStore.js";
import { checkAndSavePhoneNumber } from "../utils/savePhoneNumber.js";
import { reportResultToAPI } from "../utils/slipResultManager.js";
import { broadcastLog } from "../index.js";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';


dayjs.extend(utc);
dayjs.extend(timezone);

function removeHyphens(text) {
  return text.replace(/[-\s]/g, ""); 
}

export async function handleTextEvent(event, client, prefix, linename, accessToken, baseURL, bonusTimeStatus, PasswordStatus) {
  const userId = event.source.userId;
  const now = Date.now();

  if (event.message.type === 'text') {
    const userMessageRaw = event.message.text.trim();
    const userMessage = removeHyphens(userMessageRaw);
    const NOuser = userId.slice(-10);
    console.log(`📩 มีข้อความ ร้าน: ${linename} [ เลขผู้ใช้: ${NOuser} ] ${userMessage}`);
    broadcastLog(`📩 มีข้อความ ร้าน: ${linename} [ เลขผู้ใช้: ${NOuser} ] ${userMessage}`);

    if (!userMessageHistory.has(userId)) {
      userMessageHistory.delete(userId);
    }

    // 1. ตรวจลิงก์ต้องสงสัยในข้อความ
    const isSuspicious = await checkSuspiciousLink(userMessage);
    if (isSuspicious) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: "ขออภัยนะคะ แอดไม่สามารถคลิ๊กลิ้งค์ที่ส่งมาน๊าา รบกวนลูกค้าไม่ส่งลิ้งค์ใดๆ มานะคะ ขออภัยด้วยค่ะ🙏💖"
      });
      return;
    }

    // 2. ตรวจเบอร์โทรแบบติดกันหรือมีเว้นวรรค
    const mergedText = userMessage.replace(/\s+/g, '');
    const phoneMatch = mergedText.match(/0[689]\d{8}/);
    if (phoneMatch) {
      const phoneNumber = phoneMatch[0].slice(0, 10);
      await checkAndSavePhoneNumber(phoneNumber, userId, prefix, linename);
      return;
    }

    // 3. ตรวจ keyword ของข้อความ
    let category = detectCategory(userMessage);
    if (category) {
      console.log(`ตรงกับหมวดหมู่: ${category}`);
      broadcastLog(`ตรงกับหมวดหมู่: ${category}`);
    } else {
      // 4. ตรวจสอบผ่าน GPT
      const gptReply = await askGPT(userMessage);
      const result = categorizeFromGptReply(gptReply);
      if (!result?.category) return;

      category = result.category;
    }

    saveCategoryForUser(userId, category);

    if (!userMessageHistory.has(userId)) {
      userMessageHistory.set(userId, []);
    }

    userMessageHistory.get(userId).push({
      text: userMessage,
      time: now,
      category
    });

    if (category) {
      clearUserTimeout(userId);
      const timeoutId = handleReply(userId, event, event.replyToken, client, category, prefix, linename, accessToken, userMessage, baseURL, bonusTimeStatus, PasswordStatus);
      waitTimeouts.set(userId, timeoutId);
      return;
    }
  }
}

function isSunday() {
  return dayjs().tz("Asia/Bangkok").day() === 0; // Sunday = 0
}


async function handleReply(userId, event, replyToken, client, category, prefix, linename, accessToken, userMessage, baseURL, bonusTimeStatus, PasswordStatus) {
  try {
    const messages = [];

    // โหลดข้อความตอบกลับจากไฟล์
    const replyLowDeposit = await getRandomReplyFromFile('deposit:low');
    const replyRegisterHow = await getRandomReplyFromFile('register:how', prefix);
    const replyRegisterOption = await getRandomReplyFromFile('register:option');
    const replyaskinfo = await getRandomReplyFromFile('register:askinfo');
    const replyInfoRegister = await getRandomReplyFromFile('info:register');
    const replyGreeting = await getRandomReplyFromFile('greeting:default');
    const replyTrustIssue = await getRandomReplyFromFile('trust_issue:default');
    const replyLossAmountFisrt = await getRandomReplyFromFile('loss_amount:fisrt');
    const replyLossAmountSecond = await getRandomReplyFromFile('loss_amount:second');
    const replyLossAmountThird = await getRandomReplyFromFile('loss_amount:third');
    const replyWithdrawError = await getRandomReplyFromFile('withdraw:error');
    const replyWithdrawMissing = await getRandomReplyFromFile('withdraw:missing');
    const replyLink = await getRandomReplyFromFile('link:default', prefix);
    const replyMissing = await getRandomReplyFromFile('deposit:missing');
    const replyThank = await getRandomReplyFromFile('thank:default');
    const replyComplain = await getRandomReplyFromFile('complain_loss:default');
    const replyOffensive = await getRandomReplyFromFile('offensive:default');

    const replyWait1 = await sendMessageWait1(replyToken, client);
    const replyWait2 = await sendMessageWait2(replyToken, client);
    const replyBonusTime = await getBonustimeReply(prefix, baseURL);
    const replyBonusTimeText = await getRandomReplyFromFile('bonus_time:default');

    const replyPassword = await getPasswordReply(prefix, baseURL);
    const replyPasswordText = await getRandomReplyFromFile('password:default');
    
    const withdrawcount = hasCategoryInHour(userId, category);
    const nowMinutes = getTime();

    const profile = await getLineProfile(userId, accessToken);
    const thaiTime = dayjs().tz("Asia/Bangkok").format("HH:mm") + " น.";
    const phoneNumber = profile?.phoneNumber || "-";
    const lineName = profile?.displayName || "-";
    recordCustomer({ userId, prefix, linename, displayName: profile?.displayName }); // เก็บชื่อโปรไฟล์ลูกค้า

    if (category !== 'offensive') {
      setUserSentAnyTextisnotoffensive(userId);
    }

    if (category !== 'greeting') {
      setUserSentAnyTextisnotGreeting(userId);
    }

    if (!shouldReplyCategory(userId, category)) {
      console.log(`⚠️ ไม่ตอบกลับหมวดหมู่ ${category} เนื่องจากตอบไปแล้วในช่วงนี้`);
      return;
    }

    // ----------------- Greeting -----------------
    if (category === 'greeting') {
      if (hasUserSentImage(userId) || hasUserSentAnyTextisnotGreeting(userId)) {
        return;
      }

      if (replyGreeting) {
        clearUserMessageHistory(userId);
        setTimeout(async () => {
          await client.pushMessage(userId, [{ type: 'text', text: replyGreeting }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyGreeting
          });
        }, 5000);
      }
      return;
    }

  
    // ----------------- activity -----------------
    if (category === 'activity_play' || category === 'activity_issue') {
      setUserSentActivity(userId);
      if (hasBotSentReplyWait(userId)) {
        clearUserMessageHistory(userId);
        return;
      }

      if (replyWait1) {
        await client.replyMessage(replyToken, [{ type: 'text', text: `🟢 ${replyWait1}` }]);
        setBotSentReplyWait(userId);

        await reportResultToAPI(baseURL, { 
          shop: linename,
          lineName,
          text: userMessage,
          phoneNumber,
          time: thaiTime,
          response: "ตอบกลับแล้ว",
          status: "ข้อความ",
          userId,
          prefix,
          reply: `🟢 ${replyWait1}`
        });
      }

      return;
    }
    
    // ----------------- Link -----------------
    if (category === 'link') {
      if (replyLink) {
        messages.push({ type: 'text', text: replyLink });
      }
    }

    // ----------------- trust_issue -----------------
    if (category === 'trust_issue') {
      if (replyTrustIssue) {
        messages.push({ type: 'text', text: replyTrustIssue });
      }
    }

    // ----------------- loss_amount -----------------
    if (category === 'loss_amount') {
      if (isSunday()) {
        if (replyLossAmountThird && !hasUserSentLossAmountImage(userId)) {
          messages.push({ type: 'text', text: replyLossAmountThird });
        }
      } else {
        if (replyLossAmountFisrt) {
          messages.push({ type: 'text', text: replyLossAmountFisrt });
        }
        if (replyLossAmountSecond) {
          messages.push({ type: 'text', text: replyLossAmountSecond });
        }
      }
    }

    // ----------------- Register -----------------
    if (category === 'howto_register') {
      if (replyRegisterHow) {
        await client.replyMessage(replyToken, [{ type: 'text', text: replyRegisterHow }]);

        await reportResultToAPI( baseURL, { 
          shop: linename,
          lineName,
          text: userMessage,
          phoneNumber,
          time: thaiTime,
          response: "ตอบกลับแล้ว",
          status: "ข้อความ",
          userId,
          prefix,
          reply: replyRegisterHow
      });
      }

      if (replyRegisterOption) {
        setTimeout(async () => {
          await client.pushMessage(userId, [{ type: 'text', text: replyRegisterOption }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyRegisterOption
          });
        }, 2000);
      }

      if (replyInfoRegister) {
        setTimeout(async () => {
          await client.pushMessage(userId, [{ type: 'text', text: replyInfoRegister }]);
          setBotSentAskinfo(userId);
          clearUserMessageHistory(userId);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyInfoRegister
          });
        }, 4000);
      } else {
        clearUserMessageHistory(userId);
      }

      return;
    }

    if (category === 'register') {
      if (hasBotSentAskInfo(userId)) {
        if (replyaskinfo) {
          messages.push({ type: 'text', text: replyaskinfo });
        }
      } else {
        if (replyInfoRegister) {
          messages.push({ type: 'text', text: replyInfoRegister });
        }
      }
    }

    if (category === 'low_deposit') {
      if (replyLowDeposit) {
        messages.push({ type: 'text', text: replyLowDeposit });
        clearUserMessageHistory(userId);
      }
    }

    // ----------------- Password -----------------
    if (category === "password") {
      if (!PasswordStatus) {
        return;
      }

      if (replyPassword) {
        await client.replyMessage(replyToken, [replyPassword]);

          await reportResultToAPI(baseURL, {
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: "ส่งรูปภาพลืมรหัสผ่าน"
          });

        await new Promise(resolve => setTimeout(resolve, 3000));

        if (replyPasswordText) {
          await client.pushMessage(userId, {
            type: 'text',
            text: replyPasswordText,
          });

          await reportResultToAPI(baseURL, {
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyPasswordText
          });
          
          return;
        }
      } else {
        console.log(`⚠️ ไม่มีรูป Password ให้ตอบกลับ ร้าน ${linename}`);
        broadcastLog(`⚠️ ไม่มีรูป Password ให้ตอบกลับ ร้าน ${linename}`);
        return;
      }
    }

    // ----------------- bonus_time -----------------
    if (category === "bonus_time") {
      if (!bonusTimeStatus) {
        console.log(`ร้าน ${linename} ปิดใช้งานโบนัสไทม์`);
        return;
      }

      if (replyBonusTime) {
        await client.replyMessage(replyToken, [replyBonusTime]);

          await reportResultToAPI(baseURL, {
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: "ส่งรูปภาพโบนัสไทม์"
          });

        await new Promise(resolve => setTimeout(resolve, 3000));

        if (replyBonusTimeText) {
          await client.pushMessage(userId, {
            type: 'text',
            text: replyBonusTimeText,
          });

          await reportResultToAPI(baseURL, {
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyBonusTimeText
          });
          
          return;
        }
      } else {
        console.log(`ไม่มีรูป BonusTime ให้ตอบกลับ ร้าน ${linename}`);  
        broadcastLog(`ไม่มีรูป BonusTime ให้ตอบกลับ ร้าน ${linename}`);
        return;
      }
    }

    // ----------------- Other -----------------
    if ( category === 'got_money' ) {
        if (replyThank) {
          clearUserMessageHistory(userId);
          setBotSentThank(userId);

          await client.pushMessage(userId, [{ type: 'text', text: replyThank }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyThank
          });
        }
      return;
    }

    if ( category === 'thanks' ) {

      if (hasUserSentComplain(userId)) {
        clearUserMessageHistory(userId);
        return;
      }

        if (replyThank) {
          clearUserMessageHistory(userId);
          setBotSentThank(userId);

          await client.pushMessage(userId, [{ type: 'text', text: replyThank }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyThank
          });
        }

      return;
    }

    if (
      category === 'slow_service'
    ) {
        if (replyWait2) {
          clearUserMessageHistory(userId);
          await client.pushMessage(userId, [{ type: 'text', text: `🟢 ${replyWait2}` }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: `🟢 ${replyWait2}`
          });
        }
      return;
    }

    if (
      category === 'turnover_total' ||
      category === 'exchange_credit' ||
      category === 'change_number'
    ) {
        if (replyWait1) {
          clearUserMessageHistory(userId);
          await client.pushMessage(userId, [{ type: 'text', text: `🟢 ${replyWait1}` }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: `🟢 ${replyWait1}`
          });
        }
      return;
    }
  

    if ( category === 'deposit_error' ) {
      setUserSentWithdraw(userId);
      clearUserMessageHistory(userId);
      await reportResultToAPI(baseURL, {
        shop: linename,
        lineName,
        text: userMessage,
        phoneNumber,
        time: thaiTime,
        response: "ไม่ได้ตอบกลับ",
        status: "ข้อความ",
        userId,
        prefix,
      });

      return;
    }
    
    if (
      !category ||
      category === 'other' ||
      category === 'nonesense' ||
      category === 'other_question' ||
      category === 'cant_play' ||
      category === 'turnover_question' ||
      category === 'user' ||
      category === 'closing_statement' ||
      category === 'no_money' ||
      category === 'free_credit'
    ) {
      clearUserMessageHistory(userId);
      await reportResultToAPI(baseURL, {
        shop: linename,
        lineName,
        text: userMessage,
        phoneNumber,
        time: thaiTime,
        response: "ไม่ได้ตอบกลับ",
        status: "ข้อความ",
        userId,
        prefix,
      });

      return;
    }

    if ( category === 'just_emoji' ) {
      if (!hasUserSentAnyTextisnotGreeting) {
        await client.pushMessage(userId, [{ type: 'text', text: replyGreeting }]);
        clearUserMessageHistory(userId);
        await reportResultToAPI(baseURL, {
          shop: linename,
          lineName,
          text: userMessage,
          phoneNumber,
          time: thaiTime,
          response: "ตอบกลับแล้ว",
          status: "ข้อความ",
          userId,
          prefix,
          reply: "replyGreeting"
        });

        return;
      }
    }

    // ----------------- complain_loss -----------------
    if (category === 'complain_loss') {
      setUserSentComplain(userId);
      setBotSentComplain(userId);

      if (
        hasBotSentOffensive(userId) ||
        hasBotSentComplain(userId)
      ) {
        clearUserMessageHistory(userId);
        console.log(`⛔ ไม่ตอบ offensive ซ้ำให้ ${userId}`);
        return;
      }


      if (
        hasBotSentReplyWait(userId) ||
        hasUserSentRewardImage(userId) ||
        hasUserSentWithdraw(userId) ||
        hasUserSentSlip(userId)
      ) {
        clearUserMessageHistory(userId);
        return;
      }

      if (replyComplain) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        await client.replyMessage(replyToken, [{ type: 'text', text: replyComplain }]);
        return;
      }
    }

    // ----------------- Offensive -----------------
    if (category === 'offensive') {
      setBotSentOffensive(userId);
      if (
        hasBotSentReplyWait(userId) ||
        hasUserSentWithdraw(userId) ||
        hasUserSentRewardImage(userId) ||
        hasBotSentOffensive(userId) ||
        hasBotSentComplain(userId) ||
        hasUserSentSlip(userId)
      ) {
        clearUserMessageHistory(userId);
      }

      if (hasUserSentOffensive(userId)) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await client.replyMessage(replyToken, [{ type: 'text', text: replyComplain }]);
        await reportResultToAPI(baseURL, { 
          shop: linename,
          lineName,
          text: userMessage,
          phoneNumber,
          time: thaiTime,
          response: "ตอบกลับแล้ว",
          status: "ข้อความ",
          userId,
          prefix,
          reply: replyComplain
        });
        return;
      } else if (!hasUserSentAnyTextisnotoffensive(userId)) {
        if (replyGreeting) {
          setUserSentOffensive(userId);
          await client.replyMessage(replyToken, [{ type: 'text', text: replyOffensive }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyOffensive
          });
          return;
        }
      }

      return;
    }

    // ----------------- Deposit -----------------
    if (category === 'deposit_missing' || category === 'aint_money' ) {
      if (hasUserSentRewardImage(userId)) {
        await client.pushMessage(userId, [{ type: 'text', text: `🟢 ${replyWait1}` }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: `🟢 ${replyWait1}`
        });
        setBotSentReplyWait(userId);
        clearUserMessageHistory(userId);
        return;
      }

      if (
        isWithin1min(userId) ||
        hasUserSentWithdraw(userId) ||
        hasUserSentSentActivity(userId) ||
        hasUserSentImage(userId) ||
        hasBotSentThank(userId) ||
        hasBotEndSituation(userId)
      ) {
        clearUserMessageHistory(userId);
        return;
      }

      if (isWithin15min(userId) && hasBotSentReplyWait(userId)) {
        clearUserMessageHistory(userId);
        return;
      }

      if (isWithin15min(userId)) {
        await client.replyMessage(replyToken, [{ type: "text", text: `🟢 ${replyWait2}` }]);
        setBotSentReplyWait(userId);
        clearUserMessageHistory(userId);
        return;
      }
          
      if (replyMissing) {
        clearUserMessageHistory(userId);
        setTimeout(async () => {
          await client.pushMessage(userId, [{ type: 'text', text: replyMissing }]);
          await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: replyMissing
          });
        }, 5000);
      }
      return;
    }

    // ----------------- Withdraw -----------------
    if (hasUserSentImage(userId) || hasBotSentThank(userId) || hasUserSentComplain(userId) || hasUserSentSentActivity(userId)) {
        clearUserMessageHistory(userId);
        return;
    }

    if ((category === 'withdraw_missing' || category === 'withdraw_error') && withdrawcount >= 2) {
      clearUserMessageHistory(userId);
      await reportResultToAPI( baseURL, { 
        shop: linename,
        lineName,
        text: userMessage,
        phoneNumber,
        time: thaiTime,
        response: "ไม่ได้ตอบกลับ",
        status: "ข้อความ",
        userId,
        prefix,
      });

      return;
    }

    if (category === 'withdraw_missing' || category === 'withdraw_error') {

      if (hasUserSentComplain(userId)) {
        clearUserMessageHistory(userId);
        return;
      }

      if (nowMinutes >= 1325 || nowMinutes < 110) {
        // ช่วงปิดถอน
        if (replyWithdrawError) {
          messages.push({ type: 'text', text: replyWithdrawError });
          setUserSentWithdraw(userId);
        }
      } else {
        // นอกช่วงปิดถอน
        clearUserMessageHistory(userId);
        setUserSentWithdraw(userId);
        await reportResultToAPI( baseURL, { 
          shop: linename,
          lineName,
          text: userMessage,
          phoneNumber,
          time: thaiTime,
          response: "ไม่ได้ตอบกลับ",
          status: "ข้อความ",
          userId,
          prefix,
        });

        return;
      }
    }

    // ----------------- ส่งข้อความ -----------------
    if (messages.length > 0) {
      try {
        await client.replyMessage(replyToken, messages);
        clearUserMessageHistory(userId);
        const allReplyText = messages.map(m => m.text).join('\n');
        await reportResultToAPI( baseURL, { 
            shop: linename,
            lineName,
            text: userMessage,
            phoneNumber,
            time: thaiTime,
            response: "ตอบกลับแล้ว",
            status: "ข้อความ",
            userId,
            prefix,
            reply: allReplyText
        });
      } catch (err) {
        console.error('❌ ส่งข้อความล้มเหลว:', err);
        broadcastLog('❌ ส่งข้อความล้มเหลว:', err);

        await reportResultToAPI( baseURL, { 
          time: thaiTime,
          shop: linename,
          lineName,
          response: "ตอบกลับล้มเหลว",
          status: "ข้อความ",
          userId,
          phoneNumber,
          prefix,
        });
      }
    } else {
      console.log('ไม่มีข้อความสำหรับตอบกลับ');
      broadcastLog('ไม่มีข้อความสำหรับตอบกลับ');
      clearUserMessageHistory(userId);
    }

  } catch (err) {
    console.error("❌ ส่งข้อความล้มเหลว:", err);
    broadcastLog(`❌ ส่งข้อความล้มเหลว: ${err.message}`);
    clearUserMessageHistory(userId);
  }
}