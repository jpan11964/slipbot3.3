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
