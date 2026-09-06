# Frontend Fix / Add UI

## กฎที่ต้องทำตามเสมอ

1. **ห้ามใช้ emoji** ในทุกไฟล์ — ใช้ Bootstrap Icons แทน: `<i class="bi bi-{name}"></i>`
2. **ใช้ CSS variables เท่านั้น** — ดูรายการใน `views/css/shared.css` หรือ `views/CLAUDE.md`
3. **Font** — Noto Sans Thai + Inter (มี CDN ใน index.html อยู่แล้ว ไม่ต้องเพิ่มซ้ำ)
4. **สีพื้นหลัง input/textarea** — ใช้ `var(--white)` ไม่ใช่ `#f8fafc`
5. **Layout** — ทุก page-level element ต้องมี `left: var(--sidebar-width)` (260px)

## ขั้นตอน

1. อ่าน `views/CLAUDE.md` ก่อนเสมอ
2. แก้เฉพาะ CSS ที่เกี่ยวข้อง ห้ามแตะ `shared.css` โดยไม่จำเป็น
3. ถ้าเพิ่ม element ใหม่ → ใช้ class ที่มีอยู่แล้วถ้าทำได้ก่อนสร้างใหม่

## ไฟล์ที่เกี่ยวข้อง

- `views/css/shared.css` — CSS variables, sidebar, ปุ่ม/หน้าต่างแจ้งเตือน
- `views/css/main.css` — shop cards, modals, buttons, เครื่องหมายไลน์หลุด
- `views/js/main.js` — shop UI functions
- `views/index.html` — shell (sidebar, สิทธิ์, การแจ้งเตือน) — script อยู่ inline ในไฟล์

## ข้อควรระวังเฉพาะโปรเจกต์นี้

1. **รายการไลน์ในร้าน** — ใช้ `renderLineItem(prefix, line, index)` เสมอ
   ห้ามเขียน HTML ของ `.shop-line-item` ซ้ำ (เคยซ้ำ 3 ที่ จนเครื่องหมาย "ไลน์หลุด" หายบางหน้าจอ)

2. **tooltip** — `title` ของเบราว์เซอร์ปรับขนาดตัวอักษรไม่ได้
   ถ้าต้องคุมหน้าตา ให้ทำเองด้วย `::before`/`::after` + `data-tip` (ดู `.line-token-error`)

3. **ปุ่มที่ต้องมีสิทธิ์** — เช็คใน `views/index.html` ส่วนที่อ่าน `me.permissions.sidebar`
   และต้องกันฝั่ง server ด้วย ไม่ใช่ซ่อนแค่ UI

4. **หน้าต่างที่ยิง API ช้า** — ใส่ overlay กำลังโหลด (ดู `setLineModalLoading()` ใน `main.js`)
   overlay ครอบปุ่ม X อยู่แล้ว จึงไม่ต้องถามยืนยันก่อนปิด

5. **Responsive** — เขียนใน `views/css/mobile.css` เท่านั้น (link ท้ายสุดใน index.html)
   ห้ามใส่ media query ในไฟล์อื่น เพราะจะโดน override ตาม source order
   ถ้าเพิ่มหน้าใหม่ที่ใช้ `position: absolute; left: 260px` ต้องเพิ่ม selector
   ในบล็อก `@media (max-width: 768px)` ของ `mobile.css` ด้วย

## เพิ่มหน้าใหม่ ต้องแตะ 6 จุด (ลืมจุดใดจุดหนึ่งแล้วหน้าจะไม่ขึ้น/เพี้ยน)

1. `views/{name}.html` — markup + `<script src="/views/js/{name}.js">` ท้ายไฟล์
2. `views/css/{name}.css` — และ **link ใน `views/index.html`** (ก่อน `mobile.css` เสมอ)
3. `views/js/{name}.js` — ห่อทุกอย่างไว้ใน `init{Name}Page()`
   (สคริปต์ถูกโหลดครั้งเดียว ของที่ต้องตั้งใหม่ทุกครั้งห้ามวางที่ top-level)
4. `views/index.html` — เพิ่ม `<li data-page="{name}">` + เรียก `init{Name}Page()` ใน `finalize()`
5. `utils/permissions.js` — เพิ่ม key ใน `ALL_PAGES`+`PAGE_LABELS`
   (หรือ `ALL_ADMIN_PAGES`+`ADMIN_PAGE_LABELS` ถ้าเป็นหน้าผู้จัดการ)
   และ `index.js` route `/page/:name` ต้องอนุญาตชื่อนี้
6. `views/css/mobile.css` — **เพิ่ม selector ของหน้าใหม่ในบล็อก media query**
   ทุก container ระดับหน้าใช้ `position: absolute; left: 260px` ถ้าไม่ override เป็น `left: 0`
   หน้านั้นจะโดน sidebar ทับบนมือถือ

