# SlipBot 3.3 — CLAUDE.md

## Project Overview

Multi-shop LINE Bot ตรวจสลิปการโอนเงิน พร้อมระบบ Text Bot อัตโนมัติ และ Dashboard ควบคุมผ่านเว็บ

**Stack:** Node.js 18.x (ES Modules), Express 4, MongoDB/Mongoose, LINE Bot SDK v7, OpenAI GPT-4o-mini

---

## Commands

```bash
# Development
npm run dev    # nodemon --exec "node --dns-result-order=ipv4first" index.js

# Production
npm start      # node --dns-result-order=ipv4first index.js
```

**No build step required.** Project uses native ES Modules (`"type": "module"` in package.json).

> **Note:** `--dns-result-order=ipv4first` แก้ปัญหา `querySrv ECONNREFUSED` ของ MongoDB SRV บน Windows — ห้ามลบ flag นี้

---

## Environment

Config file: **`info.env`** (not `.env`) — loaded manually via dotenv at the top of each file.

```
SLIPOK_API_KEY=       # SlipOK API key (backup slip checker)
SLIP2GO_API_KEY=      # Slip2Go API key (primary slip checker)
BRANCH_ID=            # Branch ID สำหรับ SlipOK
PORT=2639             # default 5000
MINIMUM_AMOUNT=10     # ยอดขั้นต่ำสลิป (บาท)
URL=                  # webhook base URL (ngrok หรือ production domain)
MONGODB_URI=          # MongoDB Atlas SRV connection string
SESSION_SECRET=       # express-session secret
OPENAI_API_KEY=       # GPT-4o-mini fallback
```

---

## Architecture

### Entry Point — `index.js`
- Express server, session auth, SSE endpoints (`/events`, `/api/logs`)
- Dynamically registers LINE webhook routes on startup: `/webhook/{prefix}/{channelId4digits}.bot`
- `setupWebhooks()` / `restartWebhooks()` — called after any shop/LINE account change
- Exports: `broadcastLog()`, `broadcastPhoneUpdate()`, `getBankAccounts()`, `loadBankAccounts()`

### MongoDB Connection — `mongo.js`
- ใช้ `dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])` ก่อน connect — **เฉพาะ Windows เท่านั้น**
  (ครอบด้วย `if (process.platform === "win32")`) แก้ปัญหา c-ares resolve SRV ของ Atlas ไม่ได้บน Windows
- **ห้ามเปิดใช้บน production (Linux/Render)** — บังคับ DNS ภายนอกโดยไม่จำเป็น เสี่ยง resolve node ของ Atlas เพี้ยน
- Auto-reconnect เมื่อ disconnected + ยิงการแจ้งเตือนระบบเมื่อ connect fail / disconnected / error

### Event Flow
```
LINE Webhook → handleEvent.js → handleImageEvent (slip) OR handleTextEvent (text bot)
```

### Slip Verification — `handlers/Image/`
- `handleImage.js` — receives LINE image message, routes to slip handler
- `handleRegularSlip.js` — main slip processing logic
- `slipService.js` — calls Slip2Go API (`https://connect.slip2go.com/api/verify-slip/qr-image/info`)
- Also uses `jsqr` for QR decode and `tesseract.js` for OCR fallback
- Slip check modes: `"duplicate"` or other options stored per-shop in `slipCheckOption`

### Text Bot — `handlers/textBot/`
- `textUtils/keywords.js` — keyword matching against JSON files in `keywords/`
- `textUtils/gptCategorizer.js` — falls back to GPT-4o-mini (model: `gpt-4o-mini`) when keywords don't match
- `textUtils/reply.js` — sends reply from JSON files in `reply/`
- `textUtils/userCategoryMemory.js` — remembers last category per user
- `textUtils/qrSlipworker.js` — handles QR slip flows in text context

