// handlerEvent.js
import Shop from '../models/Shop.js';
import { handleImageEvent } from './handleImage.js';
import { handleTextEvent } from './handleText.js';
import { recordCustomer } from '../utils/customerStore.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';     

const usersWhoSentImage = new Map(); 
const usersWhoSentNormalImage = new Map();
const usersWhoSentRewardImage = new Map(); 
const usersWhoSentLossAmountImage = new Map(); 
const usersWhoSentComplain = new Map(); 
const usersWhoSentOffensive = new Map(); 
const usersBotSentOffensive = new Map(); 
const usersBotSentComplain = new Map(); 
const usersBotSentGreeting = new Map(); 
const usersWhoSentAnyTextisnotGreeting = new Map();
const botSentThank = new Map();
const BotEndSituation = new Map();
const usersWhoSentActivity = new Map();
const usersWhoSentSlip = new Map(); 
const usersWhoSentAnyTextisnotoffensive = new Map(); 
const usersWhoSentAnyText = new Map(); 
const usersWhoSentWithdraw = new Map(); 

const userInfoSent = new Map();
const userHasAskinfo = new Map();
const userHasReplyWait = new Map();

const userMessageHistory = new Map();
const waitTimeouts = new Map();
const slipTimeouts = new Map();
const programStartTime = Date.now();

dayjs.extend(utc);
dayjs.extend(timezone);

async function handleEvent(event, client, prefix, linename, accessToken, baseURL) {
  // บันทึกลูกค้าทุกคนที่ทักมา (ไม่ว่ามีเบอร์หรือไม่ ไม่ซ้ำตาม userId)
  const customerId = event.source?.userId;
  if (customerId) recordCustomer({ userId: customerId, prefix, linename });

  const shop = await Shop.findOne({ prefix });

  // ตรวจ shop ก่อนอ่านค่า (กัน TypeError ถ้า shop = null)
  if (!shop || !shop.status) {
    console.log('ร้านปิดการทำงาน');
    return;
  }

  const bonusTimeStatus = shop.statusBonusTime;
  const PasswordStatus = shop.statusPassword;

  if (event.timestamp < programStartTime) {
    return;
  }

  if (event.type === "message" && event.message.type === "text") {
    if (shop.statusBot === true) {
      await handleTextEvent(event, client, prefix, linename, accessToken, baseURL, bonusTimeStatus, PasswordStatus);
    } else {
    }
    return;
  }

  if (event.type === "message" && event.message.type === "image") {
    await handleImageEvent(event, client, prefix, linename, accessToken, baseURL);
    return;
  }
}

function clearUserTimeout(userId) {
  if (waitTimeouts.has(userId)) {
    clearTimeout(waitTimeouts.get(userId));
    waitTimeouts.delete(userId);
  }
}

function clearUserMessageHistory(userId) {
  if (userMessageHistory.has(userId)) {
    userMessageHistory.delete(userId);
  }
}

function getTime() {
  const now = dayjs().tz('Asia/Bangkok');
  return now.hour() * 60 + now.minute();
}

function setUserSentImage(userId) {
  usersWhoSentImage.set(userId, Date.now());
  setTimeout(() => usersWhoSentImage.delete(userId), 30 * 60 * 1000);
}

function hasUserSentImage(userId) {
  return usersWhoSentImage.has(userId);
}

function setUserSentAnyTextisnotoffensive(userId) {
  usersWhoSentAnyTextisnotoffensive.set(userId, Date.now());
  setTimeout(() => usersWhoSentAnyTextisnotoffensive.delete(userId), 20 * 60 * 1000);
}

function hasUserSentAnyTextisnotoffensive(userId) {
  return usersWhoSentAnyTextisnotoffensive.has(userId);
}

function setUserSentAnyText(userId) {
  usersWhoSentAnyText.set(userId, Date.now());
  setTimeout(() => usersWhoSentAnyText.delete(userId), 5 * 60 * 1000);
}

function hasUserSentAnyText(userId) {
  return usersWhoSentAnyText.has(userId);
}

