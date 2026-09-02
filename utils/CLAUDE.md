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
