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
permissions.html    จัดการสิทธิ์ผู้ใช้ (js/permissions.js)
prefixes.html       จัดการ prefix (js/prefixes.js)
customers.html      จัดการข้อมูลลูกค้า (js/customers.js)
audit.html          ประวัติการใช้งาน — ใครกดอะไร (js/audit.js)
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
| `permissions.css` | หน้าจัดการสิทธิ์ + modal บัญชีผู้ใช้ |
| `prefixes.css` | ชิป prefix |
| `customers.css` | ตารางลูกค้า |
| `audit.css` | ตารางประวัติการใช้งาน (หัวตารางแยกจากกล่องที่เลื่อน) |
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

**5. `min-width` เป็นตัวเลขตายตัว = ของหลุดจอบนมือถือ**
`.alert-message-Line` เคยตั้ง `min-width: 360px` คู่กับ `max-width: 90%`
บนจอ 375px กล่องเลยกว้างเกิน modal แล้วข้อความหลุดออกนอกจอ
> **`max-width` ชนะ `min-width` ไม่ได้** — เบราว์เซอร์ใช้ `min-width` ก่อนเสมอ
> ถ้าต้องตั้งความกว้างขั้นต่ำ ให้หุ้มด้วย `min(360px, 100%)` เสมอ (หดตามเองเมื่อจอแคบ)
> และใส่ `box-sizing: border-box` ด้วย ไม่งั้น padding + เส้นขอบดันให้ล้นอีก
> รูปแบบเดียวกันนี้ใช้กับ `.shop-column` ในหน้าหลักด้วย

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
| `audit.js` | 9KB | ตารางประวัติการใช้งาน + ตัวกรอง + โหลดเพิ่ม |

## main.js — Key Functions

```js
// Shop
loadShopsAndRender()                // GET /api/shops → เก็บลง shopData แล้ววาดการ์ด
renderShopCards()                   // วาดการ์ดร้านทั้งหมดจาก shopData (เช็คสิทธิ์ด้วย canBtn())
canBtn(key) / canSetbot(key)        // ผู้ใช้คนนี้มีสิทธิ์เห็นปุ่มนี้ไหม

// Bonus Image (2 ช่อง: image1 + image2) — อัปโหลดทันทีที่เลือกไฟล์ ไม่มีปุ่มบันทึก
uploadBonusImage(prefix, input)     // เลือกไฟล์ → หา slot ว่าง → putBonusImage()
putBonusImage({prefix, index, file, url, isChange})   // ตัวยิง API จริง (เบลอ+สปินเนอร์ระหว่างรอ)
changeBonusImage(prefix, index)     // กดที่รูปเพื่อเปลี่ยนเฉพาะช่องนั้น
deleteBonusImage(prefix, index)     // ลบช่องเดียว
deleteAllBonusImage(prefix)         // ลบทั้งหมด + ปิด toggle (โชว์เฉพาะตอนมีครบ 2 รูป)
finishBonusCheck / countBonusImages / updateBonusActions / markBonusSlotEmpty
                                    // สถานะตอนเช็คว่ามีรูปอยู่ไหม (overlay ครอบทั้งช่อง)

// Password Image (ช่องเดียว) — ชุดเดียวกันแต่ไม่มี index
uploadPasswordImage(prefix, input) / putPasswordImage(prefix, file)
changePasswordImage(prefix) / deletePasswordImage(prefix)
finishPasswordCheck / markPasswordSlotEmpty

// Toggles
updateBonusTimeStatus(prefix, bool, checkbox)
updatePasswordStatus(prefix, bool, checkbox)

// LINE accounts
addLine(prefix) / updateLine(prefix, idx) / deleteLine(prefix, idx)
renderLineItem(prefix, line, index)   // สร้าง HTML 1 แถว — ใช้ร่วมกันทุกที่ที่วาดรายการไลน์
checkLine(prefix, index)              // ตรวจว่าไลน์ยังเชื่อมต่ออยู่ไหม (ขอ token ใหม่)
showLineToast(message, ok)            // ข้อความลอยกลางล่างจอ แจ้งผลโดยไม่ขัดจังหวะ
flashLineTooltip(linename)            // กางข้อความ "ไลน์หลุด" ค้างไว้ (ใช้ตอนมาจากการแจ้งเตือน)
applyLineHighlight(final)             // ทาไฮไลต์ซ้ำหลังรายการไลน์ถูกวาดทับ
setLineModalLoading(modalId, isLoading, message)  // overlay กำลังเชื่อมต่อ + disable ปุ่ม
```

