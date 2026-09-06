# utils/ — CLAUDE.md

## Function Reference

### settingsManager.js
```js
loadSettings()              // โหลดจาก MongoDB → cache
saveSettings(data)          // บันทึก + update cache
getCachedSettings()         // อ่าน cache (sync, ไม่ต้อง await)
reloadSettings()            // force reload จาก DB
```
ใช้ `getCachedSettings()` เมื่อต้องการค่าในระหว่าง request — เร็วกว่า query DB ทุกครั้ง

### slipResultManager.js
```js
loadSlipResults()                    // 24h, max 100, sort DESC
saveSlipResults(slipObj)             // บันทึกลง MongoDB
reportResultToAPI(baseURL, result)   // POST /api/slip-results → trigger SSE broadcast
removeOldSlips()                     // ลบ records เก่ากว่า 24h
```

### userQueueManager.js
```js
addToUserQueue(userId, taskFn)  // returns false ถ้า user busy (ignore งานใหม่)
finishUserTask(userId)          // เรียกใน finally block เสมอ
```
ป้องกัน concurrent slip processing ต่อ user — ใช้ในทุก image handler

### accountUtils.js
```js
getBankAccounts(prefix)         // ดึง active bank accounts ของ prefix
```

### bankCodeMapping.js
```js
getBankName(code)               // "014" → "ธนาคารไทยพาณิชย์"
```
mapping รหัสธนาคาร 3 หลัก → ชื่อภาษาไทย

### savePhoneNumber.js
```js
checkAndSavePhoneNumber(userId, phoneNumber, prefix)    // insert ถ้าไม่มี
checkAndUpdatePhoneNumber(userId, phoneNumber, prefix)  // upsert
```

### getLineProfile.js
```js
getLineProfile(userId, accessToken, client)  // → { displayName, phoneNumber }
```
- ถ้ามี Phone record จะคืน `phoneRecord.user` (รหัส prefix+เบอร์) แทนชื่อไลน์จริง
- `client` = healing client จาก `lineToken.js` (ไม่บังคับ) — ส่งมาเพื่อให้ heal 401 ได้

### lineToken.js — จัดการ LINE access token
```js
issueChannelToken(channelId, secret)        // ออก token ใหม่ผ่าน client_credentials
createHealingClient({prefix, linename, channelId, secret, token})
                                           // client ที่เจอ 401 แล้ว refresh + retry เอง
refreshAllShopTokens()                     // วน refresh ทุกร้านทุก line
startTokenRefreshScheduler()               // ตั้ง auto-refresh ทุก 4 วัน + catch-up ตอน start
markLineTokenError({prefix, channelId, linename, reason})   // ตั้ง flag + แจ้งเตือน
clearLineTokenError({prefix, channelId})   // ล้าง flag เมื่อกลับมาปกติ
setLineWebhookError({prefix, channelId, bad})  // ธง webhook (แยกจาก token — ดู models/CLAUDE.md)
```

> **สำคัญ:** token ที่ระบบใช้ออกจาก `/v2/oauth/accessToken` (client_credentials)
> **ไม่ใช่** long-lived token จากหน้า console — มันหมดอายุ จึงต้องมี auto-refresh
> เก็บเวลา refresh ล่าสุดใน `settings` key `token-refresh-meta` (กัน Render restart แล้วยิงขอรัวๆ)

`createHealingClient` ถูกสร้างครั้งเดียวใน webhook handler (`index.js`) แล้วส่งลงทุก handler
→ ทุก `replyMessage` / `pushMessage` / `getMessageContent` / `getProfile` heal 401 อัตโนมัติ

### notificationStore.js — การแจ้งเตือนระบบ
```js
addNotification({level, category, title, message, prefix, linename, channelId, key})
listNotifications(limit)    // อ่านจาก memory
unreadCount() / markAllRead() / clearNotifications()
resolveNotification(key)    // ลบเมื่อปัญหาถูกแก้แล้ว
loadNotificationsFromDB()   // กู้กลับเข้า memory ตอน start
```
- **เก็บใน memory เป็นหลัก** + persist ลง MongoDB แบบ best-effort
- เหตุผล: ต้องแจ้งเตือน "MongoDB ล่ม" ได้ตอน MongoDB ล่ม (ตอนนั้นเขียน DB ไม่ได้)
- `key` ใช้กันแจ้งซ้ำ — key เดิมภายใน 5 นาที จะรวมเป็นรายการเดียวแล้วเพิ่ม `count`

