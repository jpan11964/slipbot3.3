# views/ — CLAUDE.md

## Architecture

Multi-page SPA — `index.html` เป็น shell, โหลดหน้าย่อยผ่าน `/page/:name` (iframe หรือ fetch inject)

```
index.html          shell + sidebar nav
main.html           shop/LINE/bank management (js/main.js — 53KB+)
dashboard.html      real-time slip results (js/dashboard.js)
settings.html       global system settings เท่านั้น (timeLimit, etc.)
send-message.html   push message to LINE (js/send-message.js)
logs.html           real-time server logs
```

## Design Rules — ห้ามละเมิด

1. **ห้ามใช้ emoji** ทุกกรณี — ใช้ Bootstrap Icons แทนทั้งหมด
2. **Bootstrap Icons** CDN: `<i class="bi bi-{icon-name}"></i>`
3. **CSS variables เท่านั้น** — ห้าม hardcode สี เช่น `#3b82f6`
4. **Font** — Noto Sans Thai + Inter (Google Fonts CDN ใน index.html)

## CSS Variables (shared.css)

```css
--navy: #0c1628        --navy-light: #1e3a5f
--blue: #3b82f6        --blue-dark: #2563eb      --blue-muted: rgba(59,130,246,0.08)
--green: #10b981       --green-dark: #059669
--red: #ef4444         --red-dark: #dc2626
--amber: #f59e0b       --amber-dark: #d97706
--bg: #f1f5f9          --white: #ffffff
--text: #1e293b        --text-muted: #64748b
--border: #e2e8f0      --border-light: #f1f5f9
--sidebar-width: 260px
--radius-sm: 8px       --radius-md: 12px
--shadow: 0 1px 3px rgba(0,0,0,0.08)
```

## Layout Pattern

```css
/* ทุก page-level div ต้องมี left: var(--sidebar-width) */
.my-page {
  position: absolute;
  top: 0; bottom: 0; right: 0;
  left: var(--sidebar-width);  /* 260px */
  padding: 28px 32px;
}
```

## CSS Files

| File | ครอบคลุม |
|------|---------|
| `shared.css` | variables, sidebar, base layout |
| `main.css` | shop cards, modals, toggles, buttons |
| `dashboard.css` | slip results table, status badges |
| `send-message.css` | form grid, status log table |
| `settings.css` | settings form inputs |
| `logs.css` | log entries, monospace |
| `bonusTimeImage.css` | dual image upload/preview layout |
| `passwordImage.css` | password image upload |
| `modal-notfound.css` | backdrop blur modal |
| `editable-input.css` | contenteditable div (userId input) |

## JavaScript Files

| File | ขนาด | หน้าที่ |
|------|------|--------|
| `index.js` | 3.9KB | sidebar nav, active state, page loader |
| `main.js` | 53KB+ | shop CRUD, LINE mgmt, bank, bonus/password images |
| `dashboard.js` | 11KB | SSE slip results stream |
| `setting.js` | 5.7KB | settings form GET/POST |
| `send-message.js` | 18KB | user lookup, message send, status log |

## main.js — Key Functions

```js
// Shop
loadShops()                         // GET /api/shops → render shop cards
generateShopHTML(shop)              // สร้าง HTML card ของแต่ละ shop

// Bonus Image (dual: image1 + image2)
saveBonusImage(prefix)              // POST /api/upload-bonus-image (sequential)
changeBonusImage(prefix, index)     // POST /api/upload-change-bonus-image
deleteBonusImage(prefix, index)     // ลบ slot เดียว
deleteAllBonusImage(prefix)         // ลบทั้งหมด + disable toggle

// Password Image
savePasswordImage(prefix)
deletePasswordImage(prefix)

// Toggles
updateBonusTimeStatus(prefix, bool, checkbox)
updatePasswordStatus(prefix, bool, checkbox)

// LINE accounts
addLine(prefix) / updateLine(prefix, idx) / deleteLine(prefix, idx)
renderLineItem(prefix, line, index)   // สร้าง HTML 1 แถว — ใช้ร่วมกันทุกที่ที่วาดรายการไลน์
setLineModalLoading(modalId, isLoading, message)  // overlay กำลังเชื่อมต่อ + disable ปุ่ม
confirmCloseLineModal(modalId)        // ถามยืนยันถ้าปิดหน้าต่างขณะยังโหลดไม่เสร็จ
```

> **สำคัญ:** ห้ามเขียน HTML ของ `.shop-line-item` ซ้ำอีก — ใช้ `renderLineItem()` เสมอ
> (เคยมีโค้ดนี้ซ้ำ 3 ที่ ทำให้เครื่องหมาย "ไลน์หลุด" หายไปในบางหน้าจอ)

## index.html — ฟังก์ชันของ shell

```js
toggleNotiPanel(e) / closeNotiPanel()   // หน้าต่างการแจ้งเตือน
setNotiCount(n)                          // ตัวเลขบนกระดิ่ง (0 = ซ่อน, >99 = "99+")
loadNotifications()                      // ดึงจาก /api/notifications (poll ทุก 30 วิ)
renderNotifications(items)               // วาดรายการ
```

ปุ่มกระดิ่งแสดงเฉพาะ OWNER หรือผู้ที่มีสิทธิ์ sidebar `"notifications"`

## Notification CSS (shared.css)

```
.noti-btn / .noti-badge          ปุ่มกระดิ่ง + ตัวเลขค้างอ่าน
.noti-panel / .noti-head / .noti-body   หน้าต่าง (position: fixed, z-index 1001)
.noti-empty                      สถานะว่าง
.noti-item.error / .warn / .info รายการ 3 ระดับ (แดง / เหลือง / น้ำเงิน)
```

## เครื่องหมายไลน์หลุด (main.css)

```
.line-token-error   ไอคอนแดงหน้าชื่อไลน์ + tooltip ทำเอง (::before/::after)
```
ใช้ tooltip เองแทน `title` ของเบราว์เซอร์ เพราะปรับขนาดตัวอักษรไม่ได้
ยึดขอบซ้ายของไอคอน (ไม่จัดกึ่งกลาง) เพื่อกันข้อความล้นออกนอกจอ

## Bonus Image HTML IDs (ต้องตรงกันทุกที่)

```
bonusPreview1_{prefix}    img element สำหรับ image1
bonusPreview2_{prefix}    img element สำหรับ image2
bonusFileName_{prefix}    span แสดงชื่อไฟล์
bonusImageInput_{prefix}  file input
bonusPreviewWrapper_{prefix}  container div
```