> **สำคัญ:** ห้ามเขียน HTML ของ `.shop-line-item` ซ้ำอีก — ใช้ `renderLineItem()` เสมอ
> (เคยมีโค้ดนี้ซ้ำ 3 ที่ ทำให้เครื่องหมาย "ไลน์หลุด" หายไปในบางหน้าจอ)

> **`loadShopLines()` ต้อง sync `shopData` ด้วยเสมอ** — เมนูของแต่ละแถวส่ง `index`
> ไปให้ `editLine/deleteLine/checkLine` ซึ่งไปอ่านจาก `shopData`
> ถ้าไม่ sync ปุ่มเหล่านี้จะทำงานกับข้อมูลเก่า (ผิดไลน์ได้)

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

## หน้าประวัติการใช้งาน (`audit.html` + `audit.css` + `js/audit.js`)

ตารางอ่านอย่างเดียว โหลดจาก `GET /api/audit` ทีละ 100 แถว (ปุ่ม "โหลดเพิ่ม")
เมนูอยู่ในกลุ่ม **หน้าผู้จัดการ** (`ALL_ADMIN_PAGES`) — OWNER เห็นเสมอ, ADMIN ต้องได้รับมอบ

### หัวตารางแยกออกจากกล่องที่เลื่อน

```
.audit-table-wrap   กรอบนอก ไม่เลื่อน (flex column, overflow: hidden)
  .audit-head       หัวตาราง — overflow: hidden
  .audit-scroll     เนื้อหา — overflow: auto  ← แถบเลื่อนอยู่ตรงนี้
```
ทำแบบนี้เพื่อให้ **แถบเลื่อนเริ่มใต้หัวตาราง** ไม่พาดขึ้นไปคลุมหัวตาราง
(ถ้าใช้ `position: sticky` ในกล่องเดียวกัน แถบเลื่อนจะยาวเต็มกรอบ)

ราคาที่ต้องจ่ายและวิธีจัดการ:
1. **คอลัมน์ต้องตรงกันเอง** → ทั้งสองตารางใช้ `table-layout: fixed` + `<colgroup>` ชุดเดียวกัน
   (`.w-time / .w-user / .w-action / .w-target / .w-detail / .w-status`)
2. **เลื่อนแนวนอนแล้วหัวตารางไม่ตาม** → `scrollEl` ลาก `headEl.scrollLeft` ตามใน JS
3. **แถบเลื่อนแนวตั้งกินความกว้างของเนื้อหา แต่หัวตารางไม่มี** → `syncHeadGutter()`
   วัด `offsetWidth - clientWidth` แล้วใส่เป็น `padding-right` ให้หัวตาราง
   ไม่งั้นคอลัมน์สุดท้ายเหลื่อมกันประมาณ 15px

> **กับดัก:** คอลัมน์คงที่รวมกันต้องน้อยกว่า `min-width` ของตารางเสมอ
> ไม่งั้น `.w-detail` (คอลัมน์เดียวที่กว้าง `auto`) จะโดนบีบเหลือ 0 แล้วหายไปเงียบๆ
> — บนมือถือจึงย่อคอลัมน์อื่นลงและตั้ง `min-width: 780px`

## มือถือ: เลื่อนลงแล้วยุบแถบตัวกรอง (หน้า Log + หน้าประวัติการใช้งาน)

แถบค้นหา+ตัวกรองกินจอเกือบหมด เหลือที่ให้เนื้อหานิดเดียว
→ ใส่ class `.compact` ที่ container ของหน้า เมื่อกล่องเนื้อหาถูกเลื่อนลงเกิน **40px**
และเอาออกเมื่อกลับขึ้นบนสุด (**< 10px**) — ใช้ค่าเข้า/ออกคนละค่ากันกระพริบตอนอยู่แถวเส้นแบ่ง

| หน้า | ฟังก์ชัน | ที่อยู่ | ยุบอะไร |
|---|---|---|---|
| Log | `updateLogsCompact()` | `views/index.html` (บล็อก logs) | `.logs-toolbar` |
| ประวัติการใช้งาน | `updateCompact()` | `views/js/audit.js` | `.audit-subtitle` + `.audit-toolbar` |

