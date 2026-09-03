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
| `mobile.css` | **responsive ทั้งหมด — ต้อง link เป็นไฟล์สุดท้ายเสมอ** |

## Responsive (mobile.css)

CSS ทุกไฟล์ถูก link ใน `index.html` โดย `shared.css` มาก่อน ไฟล์หน้าอื่นมาทีหลัง
→ ถ้าเขียน media query ใน `shared.css` จะโดนไฟล์อื่น override ตาม source order

**จึงรวม responsive ไว้ใน `mobile.css` แล้ว link ท้ายสุด** — override ได้โดยไม่ต้องใช้ `!important`
เพิ่ม/แก้ responsive ที่ไฟล์นี้ที่เดียว ไม่ต้องแตะไฟล์เดิม

```
breakpoint: 768px (มือถือ/แท็บเล็ต), 480px (มือถือแนวตั้ง)

< 768px:
  .mobile-topbar        แถบบน + ปุ่มแฮมเบอร์เกอร์ (ซ่อนบนจอใหญ่)
  .sidebar              off-canvas — .sidebar.open เลื่อนเข้า
  .sidebar-backdrop     ฉากหลังทึบ แตะเพื่อปิด (.show)
  page containers       left: 0, top: 54px (เดิมตรึง left: 260px ตายตัว)
```

> **สำคัญ:** ทุก container ระดับหน้าใช้ `position: absolute; left: 260px`
> ถ้าเพิ่มหน้าใหม่ ต้องเพิ่ม selector ในบล็อก media query ของ `mobile.css` ด้วย
> ไม่งั้นหน้านั้นจะแสดงผลเพี้ยนบนมือถือ

### กับดัก 2 อย่างที่เคยเจอ (แก้แล้วใน mobile.css)

**1. `height: 100vh` ทำให้ของที่อยู่ล่างสุดตกขอบ**
บนมือถือ `100vh` รวมพื้นที่ใต้แถบเบราว์เซอร์ → sidebar สูงเกินจอ แถบชื่อผู้ใช้หายไป
ต้องเลื่อนถึงจะเห็น (เจอชัดตอนสั่ง "ขอเว็บไซต์เดสก์ท็อป" บนมือถือ)
→ ใช้ `height: 100dvh` (เดสก์ท็อปค่าเท่ากันทุกประการ) — ประกาศนอก media query

**2. สูตรจัดกึ่งกลางที่หักความกว้าง sidebar**
`.btn-add-shop` ใช้ `left: calc(260px + ((100% - 260px) / 2))` = กึ่งกลางพื้นที่เนื้อหา
บนมือถือ sidebar ซ่อนอยู่ สูตรนี้จะดันของไปทางขวาจนตกขอบ → override เป็น `left: 50%`

> ถ้าเจอ CSS ที่ hardcode `260px` ในการคำนวณตำแหน่ง ให้เช็คเสมอว่าบนมือถือเพี้ยนไหม

**3. `--radius-md` เคยหายไปจาก `shared.css`** (แก้แล้ว)
มี 5 จุดเรียก `var(--radius-md)` แต่ตัวแปรไม่ถูกนิยาม → `border-radius: 0` เงียบๆ
ทำให้ modal หน้าจัดการสิทธิ์และหน้าต่างแจ้งเตือนมุมเหลี่ยม
> CSS variable ที่ไม่มีอยู่จะไม่ error แต่ทำให้ property นั้นถูกทิ้งทั้งบรรทัด
> ถ้าเห็นสไตล์ "หายไปเฉยๆ" ให้เช็คก่อนว่าตัวแปรมีจริงไหมใน `:root` ของ `shared.css`

**4. Modal ที่สูงเกินจอบนมือถือ**
wrapper ใช้ `align-items: center` + ไม่มี `overflow` → ส่วนบน (รวมปุ่ม X) ล้นเหนือจอแบบเลื่อนตามไม่ได้
และ `z-index: 1000` ต่ำกว่า `.mobile-topbar` (1100) ทำให้ topbar ทับ
→ บนมือถือ: `z-index: 1300`, `align-items: flex-start`, `overflow-y: auto`, content `max-height: none`

## ช่องรหัสผ่าน — กัน Chrome เด้งถามบันทึกรหัสผ่าน

`autocomplete="off"` **ใช้ไม่ได้กับช่อง password** — Chrome จงใจเพิกเฉย
ถ้ามีช่อง `type="password"` ค้างใน DOM Chrome จะเห็นช่อง text อื่นบนหน้าเดียวกันเป็น username
แล้วเด้งถามบันทึกรหัสผ่านตอนพิมพ์ค้นหา/บันทึกข้อมูล