### State Management (in-memory, `handleEvent.js`)
All user state is stored in `Map` objects with `setTimeout` TTLs. No persistence — resets on server restart.
Key maps: `usersWhoSentSlip`, `usersWhoSentImage`, `userMessageHistory`, `waitTimeouts`, etc.

---

## Data Models (`models/`)

| Model | Purpose |
|---|---|
| `Shop.js` | Shop config: name, prefix, lines (LINE accounts), images, feature flags |
| `BankAccount.js` | Bank accounts grouped by prefix |
| `Phone.js` | Maps LINE userId ↔ phone number ↔ prefix |
| `Prefix.js` | Valid prefixes (must exist before adding a shop) |
| `SlipResult.js` | Slip check history (kept 24h, max 100) |
| `Setting.js` | Global settings (timeLimit, sameQrTimeLimit, etc.) |
| `Temp.js` | Credentials (OWNER, ADMIN, MARKETING users) |
| `QrEntry.js` | QR code dedup tracking |
| `lineSendingImage.js` | Temp image storage for admin send-message feature |
| `Customer.js` | ลูกค้าทุกคนที่ทักเข้ามา (userId, prefix, linename, displayName, phone) |
| `Notification.js` | การแจ้งเตือนระบบ (TTL 30 วัน) — ใช้ผ่าน `utils/notificationStore.js` |

### Shop Schema Key Fields
```js
{
  prefix: String,        // e.g. "ABC" — used as shop identifier
  lines: [{              // LINE OA accounts
    linename, channel_id, access_token, secret_token,
    tokenError,          // true = ขอ access token ไม่สำเร็จ (แสดงเครื่องหมายแดงหน้าชื่อไลน์)
    tokenErrorAt,
  }],
  status: Boolean,       // shop on/off
  statusBot: Boolean,    // text bot on/off
  statusWithdraw: Boolean,
  statusBonusTime: Boolean,
  statusPassword: Boolean,
  slipCheckOption: String,
  bonusImage: {
    image1: { data: Buffer, contentType: String },  // BonusTime รูปที่ 1
    image2: { data: Buffer, contentType: String },  // BonusTime รูปที่ 2
  },
  passwordImage: { data: Buffer, contentType: String },
}
```

---

## API Routes (all in `index.js`)

### Auth
- `GET /login`, `POST /login`, `GET /logout`
- Roles: **OWNER**, **ADMIN**, **MARKETING** (stored in `Temp` collection)
- Session cookie: 24h

### Shop Management
- `GET/POST /api/shops`, `/api/add-shop`, `/api/update-shop`, `/api/delete-shop`
- `/api/add-line`, `/api/update-line`, `/api/delete-line`

### Bank Accounts
- `GET /api/bank-accounts`, `POST /api/add-bank`, `/api/edit-bank`, `/api/update-bank-status`, `/api/delete-bank`

### Slip Results
- `GET /api/slip-results` — last 100 results within 24h
- `POST /api/slip-results` — save + broadcast via SSE

### Feature Toggles
- `/api/update-bonusTime-status`, `/api/update-password-status`
- `/api/update-textbot-status`, `/api/update-withdraw-status`
- `/api/update-slip-option`

### Images
- `POST /api/upload-bonus-image` — อัปโหลดรูป BonusTime (sequential: image1 → image2)
- `POST /api/upload-change-bonus-image` — เปลี่ยนรูปเฉพาะ slot (body: `{ prefix, index: "1"|"2" }`)
- `GET /api/get-bonus-image?prefix=X&index=1|2` — serve optimized (600px, q70)
- `GET /api/get-bonus-image-original?prefix=X&index=1|2` — serve raw buffer
- `POST /api/delete-bonus-image` — ลบเฉพาะ slot (`{ prefix, index }`) หรือลบทั้งหมด (`{ prefix }`)
- `/api/upload-password-image`, `/api/get-password-image`, `/api/delete-password-image`

### Messaging
- `POST /api/send-message` — push text/image to LINE user via matching shop OA
- `POST /api/upload-send-image-line` — temp upload before sending