- ยุบด้วย `max-height` + `opacity` **ไม่ใช่ `display: none`** จะได้มีอนิเมชัน
- กฎอยู่ใน `mobile.css` เท่านั้น → เดสก์ท็อปไม่โดนแม้ class จะถูกใส่
- โหลดชุดใหม่ (เปลี่ยนตัวกรอง) ต้อง `scrollTop = 0` + ถอด `.compact` ด้วย ไม่งั้นแถบค้างยุบ

วัดจริงบนจอ 375px: หน้า Log กล่อง log โตจาก 334px → 572px (+238) /
หน้าประวัติ ตารางโตจาก 157px → 518px (+361)

> **ทดสอบเรื่องนี้ต้องปิด `transition` ก่อนวัด** — Browser pane ที่ซ่อนอยู่ไม่เดิน transition
> ค่าที่วัดได้จะค้างที่ค่าเดิมทั้งที่ class ถูกใส่แล้ว (เสียเวลาไล่หาผิดจุดมาแล้ว)

## ปุ่ม "ตรวจสอบไลน์"

อยู่ในเมนู Kebab ของแต่ละไลน์ (ตรวจสอบไลน์ / แก้ไข / ลบไลน์นี้)
ยิง `POST /api/check-line` ด้วย `{ prefix, channelId }` เท่านั้น
(secret ไม่ต้องวิ่งผ่าน client — backend หยิบจาก DB เอง)

**ตรวจ 3 ชั้น** เพราะ token ผ่านอย่างเดียวไม่ได้แปลว่าบอทใช้งานได้จริง:

| ชั้น | ตรวจอะไร | ถ้าไม่ผ่าน |
|---|---|---|
| 1. token | `client_credentials` ออก token ได้ไหม | `markLineTokenError()` → ไฟแดง + แจ้งเตือน แล้วหยุด |
| 2. webhook | `GET /v2/bot/channel/webhook/endpoint` ตรงกับ `${URL}/webhook/${prefix}/${4หลักท้าย}.bot` ไหม + `active` ไหม | รายงานใน `problems` |
| 3. delivery | `POST /v2/bot/channel/webhook/test` ให้ LINE ยิงมาจริง | รายงานใน `problems` |

toast จะโชว์ทั้ง URL ที่ LINE ตั้งไว้และ URL ที่ถูกต้อง เพื่อให้ก๊อปไปแก้ได้เลย

> **เดิมตรวจแค่ token** — webhook ตั้งผิดก็ยังขึ้นเขียวว่าปกติ ซึ่งไม่จริง
> ต้องตรวจชั้น 2-3 ด้วยเสมอ

ตรวจเสร็จแล้วติด/ล้างธงให้เอง → ไฟหน้าชื่อไลน์เป็นแดงทันทีถ้าเจอปัญหา

### ไฟต้องเปลี่ยนพร้อมข้อความลอย ไม่ใช่ช้ากว่า

ทั้ง `/api/check-line` และ `/api/apply-webhook` คืน `flags: { tokenError, webhookError }` กลับมาด้วย
ฝั่งหน้าเว็บเอาไปทาลง `shopData` แล้วเรียก `renderLineList(prefix)` **ทันทีก่อนโชว์ toast**

> เดิมรอ `loadShopLines()` ยิง `/api/shops` ใหม่ก่อนถึงจะวาด ไฟเลยเปลี่ยนช้ากว่าข้อความราวครึ่งวินาที
> วัดหลังแก้: ไฟกับ toast เปลี่ยนที่ ms เดียวกัน (ต่างกัน 0 ms) ทั้งเคสสำเร็จและเคสเจอปัญหา

`loadShopLines()` ยังเรียกอยู่ใน `finally` เพื่อทวนกับ server แต่ไม่ได้เป็นตัวกำหนดสิ่งที่ผู้ใช้เห็นแล้ว

`renderLineList(prefix)` = วาดรายการไลน์จาก `shopData` (cache) — แยกจาก `loadShopLines()` ที่ต้องรอ API

## เปิดสวิตช์บอท → ตรวจไลน์ทั้งร้านอัตโนมัติ

`handleToggle()` เมื่อเปิด (`newStatus === true`) เรียก `verifyShopLines(prefix)` ต่อ
**ไม่ `await`** เพราะสวิตช์ต้องตอบสนองทันที ไม่ควรค้างรอ LINE API หลายวินาที
(ตอนปิดไม่ต้องตรวจ — ไม่มีอะไรต้องทำงานอยู่แล้ว)