**วิธีที่ใช้ในโปรเจกต์นี้:** เก็บช่องรหัสผ่านไว้ใน `<template id="changePwTemplate">`
(เนื้อหาใน template ไม่ถือเป็นส่วนหนึ่งของเอกสาร เบราว์เซอร์มองไม่เห็น)
แล้ว clone เข้ามาตอนเปิด modal + `replaceChildren()` ล้างทิ้งตอนปิด

> ถ้าจะเพิ่มช่อง password ที่ไหนอีก ให้ใช้แพตเทิร์นนี้เสมอ
> และช่อง text/number ทุกช่องควรมี `autocomplete="off"`

ฟังก์ชันใน `index.html`: `toggleSidebar(e)` / `closeSidebar()` (กดเมนูแล้วปิดเองอัตโนมัติ)

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

## หัวข้อหน้า (`.page-title`)

หัวข้อทุกหน้า **กึ่งกลาง** ขนาด 23px (มือถือ 21px / จอเล็ก 19px) — นิยามที่ `shared.css` ที่เดียว
คำโปรยใต้หัวข้อ (`.customers-subtitle`, `.permissions-subtitle`, `.prefixes-subtitle`)
ต้องกึ่งกลางตามด้วย ไม่งั้นหัวข้อกลางแต่คำโปรยชิดซ้าย ดูหลุดกัน

> **หน้าจัดการสิทธิ์** หัวข้ออยู่ในแถว flex คู่กับปุ่ม "สร้างบัญชีใหม่"
> แก้เป็น `.permissions-head { position: relative; padding: 0 170px }` + ปุ่ม `position: absolute; right: 0`
> padding สมมาตรจึงไม่ทำให้หัวข้อเบี้ยว แต่การันตีว่าข้อความไม่ไปชนปุ่ม
> (`mobile.css` ปลด padding + คืนปุ่มเข้าสายเนื้อหา ไม่งั้นจอแคบจะทับกัน)

## การ์ดร้านบนมือถือ — ปุ่มแก้ไข/ลบเข้าเมนู Kebab

`renderShopCards()` วาด **ทั้ง** ปุ่มในแถวและ `.shop-row-menu` ไว้เสมอ แล้วให้ CSS สลับว่าจะโชว์อันไหน
— ย่อ/ขยายจอแล้วไม่ต้อง re-render

```
เดสก์ท็อป : .shop-row-menu { display: none }        ← ปุ่มแก้ไข/ลบอยู่ในแถว
มือถือ    : .shop-row-menu { display: block; position: absolute; top/right: 8px }
            .shop-item .btn-edit, .btn-delete { display: none }
```
- `.shop-item` ต้องมี `position: relative` เป็นจุดยึด
- `.shop-info` เว้น `padding-right: 34px` กันปุ่ม Kebab ทับชื่อร้าน
- `.row-menu-list` ต้องมี `z-index` ไม่งั้นเมนูจะถูกการ์ดใบถัดไปบัง

## เมนู Kebab ประจำแถว

แถวรายการ (ไลน์ร้าน / บัญชีธนาคาร) ไม่วางปุ่ม "แก้ไข/ลบ" ไว้ในแถวตรงๆ
เพราะชื่อยาวจะดันปุ่มจนแต่ละแถวเรียงไม่ตรงกัน — ใช้ `renderRowMenu()` แทน

```js
renderRowMenu([
  { label: "แก้ไข",   icon: "bi-pencil", action: `editLine('${prefix}', ${index})` },
  { label: "ลบไลน์นี้", icon: "bi-trash", danger: true, action: `deleteLine(...)` },
])
```
- ชื่อแถวต้องใส่ class `row-name` → ตัดด้วย `...` เมื่อยาวเกิน (มี `title` ให้ hover ดูเต็ม)
- `toggleRowMenu()` / `closeAllRowMenus()` จัดการเปิด-ปิด (เปิดได้ทีละอัน + คลิกนอกแล้วปิด)

## กับดักสำคัญ: `views/js/index.js` เป็นไฟล์ตาย

**ไม่มีใครโหลด `views/js/index.js` เลย** — `loadPage()` / `navigateTo()` ตัวจริง
เขียนเป็น **inline script อยู่ใน `views/index.html`** (ราวบรรทัด 155)

> แก้ navigation ต้องแก้ใน `views/index.html` เท่านั้น
> แก้ที่ `views/js/index.js` จะไม่มีผลใดๆ (เคยพลาดมาแล้ว)

### loadPage โหลดสคริปต์ของหน้าย่อย "ครั้งเดียว"

```js
window.__loadedScripts = new Set()   // กันสคริปต์ execute ซ้ำ
```
สคริปต์ของแต่ละหน้า (เช่น `permissions.js`) รัน top-level **แค่รอบแรกที่เข้าหน้านั้น**
รอบถัดไปเรียกแค่ `init*()` ผ่าน `finalize()`