### Settings
- `GET/POST /api/settings` — global settings via `settingsManager.js`

### Notifications
- `GET /api/notifications` — รายการแจ้งเตือน + จำนวนที่ยังไม่อ่าน
- `POST /api/notifications/read` — ทำเครื่องหมายอ่านทั้งหมด
- `POST /api/notifications/clear` — ล้างทั้งหมด
- `POST /api/notifications/test` — สร้างแจ้งเตือนปลอมไว้ทดสอบ UI

> ทุก endpoint ต้องผ่าน `isAuthenticated` + สิทธิ์ sidebar `"notifications"` (OWNER ผ่านเสมอ)

### LINE Helpers
- `POST /api/get-access-token` — exchange channelId+secret for access token
- `POST /api/set-webhook` — set LINE webhook URL

---

## Webhook Routing

Each LINE account gets a unique route:
```
POST /webhook/{prefix}/{last4digitsOfChannelId}.bot
```

Signature verification is done by computing HMAC-SHA256 of the raw body and injecting it into the `x-line-signature` header before the LINE SDK middleware checks it.

---

## Reply System

### Keywords (`handlers/textBot/keywords/*.json`)
JSON arrays of Thai keyword patterns per category. Matched against incoming text.

### Replies (`handlers/textBot/reply/*.json`)
JSON arrays of response strings per category. One is picked and sent to user.

### Categories (mapped in `gptCategorizer.js`)
`greeting`, `deposit_missing`, `deposit_error`, `register`, `withdraw_missing`, `complain_loss`, `offensive`, `bonus_time`, `password`, `link`, `trust_issue`, `game`, `loss_amount`, `turnover_question`, `turnover_total`, `free_credit`, `activity_play`, `activity_issue`, etc.

---

## Reply Modules (`reply/`)

| File | Purpose |
|---|---|
| `right_reply.js` | Slip verified correctly |
| `wrong_reply.js` | Slip invalid/wrong |
| `same_reply.js` | Duplicate slip detected |
| `minimum_reply.js` | Below minimum deposit amount |
| `oldpic_reply.js` | Slip image too old |
| `text_reply.js` | General text responses |

---

## Utilities (`utils/`)

- `settingsManager.js` — load/save/reload global settings from MongoDB
- `slipResultManager.js` — save slip results + broadcast
- `userQueueManager.js` — per-user processing queue to prevent concurrent slip handling
- `accountUtils.js` — bank account helpers
- `bankCodeMapping.js` — Thai bank code → name mapping
- `qrData.js` — QR code data parsing
- `qrSlipworker.js` — QR slip verification workflow (ใช้ใน text context)
- `savePhoneNumber.js` — save/update LINE userId ↔ phone mapping
- `getLineProfile.js` — fetch LINE user display name
- `lineToken.js` — ออก/ต่ออายุ LINE access token + healing client (จับ 401 แล้ว retry เอง)
- `notificationStore.js` — การแจ้งเตือนระบบ (memory-first + persist ลง DB)
- `customerStore.js` — บันทึก/อัปเดตลูกค้าใน collection `customers`
- `permissions.js` — นิยามสิทธิ์ทั้งหมด + `getUserPermissions(role, username)`

---

## Views (`views/`)

Multi-page SPA loaded via `/page/:name` (authenticated):
- `index.html` — shell with sidebar nav
- `main.html` — **shop/LINE/bank management** (เพิ่ม/แก้ไข/ลบ shop, LINE accounts, bank accounts, bonus images)
- `dashboard.html` — real-time slip results via SSE
- `settings.html` — **global system settings** (timeLimit, sameQrTimeLimit, maxMessages, etc.)
- `send-message.html` — push message to LINE users
- `logs.html` — real-time server logs via SSE `/api/logs`

### Frontend JavaScript (`views/js/`)
- `index.js` — app init, sidebar navigation, active state
- `main.js` — shop management UI (53KB+ — largest file)
- `dashboard.js` — slip results streaming
- `setting.js` — system settings form
- `send-message.js` — user lookup + message sending

