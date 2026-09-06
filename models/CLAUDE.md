# models/ — CLAUDE.md

## Schema Overview

ทุก model ใช้ Mongoose + ES Modules (`export default mongoose.model(...)`)

## Shop.js — หลัก

```js
{
  name: String,
  prefix: String,           // "ABC" — key สำคัญ ใช้ตลอด
  lines: [{                 // LINE OA accounts
    linename: String,
    channel_id: String,
    access_token: String,
    secret_token: String,
    main: Boolean,
    tokenError: Boolean,    // true = ขอ access token ไม่สำเร็จ (ไลน์หลุด/ถูกระงับ)
    tokenErrorAt: Date,     // เวลาที่เจอปัญหาล่าสุด
  }],
  bonusImage: {
    image1: { data: Buffer, contentType: String },
    image2: { data: Buffer, contentType: String },
  },
  passwordImage: { data: Buffer, contentType: String },
  status: Boolean,          // shop เปิด/ปิด
  statusBot: Boolean,       // text bot เปิด/ปิด
  statusWithdraw: Boolean,
  statusBonusTime: Boolean, // ต้องมีรูปใน bonusImage ก่อนจึงจะ enable ได้
  statusPassword: Boolean,
  slipCheckOption: String,  // "duplicate" หรืออื่นๆ
  registerlink: String,
  loginlink: String,
}
```

> **Gotcha:** `bonusImage` เก็บ 2 รูป (image1/image2) — ไม่ใช่ single `data` อีกต่อไป
> เมื่อ query `shop.bonusImage?.image1?.data` ไม่ใช่ `shop.bonusImage?.data`

> **Gotcha สำคัญมาก — ห้าม `Shop.find()` โดยไม่ใส่ projection**
> `bonusImage` + `passwordImage` ฝังอยู่ในเอกสารร้าน รวมทุกร้าน ~5 MB
> `Shop.find({})` ใช้เวลา **~40 วินาที** จนเกิด `MongoNetworkTimeoutError` ตอน startup
> ถ้าต้องการรายชื่อร้าน ให้ใส่ `{ bonusImage: 0, passwordImage: 0 }` เสมอ
> ถ้าต้องการร้านเดียว ใช้ `Shop.findOne({ prefix })` (~50 ms)

## Customer.js

```js
{ userId, prefix, linename, displayName, phoneNumber, user }  // timestamps: true
```
ลูกค้า "ทุกคน" ที่ทักเข้ามา (ไม่ว่ามีเบอร์หรือไม่) — key = `userId` ไม่ซ้ำ
จัดการผ่าน `utils/customerStore.js`

## Notification.js

```js
{ key, level, category, title, message, prefix, linename, channelId, count, read, createdAt }
```
- `level`: `error` | `warn` | `info`
- `category`: `line_token` | `system`
- `key`: ใช้กันแจ้งซ้ำ เช่น `line_token:2007225467`, `system:mongo_disconnected`
- `createdAt` มี TTL 30 วัน (ลบอัตโนมัติ)
- อ่าน/เขียนผ่าน `utils/notificationStore.js` เท่านั้น (memory-first)

## BankAccount.js

```js
{ prefix: String, bankName: String, accountNumber: String, accountName: String, active: Boolean }
```
Group by prefix — 1 prefix มีได้หลาย bank accounts

## Phone.js

```js
{ userId: String, phoneNumber: String, prefix: String }
```
Maps LINE userId ↔ phone ↔ prefix

## Prefix.js

```js
{ prefix: String }
```
Registry ของ prefix ที่ valid — ต้องมีก่อนจึงจะสร้าง Shop ได้

## SlipResult.js

```js
{ prefix, amount, bank, accountNumber, transactionId, timestamp, status, createdAt }
```
- เก็บไว้ 24h, max 100 รายการ
- `createdAt` มี TTL index (auto-delete)

## Temp.js

```js
{ username: String, password: String, role: String }
```
roles: `"OWNER"` | `"ADMIN"` | `"MARKETING"`

## QrEntry.js

```js
{ qrId: String, prefix: String, createdAt: Date }
```
dedup QR code — ป้องกันสลิปซ้ำ

## Setting.js

```js
{ key: "global-settings", value: { timeLimit, sameQrTimeLimit, maxMessagesPerUser, ... } }
```
load/save ผ่าน `utils/settingsManager.js` เท่านั้น — ไม่ query โดยตรง

## lineSendingImage.js

```js
{ sessionId: String, data: Buffer, contentType: String, createdAt: Date }
```
temp storage สำหรับรูปที่ admin จะส่งผ่าน LINE — ลบเมื่อ session end

## Shop.js — ธงสถานะของแต่ละไลน์

```js
lines: [{
  tokenError,   tokenErrorAt,     // ขอ access token ไม่สำเร็จ
  webhookError, webhookErrorAt,   // Webhook URL ไม่ตรง / LINE ยิงมาไม่ถึง
}]
```
ไฟแดงหน้าชื่อไลน์ = `tokenError || webhookError`

> **ต้องแยกเป็นสองธง** — `startTokenRefreshScheduler()` ต่ออายุ token ทุก 4 วัน
> แล้วเรียก `clearLineTokenError()` ถ้ารวมเป็นธงเดียว ไฟแดงของ webhook จะหายเอง
> ทั้งที่ยังตั้งผิดอยู่ (ตัวต่ออายุไม่รู้เรื่อง webhook เลย)

## Log.js

```js
{ ts: Date, text: String }
```
log การใช้งานของบอท — TTL index บน `ts` ลบเองเมื่อเกิน **3 วัน**
เขียนผ่าน buffer ใน `index.js` (`queueLogWrite`) ไม่ได้เขียนตรง

## AuditLog.js

```js
{
  ts, username, role,
  action,          // คีย์ เช่น "shop.delete" — ใช้กรอง
  label,           // ข้อความไทยที่แสดง เช่น "ลบร้านค้า"
  target, detail,  // เป้าหมาย (prefix/ชื่อผู้ใช้) + รายละเอียด
  method, path, status, ok, ip
}
```
ประวัติ "ใครกดอะไร" — TTL index บน `ts` ลบเองเมื่อเกิน **90 วัน**
เขียนผ่าน `utils/auditLog.js` เท่านั้น (มี buffer + ตัวกรองข้อมูลลับ)

> **ห้ามเขียนตรงจากที่อื่น** — ต้องผ่าน `recordAudit()` ไม่งั้นข้อมูลลับ
> (รหัสผ่าน / access_token / secret_token) อาจหลุดลงฐานข้อมูล

