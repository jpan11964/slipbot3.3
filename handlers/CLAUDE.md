# handlers/ — CLAUDE.md

## ภาพรวม

จัดการ LINE events ทั้งหมด: รูปภาพ (slip) และข้อความ (text bot)

## Event Flow

```
LINE Webhook (index.js)
  → handleEvent(event, client, prefix, linename, accessToken, baseURL)
      → event.type === "message" && type === "text"  → handleTextEvent()
      → event.type === "message" && type === "image" → handleImageEvent()
```

## State Maps (handleEvent.js) — in-memory, รีเซตทุกครั้งที่ restart

| Map | TTL | ความหมาย |
|-----|-----|---------|
| `usersWhoSentSlip` | 5 min | ส่งสลิปแล้วรอผล |
| `usersWhoSentImage` | 5 min | ส่งรูปแล้ว |
| `usersWhoSentNormalImage` | 5 min | รูปทั่วไป (ไม่ใช่สลิป) |
| `usersWhoSentComplain` | 30 min | ร้องเรียนอยู่ |
| `usersWhoSentOffensive` | 1 h | พฤติกรรมไม่เหมาะสม |
| `userMessageHistory` | 15 min | ประวัติข้อความสำหรับ GPT context |
| `waitTimeouts` | dynamic | setTimeout refs สำหรับ cancel |
| `BotEndSituation` | 1 h | บอทจบการสนทนาแล้ว |

> **สำคัญ:** ทุก Map ต้องใช้ `setTimeout` cleanup เสมอ — ห้ามเพิ่ม Map ใหม่โดยไม่มี TTL

## Functions ที่ export จาก handleEvent.js

handleText.js import helper functions เหล่านี้จาก handleEvent.js:
- `hasUserSentSlip(userId)` / `hasUserSentImage(userId)` — เช็ค state
- `setUserSent*(userId)` — set state พร้อม setTimeout
- `clearUserTimeout(userId)` — cancel pending timeout
- `isWithin15min(userId)` / `isWithin1min(userId)` — time checks
- `clearUserMessageHistory(userId)` — ล้าง GPT history

## Slip Verification (handlers/Image/)

### handleRegularSlip.js — main logic
1. รับ image buffer จาก LINE
2. ลอง jsQR decode QR code จากรูป
3. ถ้ามี QR → ส่งไปยัง Slip2Go API (`slipService.js`)
4. ถ้าไม่มี QR → OCR ด้วย tesseract.js (fallback)
5. ตรวจ: บัญชี, ยอดเงิน (>= MINIMUM_AMOUNT), วันที่ (ไม่เก่าเกิน), ซ้ำหรือไม่

### slipService.js
- endpoint: `POST https://connect.slip2go.com/api/verify-slip/qr-image/info`
- timeout: `Promise.race` 25 วินาที
- ECONNRESET → treat as timeout

### slipCheckOption values
- `"duplicate"` — ตรวจซ้ำเท่านั้น (สลิปเดิมส่งซ้ำ)
- อื่นๆ — ตรวจทุกอย่าง (บัญชี, ยอด, วันที่)

## Text Bot (handlers/textBot/)

### การทำงาน
1. `keywords.js` → ลอง match keyword ก่อน
2. ถ้า match → ส่ง reply จาก JSON ใน `reply/`
3. ถ้าไม่ match → `gptCategorizer.js` → GPT-4o-mini
4. GPT return category → หา reply จาก `reply/`

### textUtils/
- `keywords.js` — `detectCategory(text)` → returns category string หรือ null
- `gptCategorizer.js` — `askGPT(messages)` + `categorizeFromGptReply(reply)`
- `reply.js` — `getRandomReplyFromFile(category)`, `getBonustimeReply()`, `getPasswordReply()`
- `userCategoryMemory.js` — `saveCategoryForUser()`, `hasCategory()`, `shouldReplyCategory()`
- `qrSlipworker.js` — จัดการ QR slip ที่ส่งมาใน text context

### เพิ่ม keyword/reply category ใหม่
1. สร้าง `keywords/{category}.json` — array of Thai strings
2. สร้าง `reply/{category}.json` — array of Thai response strings
3. เพิ่ม case ใน `gptCategorizer.js` categories list
4. เพิ่ม handler ใน `handleText.js`

## ลำดับด่านใน `handleEvent()` (ห้ามสลับ)

```
1. Shop.findOne({ prefix })          ← อ่านสดทุกอีเวนต์ ไม่ใช้ cache
                                        กดสวิตช์เปิด/ปิดบอทจึงมีผลกับข้อความถัดไปทันที
2. if (!shop || !shop.status) return  ← ปิดบอท = หยุดทุกอย่าง เงียบ ไม่ตอบลูกค้า
3. recordCustomer()                   ← ต้องอยู่ "หลัง" ข้อ 2 เสมอ
                                        ไม่งั้นร้านที่ปิดอยู่ยังเก็บลูกค้าใหม่เรื่อยๆ
4. if (event.timestamp < programStartTime) return
                                      ← ข้อความช่วง server ดับ ถูกทิ้งหลัง restart
5. text  → ต้องมี shop.statusBot === true ถึงจะเข้า handleTextEvent
   image → เข้า handleImageEvent เลย (ไม่มีด่านสถานะเพิ่ม)
```

`statusBonusTime` / `statusPassword` ส่งต่อเข้า `handleTextEvent` เพื่อคุมเฉพาะหมวดนั้น