> **อะไรที่ต้องตั้งใหม่ทุกครั้งที่เข้าหน้า ห้ามวางไว้ที่ top-level ของไฟล์**
> ให้ย้ายไปไว้ใน `initXxxPage()` แทน (เช่น `window.__pageLeaveGuard`)

## ปุ่มย้อนกลับของเบราว์เซอร์ (History API)

เว็บเป็น SPA — ถ้าไม่จัดการเอง กดย้อนกลับจะออกจากเว็บทันทีไม่ว่าจะอยู่ตรงไหน
โมดูลจัดการอยู่ใน `views/index.html` (ก่อนบล็อก "เมนูมือถือ")

```
เปลี่ยนเมนู  → history.pushState({ kind: "page", page })   (หน้าแรกใช้ replaceState)
เปิด modal   → history.pushState({ kind: "modal", ... })
```

**ตรวจจับ modal ด้วย `MutationObserver`** เฝ้า `style`/`hidden`/`class` ทั้ง `document.body`
→ ไม่ต้องแก้ฟังก์ชันเปิด/ปิด modal ทีละตัว (มีหลายสิบจุด)

พฤติกรรมเมื่อกดย้อนกลับ:
| สถานการณ์ | ผลลัพธ์ |
|---|---|
| มี modal เปิดอยู่ (ไม่ได้แก้อะไร) | ปิด modal ไม่เปลี่ยนหน้า |
| มี modal เปิดและมีการแก้ข้อมูล | ถาม "บันทึก / ออกโดยไม่บันทึก" |
| ไม่มี modal | ถอยไปเมนูก่อนหน้า จนหมดแล้วออกจากเว็บ |
| เจอ entry ของ modal ที่ปิด/บันทึกไปแล้ว | ข้ามไป ไม่เปิดซ้ำ |

### รีเฟรชแล้วอยู่หน้าเดิม

`loadPage()` เก็บชื่อหน้าไว้ที่ `sessionStorage["lastPage"]` ทุกครั้ง
ตอนเริ่มแอปจะอ่านค่านี้มาใช้แทนหน้าแรก **ถ้าเมนูนั้นยังมีสิทธิ์เข้าถึงอยู่**
(เช็คด้วย `li[data-page="..."]:not([hidden])` — เผื่อสิทธิ์ถูกถอนหลังเปิดค้างไว้)
ค่าเพี้ยน/ไม่มีเมนูนั้น → กลับไปหน้าแรกตามปกติ  ใช้ `sessionStorage` ไม่ใช่ `localStorage`
เพราะควรจำเฉพาะแท็บนั้น ไม่ใช่ข้ามการเปิดเว็บครั้งใหม่

**ตรวจว่ามีการแก้ข้อมูลไหม** — snapshot ค่าของ `input/select/textarea` ตอนเปิด modal
แล้วเทียบตอนกดย้อนกลับ (ไม่ต้องให้แต่ละ modal รายงานเอง)

> ตัวแปรสำคัญ: `modalEntryPushed`, `skipNextPop`, `suppressModalSync`
> ทั้งสามตัวมีไว้กันลูประหว่าง `history.back()` ที่เราเรียกเอง กับ `popstate` ที่เกิดตามมา
> แก้โค้ดส่วนนี้ต้องระวังลูปเสมอ

## เตือนก่อนออกจากหน้าที่มีข้อมูลค้าง

หน้าไหนมีข้อมูลยังไม่บันทึก ให้ตั้ง `window.__pageLeaveGuard` (async → `true` = ออกได้)
`loadPage` จะเรียกก่อนเปลี่ยนหน้าเสมอ แล้วล้างทิ้งหลังผ่าน

```js
// ใน initXxxPage() — ไม่ใช่ top-level
window.__pageLeaveGuard = myGuard;
```
- ถ้า guard throw → `loadPage` จับไว้แล้วปล่อยผ่าน (กันติดอยู่หน้าเดิมถาวร)
- ตัวอย่างใช้งานจริง: `views/js/permissions.js`

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

## ไฟสถานะไลน์ (main.css)

```
.line-status        ช่องไฟสถานะ กว้างคงที่ 18px + tooltip ทำเอง (::before/::after)
  .line-ok          จุดเขียว = ไลน์ยังทำงานปกติ
  .line-token-error ไอคอนแดง  = token มีปัญหา ("ไลน์หลุดการเชื่อมต่อ...")
```
สองสถานะใช้ช่องเดียวกันเสมอ (สลับ class) แถวจึงเรียงตรงกันไม่ว่าไลน์ไหนมีปัญหา
**ต้องอยู่นอก `.row-name`** ไม่งั้น `text-overflow: ellipsis` จะกินไอคอนหายไปเมื่อชื่อยาว