### auditLog.js — ประวัติ "ใครกดอะไร"
```js
buildAuditEntry(req, res)    // สร้างรายการบันทึกจาก request (เรียกตอน res "finish")
recordAudit(entry)           // ใส่ buffer แล้ว insertMany ทุก 1.5 วิ หรือครบ 30 รายการ
listAudit({q, username, action, from, to, skip, limit})   // อ่านประวัติ + นับทั้งหมด
auditFilterOptions()         // ชื่อผู้ใช้ / ประเภทการกระทำ ที่มีอยู่จริง (ไว้ทำ dropdown)
flushAudit()                 // เขียนของค้างให้หมด (เรียกตอน SIGINT/SIGTERM)
AUDIT_ACTIONS                // แคตตาล็อก path → { action, label, target(), detail(), resolve() }
AUDIT_SKIP                   // path ที่ไม่ต้องบันทึก (บอทเขียนเอง / แค่ค้นหา)
EXTRA_ACTION_LABELS          // ชื่อไทยของ action ที่เกิดจาก resolve() (ไว้ทำ dropdown)
```

**ดักที่ middleware ตัวเดียวใน `index.js`** (หลัง `express.json()`) ไม่ได้ไปผูก onclick ทุกปุ่ม
เพราะครอบคลุมอัตโนมัติ (เพิ่ม route ใหม่ก็ถูกบันทึกทันที) และ client ปลอมไม่ได้

> **ความปลอดภัย:** `buildAuditEntry` อ่านเฉพาะฟิลด์ที่ระบุไว้ในแคตตาล็อกเท่านั้น
> ถ้าจะสรุปทั้ง body ให้ใช้ `safeSummary()` — มันตัดคีย์ที่มีคำว่า
> password / token / secret ทิ้งก่อนเสมอ **ห้ามใช้ `JSON.stringify(body)` ตรงๆ**
> (เคยพลาดที่ `/api/settings` แล้ว `apiKey` หลุดลง DB — เจอจากเทสต์ก่อนขึ้นจริง)

เพิ่ม route ใหม่แล้วอยากให้ชื่อสวย → เพิ่มลง `AUDIT_ACTIONS`
ถ้าไม่เพิ่มก็ยังบันทึกอยู่ แต่ `label` จะเป็น path ดิบ

**route เดียวทำได้หลายอย่าง** ใช้ `resolve(body)` คืน `{ action, label }` มาทับ
เช่น `/api/update-shop` เป็นได้ทั้ง "แก้ไขร้านค้า" (ส่ง `name`) และ
"เปิด/ปิดบอทของร้าน" (ส่ง `status`) — แยก action แล้วกรองแยกกันได้ในหน้าประวัติ

> action ที่เกิดจาก `resolve()` **ต้องใส่ชื่อไทยใน `EXTRA_ACTION_LABELS` ด้วย**
> ไม่งั้น dropdown ตัวกรองจะโชว์เป็นคีย์ดิบ (`auditFilterOptions` อ่านชื่อจาก
> แคตตาล็อกซึ่งไม่มี action ตัวนั้นเป็น key)

### customerStore.js
```js
recordCustomer({userId, prefix, linename, displayName, accessToken, client})
updateCustomerPhone(userId, phoneNumber, prefix)
```
ถ้า record ยังไม่มี `displayName` และมี client/accessToken → ดึงชื่อจาก LINE แล้วอัปเดตกลับ

### qrData.js
```js
parseQrData(qrString)   // แยก payload จาก QR string ของสลิป
```

### qrSlipworker.js
```js
// จัดการ QR slip workflow ใน text context
// เรียกจาก handlers/textBot/textUtils/qrSlipworker.js
```

## Gotchas

- `broadcastLog()` import จาก `"../index.js"` — circular dependency ที่ตั้งใจ (ES Module จัดการได้)
- `settingsManager` cache อยู่ใน module scope — reload เมื่อ settings เปลี่ยนใน `/api/settings` POST