function setBotSentGreeting(userId) {
  usersBotSentGreeting.set(userId, Date.now());
  setTimeout(() => usersBotSentGreeting.delete(userId), 10 * 60 * 1000);
}

function hasBotSentGreeting(userId) {
  return usersBotSentGreeting.has(userId);
}

function setUserSentComplain(userId) {
  usersWhoSentComplain.set(userId, Date.now());
  setTimeout(() => usersWhoSentComplain.delete(userId), 20 * 60 * 1000);
}

function hasUserSentComplain(userId) {
  return usersWhoSentComplain.has(userId);
}


function setBotSentComplain(userId) {
  usersBotSentComplain.set(userId, Date.now());
  setTimeout(() => usersBotSentComplain.delete(userId), 10 * 1000);
}

function hasBotSentComplain(userId) {
  return usersBotSentComplain.has(userId);
}

function setBotSentOffensive(userId) {
  usersBotSentOffensive.set(userId, Date.now());
  setTimeout(() => usersBotSentOffensive.delete(userId), 10 * 1000);
}

function hasBotSentOffensive(userId) {
  return usersBotSentOffensive.has(userId);
}

function setUserSentOffensive(userId) {
  usersWhoSentOffensive.set(userId, Date.now());
  setTimeout(() => usersWhoSentOffensive.delete(userId), 5 * 60 * 1000);
}

function hasUserSentOffensive(userId) {
  return usersWhoSentOffensive.has(userId);
}

function setUserSentAnyTextisnotGreeting(userId) {
  usersWhoSentAnyTextisnotGreeting.set(userId, Date.now());
  setTimeout(() => usersWhoSentAnyTextisnotGreeting.delete(userId), 15 * 60 * 1000);
}

function hasUserSentAnyTextisnotGreeting(userId) {
  return usersWhoSentAnyTextisnotGreeting.has(userId);
}

function setUserSentWithdraw(userId) {
  usersWhoSentWithdraw.set(userId, Date.now());
  setTimeout(() => usersWhoSentWithdraw.delete(userId), 60 * 60 * 1000);
}

function hasUserSentWithdraw(userId) {
  return usersWhoSentWithdraw.has(userId);
}

function setUserSentNormalImage(userId) {
  usersWhoSentNormalImage.set(userId, Date.now());
  setTimeout(() => usersWhoSentNormalImage.delete(userId), 15 * 60 * 1000);
}

function hasUserSentNormalImage(userId) {
  return usersWhoSentNormalImage.has(userId);
}

function setUserSentSlip(userId) {
  usersWhoSentSlip.set(userId, Date.now());
  setTimeout(() => usersWhoSentSlip.delete(userId), 15 * 60 * 1000);
}

function hasUserSentSlip(userId) {
  return usersWhoSentSlip.has(userId);
}

function hasUserSentRewardImage(userId) {
  return usersWhoSentRewardImage.has(userId);
}

function setUserSentRewardImage(userId) {
  usersWhoSentRewardImage.set(userId, Date.now());
  setTimeout(() => usersWhoSentRewardImage.delete(userId), 15 * 60 * 1000);
}

function hasUserSentLossAmountImage(userId) {
  return usersWhoSentLossAmountImage.has(userId);
}

function setUserSentLossAmountImage(userId) {
  usersWhoSentLossAmountImage.set(userId, Date.now());
  setTimeout(() => usersWhoSentLossAmountImage.delete(userId), 15 * 60 * 1000);
}

function hasBotSentThank(userId) {
  return botSentThank.has(userId);
}

function setBotSentThank(userId) {
  botSentThank.set(userId, Date.now());
  setTimeout(() => botSentThank.delete(userId), 1 * 60 * 1000);
}

function hasBotEndSituation(userId) {
  return BotEndSituation.has(userId);
}

function setBotEndSituation(userId) {
  BotEndSituation.set(userId, Date.now());
  setTimeout(() => BotEndSituation.delete(userId), 15 * 60 * 1000);
}