```
ยิง POST /api/check-shop-lines { prefix }
  ├─ ทุกไลน์ผ่าน → toast เขียว "ใช้งานได้ครบทุกบัญชี"
  └─ มีไลน์เสีย  → เอา flags ทาลง shopData ก่อน
                   → openShopLinesModal(prefix)   (ไฟแดงขึ้นถูกตั้งแต่เปิด)
                   → toast แดง + บรรทัดย่อยบอกว่าไลน์ไหนเป็นอะไร
```

`showLineToast(msg, ok, result)` รับ `result.detailLines` (array) เพื่อโชว์หลายบรรทัด
และ `result.webhook` เพื่อโชว์ URL — ไลน์เสียหลายบัญชีจะไม่โชว์ URL (รกเกิน)

## ปุ่ม "ตั้ง Webhook URL"

เมนู Kebab รายการที่ 2 — ยิง `POST /api/apply-webhook` `{ prefix, channelId }`
1. ตรวจ `access_token` ที่เก็บใน DB ด้วย `GET /v2/bot/info`
2. ใช้ไม่ได้ → ออกใหม่จาก `channel_id + secret` **แล้วบันทึกกลับลง DB** (ไลน์ที่ token หมดอายุกลับมาใช้ได้ในคลิกเดียว)
3. `PUT /v2/bot/channel/webhook/endpoint` ตั้งเป็น `${URL}/webhook/${prefix}/${4หลักท้าย}.bot`
4. อ่านกลับมายืนยัน + ให้ LINE ยิงทดสอบ แล้วล้างธง `webhookError` ถ้าผ่าน

ถามยืนยันก่อนเสมอ เพราะเขียนทับค่าที่ตั้งไว้ฝั่ง LINE

## ไฟแดงมาจาก 2 ธง

```js
line.tokenError || line.webhookError   →  ไอคอน ! แดง
```
ข้อความ tooltip เปลี่ยนตามสาเหตุ จะได้รู้ว่าต้องกดเมนูไหนแก้

> **ต้องแยกเป็นสองธงในฐานข้อมูล** — `startTokenRefreshScheduler()` ต่ออายุ token ทุก 4 วัน
> แล้ว `clearLineTokenError()` ถ้ารวมธงเดียว ไฟแดงของ webhook จะหายเองทั้งที่ยังผิดอยู่

> **ห้ามใส่ `"` ในข้อความ tooltip** — `data-tip="${tip}"` ไม่ได้ escape
> เครื่องหมายคำพูดจะไปปิด attribute ทำให้ข้อความขาดกลางคัน (ใช้ `'` แทน)

- ระหว่างรอ: ไอคอนสถานะเปลี่ยนเป็นลูกศรหมุน (`.line-status.checking`) และปิด tooltip เดิมไว้ก่อน
- เสร็จแล้วเรียก `loadShopLines()` ดึงสถานะล่าสุดมาวาดใหม่ ไฟเขียว/แดงจึงอัปเดตเอง
- ไลน์ที่ยังไม่มี Channel ID / Secret Token จะไม่ยิง API เลย — เตือนให้ไปแก้ไขก่อน
- `lineChecking` (Set) กันกดรัวซ้ำไลน์เดิม

> การกดปุ่มนี้ถูกบันทึกใน**ประวัติการใช้งาน**อัตโนมัติ (`line.token` — "ขอ access token ของ LINE")
> เพราะ middleware ดักที่ route ไม่ได้ดักที่ปุ่ม

### `showLineToast(message, ok)` — ข้อความลอยแจ้งผล

สร้าง `#lineToast` ครั้งเดียวแล้วใช้ซ้ำ ลอยกลางล่างจอ `z-index: 1400` (เหนือ modal 1300)
หายเองใน 4 วินาที

> **ห้ามใช้ `requestAnimationFrame` เพื่อ trigger transition** — rAF ไม่ทำงานตอนแท็บถูกซ่อน
> ทำให้ toast ไม่โผล่เลย ใช้ `void el.offsetWidth` (force reflow) แทน ทำงานเสมอ