ใช้ tooltip เองแทน `title` ของเบราว์เซอร์ เพราะปรับขนาดตัวอักษรไม่ได้
ยึดขอบซ้ายของไอคอน (ไม่จัดกึ่งกลาง) เพื่อกันข้อความล้นออกนอกจอ

## ความกว้างแถวร้านในหน้าหลัก (main.css)

แถวร้านต้อง**สั้นลงตามจำนวนปุ่มที่ผู้ใช้มีสิทธิ์เห็น** — ผู้ใช้ที่มีสิทธิ์แค่ "ตั้งค่าบอท"
ไม่ควรเห็นแถวยาวเต็มจอที่มีแต่ที่ว่าง

โครงสร้าง: `h1.page-title` อยู่นอกคอลัมน์ (กึ่งกลางจอเสมอ)
ส่วน `.shop-filter-bar` + `.shop-list` อยู่ใน **`.shop-column`** ร่วมกัน
→ ปุ่ม "แสดงร้าน" จึงตรงแนวขอบซ้ายของการ์ดเสมอ ไม่ว่าการ์ดจะกว้างเท่าไหร่

```css
.main-page .shop-column {
  width: fit-content;              /* หดตามการ์ดที่กว้างที่สุด */
  min-width: min(640px, 100%);     /* ขั้นต่ำ กันแถวของคนที่มีปุ่มเดียวแคบจนดูอึดอัด */
  margin: 0 auto;                  /* จัดกึ่งกลาง */
  min-height: 0;                   /* ไม่งั้น .shop-list ดันคอลัมน์สูงเกินจนเลื่อนไม่ได้ */
}
.main-page .shop-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);   /* การ์ดยืดเต็มคอลัมน์ ทุกใบกว้างเท่ากัน */
}
```

> **กับดัก:** `min-width: min(640px, 100%)` ต้องอยู่ที่ `.shop-column` เท่านั้น
> ใส่ที่ `.shop-item` หรือใน `grid-template-columns` ของ `.shop-list` จะ **ไม่มีผล**
> เพราะ `%` ไปอิงความกว้างที่ยังคำนวณไม่เสร็จ (อยู่ใน `fit-content` → วนกลับหาตัวเอง)
> ที่ `.shop-column` ใช้ได้เพราะ `%` อิง `.main-container` ซึ่งกว้างนิ่งแล้ว
> วัดจริง: ปุ่มเดียว 634px / ครบ 6 ปุ่ม 877px / มือถือ 349px — ขอบซ้ายตรงกับปุ่มกรองทุกกรณี
- `.shop-item` **ห้ามใส่ `min-width` กลับเข้าไป** (เดิมมี `min-width: 800px` — คือต้นเหตุที่แถวยาวเสมอ)
  แต่ต้องมี `position: relative` ไว้เป็นจุดยึดเมนู Kebab บนมือถือ
- `.shop-item .shop-info` ล็อก `min-width: 250px` ให้ปุ่มของทุกแถวตรงกันแม้ชื่อร้านสั้น-ยาวต่างกัน
  (บนมือถือ `mobile.css` ปลดเป็น `min-width: 0` เพราะปุ่มขึ้นบรรทัดใหม่อยู่แล้ว)

## ความกว้าง modal รายการ (main.css)

คิดจากเนื้อหาจริง ไม่ใช่ตั้งกว้างไว้เผื่อ — ชื่อไลน์ OA / ชื่อบัญชีคนไทยปกติไม่เกิน ~30 ตัวอักษร

| Modal | กว้าง | เนื้อหาต่อแถว |
|---|---|---|
| `.showLine-modal-content` | 520px | ไฟสถานะ + ชื่อไลน์ + kebab |
| `.bank-modal-content` | 560px | จุดสถานะ + ชื่อบัญชี/เลขบัญชี + สวิตช์ + kebab |

แถวธนาคารแสดง 2 บรรทัด (`.bank-text`) — ชื่อบัญชีบน เลขบัญชีล่าง (`.bank-account-no`)
ชิดซ้ายเพราะสองบรรทัดจัดกึ่งกลางแล้วอ่านยาก
> `.shop-name` มี `max-width: 200px` ไว้สำหรับรายการร้าน — ในกล่องนี้ปลดออกด้วย `.bank-text .shop-name`

## Bonus Image HTML IDs (ต้องตรงกันทุกที่)

```
bonusPreview1_{prefix}    img element สำหรับ image1
bonusPreview2_{prefix}    img element สำหรับ image2
bonusFileName_{prefix}    span แสดงชื่อไฟล์
bonusImageInput_{prefix}  file input
bonusPreviewWrapper_{prefix}  container div
```