function hasUserSentSentActivity(userId) {
  return usersWhoSentActivity.has(userId);
}

function setUserSentActivity(userId) {
  usersWhoSentActivity.set(userId, Date.now());
  setTimeout(() => usersWhoSentActivity.delete(userId), 30 * 60 * 1000);
}

function isWithin1min(userId) {
  const ts = usersWhoSentSlip.get(userId);
  if (!ts) return false;
  return (Date.now() - ts) < (1 * 60 * 1000);
}

function isWithin15min(userId) {
  const ts = usersWhoSentSlip.get(userId);
  if (!ts) return false;
  return (Date.now() - ts) < (15 * 60 * 1000);
}

function clearUserSentSlip(userId) {
  usersWhoSentSlip.delete(userId);

  if (slipTimeouts.has(userId)) {
    clearTimeout(slipTimeouts.get(userId));
    slipTimeouts.delete(userId);
  }
}

function setBotSentAskinfo(userId) {
  userHasAskinfo.set(userId, Date.now());
  setTimeout(() => userHasAskinfo.delete(userId), 10 * 60 * 1000);
}

function hasBotSentAskInfo(userId) {
  return userHasAskinfo.has(userId);
}

function setBotSentReplyWait(userId) {
  userHasReplyWait.set(userId, Date.now());
  setTimeout(() => userHasReplyWait.delete(userId), 15 * 60 * 1000);
}

function hasBotSentReplyWait(userId) {
  return userHasReplyWait.has(userId);
}

function setBotSentReplyWaitSlip(userId) {
  userHasReplyWait.set(userId, Date.now());
  setTimeout(() => userHasReplyWait.delete(userId), 3 * 60 * 1000);
}

function hasBotSentReplyWaitSlip(userId) {
  return userHasReplyWait.has(userId);
}

function setBotSentInfo(userId) {
  userInfoSent.set(userId, Date.now());
  // ลบออกอัตโนมัติภายใน 1 วัน (24 ชั่วโมง)
  setTimeout(() => userInfoSent.delete(userId), 24 * 60 * 60 * 1000);
}

// ฟังก์ชันตรวจสอบว่าบอทส่ง info ให้ userId นี้ไปแล้ววันนี้หรือยัง
function hasSentInfo(userId) {
  return userInfoSent.has(userId);
}

export {
  handleEvent,
  clearUserTimeout,
  clearUserMessageHistory,
  getTime,
  setUserSentAnyText,
  hasUserSentAnyText,
  setUserSentAnyTextisnotoffensive,
  hasUserSentAnyTextisnotoffensive,
  setUserSentAnyTextisnotGreeting,
  hasUserSentAnyTextisnotGreeting,
  setBotSentGreeting,
  hasBotSentGreeting,
  setUserSentComplain,
  hasUserSentComplain,
  setBotSentComplain,
  hasBotSentComplain,
  hasBotSentOffensive,
  setBotSentOffensive,
  hasUserSentOffensive,
  setUserSentOffensive,
  hasUserSentWithdraw,
  setUserSentWithdraw,
  hasUserSentNormalImage,
  setBotSentInfo,
  hasSentInfo,
  setBotSentReplyWait,
  hasBotSentReplyWait,
  setBotSentReplyWaitSlip,
  hasBotSentReplyWaitSlip,
  setBotSentAskinfo,
  hasBotSentAskInfo,
  setUserSentNormalImage,
  isWithin1min,
  isWithin15min,
  hasUserSentImage,
  setUserSentSlip,
  hasUserSentSlip,
  setUserSentImage,
  setUserSentRewardImage,
  hasUserSentRewardImage,
  setUserSentLossAmountImage,
  hasUserSentLossAmountImage,
  setUserSentActivity,
  hasUserSentSentActivity,
  setBotSentThank,
  hasBotSentThank,
  setBotEndSituation,
  hasBotEndSituation,
  clearUserSentSlip,
  waitTimeouts,
  userMessageHistory
};