> **ห้ามใช้ `left: 50%` + `translateX(-50%)` จัดกึ่งกลาง** — กล่องจะเหลือพื้นที่แค่ครึ่งจอ
> (containing block คือ viewport ลบ `left`) บนมือถือ 375px กล่องกว้างได้แค่ 188px
> ข้อความยาวเลยกลายเป็นแถบสูงเตี้ยๆ อ่านไม่ออก
> → ใช้ `left: 0; right: 0; margin: 0 auto; width: fit-content` แทน กึ่งกลางเหมือนกันแต่ได้เต็มจอ
> (`.perm-status` ในหน้าจัดการสิทธิ์ยังใช้แบบเดิมอยู่ — ไม่มีปัญหาเพราะข้อความสั้น)

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

## กดการแจ้งเตือนแล้วพาไปที่ต้นเหตุ

`renderNotifications()` ใส่ `data-noti-category / prefix / linename` ไว้ในทุกรายการ
handler ใน `index.html` แยกทางตามหมวด:

| หมวด | พาไปไหน |
|---|---|
| `line_token` (มี prefix) | หน้าหลัก → เปิด modal ไลน์ของร้านนั้น → กางข้อความลอยที่ไลน์ที่หลุด |
| อื่นๆ | หน้า Logs → เลื่อนไปที่เวลานั้น |

กลไก: ตั้ง `window.__lineJumpTo = { prefix, linename }` แล้ว `loadPage(null, "main")`
`renderShopCards()` ใน `main.js` มาอ่านค่านี้หลังข้อมูลร้านพร้อม แล้วเรียก
`openShopLinesModal(prefix)` + `flashLineTooltip(linename)`

> **กับดัก:** `openShopLinesModal()` วาดรายการจาก cache ก่อน แล้ว `loadShopLines()`
> ยิง API มาวาดทับอีกรอบ — ถ้าใส่ class `tip-open` ครั้งเดียวจะโดนล้างทิ้ง
> จึงเก็บไว้ที่ `pendingLineHighlight` แล้ว `applyLineHighlight(true)` ทาซ้ำหลังรายการสดมาถึง
> (ต้องเคลียร์ค่าเฉพาะรอบ `final` เท่านั้น ไม่งั้นทารอบแรกแล้วรอบสองไม่เหลืออะไรให้ทา)

ถ้าไม่มีสิทธิ์เข้าหน้าปลายทาง (เช่นไม่มีสิทธิ์ "ไลน์ร้าน") จะไม่พาไป — พาไปก็เปิดอะไรไม่ได้

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
  .line-token-error ไอคอนแดง = token มีปัญหา ("ไลน์หลุดการเชื่อมต่อ...")
  .line-off         จุดเทา   = ร้านนี้ปิดบอทอยู่ ไลน์จึงยังไม่ทำงาน
  .line-ok          จุดเขียว = ไลน์ทำงานปกติ
  .line-status.checking   ลูกศรหมุน = กำลังกดตรวจสอบไลน์อยู่
```
**ลำดับความสำคัญ: แดง → เทา → เขียว** — token เสียขึ้นแดงเสมอแม้ร้านจะปิดบอทอยู่
เพราะเป็นสิ่งที่ต้องไปแก้ไม่ว่าบอทจะเปิดหรือปิด (เครื่องหมายต้องอยู่จนกว่าจะบันทึกสำเร็จหรือลบไลน์)

`renderLineItem()` อ่านสถานะร้านจาก `shopData.find(s => s.prefix === prefix)?.status`
→ `loadShopLines()` จึงต้อง sync ทั้ง `lines` **และ `status`** กลับเข้า `shopData`

ทุกสถานะใช้ช่องเดียวกันเสมอ (สลับ class) แถวจึงเรียงตรงกันไม่ว่าไลน์ไหนมีปัญหา
**ต้องอยู่นอก `.row-name`** ไม่งั้น `text-overflow: ellipsis` จะกินไอคอนหายไปเมื่อชื่อยาว

ใช้ tooltip เองแทน `title` ของเบราว์เซอร์ เพราะปรับขนาดตัวอักษรไม่ได้
ยึดขอบซ้ายของไอคอน (ไม่จัดกึ่งกลาง) เพื่อกันข้อความล้นออกนอกจอ

`.tip-open` = กางข้อความค้างไว้เองโดยไม่ต้องเอาเมาส์ไปชี้ (ใช้ตอนถูกพามาจากการแจ้งเตือน)

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