---

## Frontend Design System (`views/css/`)

- **Fonts:** Google Fonts — Noto Sans Thai + Inter
- **Icons:** Bootstrap Icons 1.11.3 (CDN, ไม่ใช่ local)
- **CSS Variables** (defined in `shared.css`):
  - `--navy: #0c1628`, `--blue: #3b82f6`, `--bg: #f1f5f9`
  - `--green: #10b981`, `--red: #ef4444`, `--amber: #f59e0b`
  - `--sidebar-width: 260px`
- **ห้ามใช้ emojis ในทุก UI** — ใช้ Bootstrap Icons (`<i class="bi bi-...">`) แทนทั้งหมด
- CSS files: `shared.css`, `main.css`, `dashboard.css`, `send-message.css`, `settings.css`, `logs.css`, `bonusTimeImage.css`, `passwordImage.css`, `modal-notfound.css`, `editable-input.css`

---

## Important Patterns

1. **Webhook restart**: Any change to shop/LINE/bank data calls `restartWebhooks()` which clears and re-registers all webhook routes dynamically.

2. **Image processing**: All uploaded images are converted to JPEG via `sharp` before storage. Served images are resized (600px wide, quality 70) for LINE delivery.

3. **Timeout handling**: Slip2Go API calls use `Promise.race` with a 25s timeout. ECONNRESET is caught and treated as timeout.

4. **User state TTLs**: All in-memory Maps auto-expire entries via `setTimeout`. Common TTLs: 1min, 5min, 10min, 15min, 30min, 1h, 24h.

5. **GPT fallback**: Text categorization first tries keyword matching; only calls GPT-4o-mini if no keyword match is found.

6. **ES Modules**: All imports use `.js` extensions explicitly. `__dirname` is reconstructed via `fileURLToPath(import.meta.url)`.

7. **MongoDB DNS fix**: `mongo.js` ใช้ `dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1'])` ก่อน connect — แก้ปัญหา `querySrv ECONNREFUSED` ที่เกิดจาก Node.js c-ares บน Windows ไม่สามารถ resolve SRV record ได้ **ห้ามลบบรรทัดนี้**

8. **Dual BonusTime Image**: Each shop stores up to 2 bonus images (`image1`, `image2`) — upload is sequential (image1 first, then image2). Use `/api/upload-change-bonus-image` to replace a specific slot.

9. **ห้าม `Shop.find()` โดยไม่ใส่ projection** — `bonusImage` + `passwordImage` ฝังในเอกสารร้าน รวม ~5 MB
   ทำให้ query ใช้เวลา **~40 วินาที** จนเกิด `MongoNetworkTimeoutError` ตอน startup
   ใช้ `Shop.find({}, { bonusImage: 0, passwordImage: 0 })` หรือ `Shop.findOne({ prefix })` (~50 ms)

10. **LINE token หมดอายุได้** — ระบบออก token ผ่าน `/v2/oauth/accessToken` (client_credentials)
    ซึ่ง**ไม่ใช่** long-lived token จากหน้า console → ต้องต่ออายุ
    - `startTokenRefreshScheduler()` ต่ออายุอัตโนมัติ **ทุก 4 วัน** (เก็บเวลาใน `settings` key `token-refresh-meta`)
    - `createHealingClient()` จับ 401 → ออก token ใหม่ → retry ใน event เดิม (ลูกค้ายังได้รับการตอบกลับ)
    - ถ้าออก token ไม่ได้ → ตั้ง `lines[].tokenError = true` + ยิงการแจ้งเตือน

11. **การแจ้งเตือนเก็บใน memory เป็นหลัก** — เพราะต้องแจ้ง "MongoDB ล่ม" ได้ตอน MongoDB ล่ม
    persist ลง DB แบบ best-effort และ `loadNotificationsFromDB()` กู้กลับตอน start
