# เพิ่มฟีเจอร์ใหม่ให้ Shop

## ข้อมูลที่ต้องการก่อนเริ่ม

กรุณาระบุ:
- ชื่อฟีเจอร์และทำงานอย่างไร
- ต้องการ toggle (on/off) ไหม
- ต้องการ data เพิ่มใน schema ไหม (string/boolean/image)
- แสดงผลใน UI ส่วนไหนของ shop card

## Checklist

### Backend
- [ ] เพิ่ม field ใน `models/Shop.js`
- [ ] เพิ่ม API endpoint ใน `index.js` (ดู pattern ใน `add-api-route.md`)
- [ ] อัปเดต Route Map comment ใน `index.js`
- [ ] เพิ่มชื่อการกระทำใน `AUDIT_ACTIONS` (`utils/auditLog.js`) เพื่อให้ประวัติการใช้งาน
      แสดงเป็นภาษาไทย — ไม่เพิ่มก็ยังบันทึกอยู่ แต่จะขึ้นเป็น path ดิบ

### Frontend
- [ ] เพิ่ม HTML ใน `renderShopCards()` ใน `views/js/main.js`
- [ ] ถ้าเป็นปุ่มในการ์ดร้าน ต้องเช็คสิทธิ์ด้วย `canBtn("key")` และเพิ่ม key
      ใน `ALL_SHOP_BUTTONS` + `SHOP_BUTTON_LABELS` (`utils/permissions.js`)
- [ ] ปุ่มที่ไม่ค่อยได้ใช้/อันตราย ควรไปอยู่ในเมนู Kebab บนมือถือ (ดู `views/CLAUDE.md`)
- [ ] เพิ่ม JavaScript function ใน `views/js/main.js`
- [ ] เพิ่ม CSS ในไฟล์ที่เหมาะสมใน `views/css/`
- [ ] ใช้ CSS variables เท่านั้น — ห้าม hardcode สี
- [ ] ห้ามใช้ emoji — ใช้ Bootstrap Icons

### Toggle Pattern (ถ้าต้องการ toggle)
```js
// Schema
statusFeatureName: Boolean,

// API
app.post('/api/update-featureName-status', async (req, res) => { ... })

// HTML (ใน renderShopCards)
`<input type="checkbox" ${shop.statusFeatureName ? "checked" : ""}
    onchange="updateFeatureNameStatus('${prefix}', this.checked, this)">`

// AUDIT_ACTIONS (utils/auditLog.js) — ให้ประวัติอ่านรู้เรื่อง
"/api/update-featureName-status": {
  action: "setbot.featureName",
  label: "เปิด/ปิด ชื่อฟีเจอร์",
  target: b => pick(b, "prefix"),
  detail: b => onOff(b?.statusFeatureName),
},

// JS
async function updateFeatureNameStatus(prefix, newStatus, checkbox) {
  const response = await fetch("/api/update-featureName-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, statusFeatureName: newStatus })
  });
  const result = await response.json();
  if (!result.success && checkbox) checkbox.checked = !newStatus;
}
```

## ไฟล์ที่ต้องแก้

| ไฟล์ | สิ่งที่ต้องเพิ่ม |
|------|--------------|
| `models/Shop.js` | field ใน ShopSchema |
| `index.js` | API route(s) |
| `views/js/main.js` | HTML template + JS functions |
| `views/css/main.css` หรือไฟล์ใหม่ | styles |
| `utils/permissions.js` | key ของปุ่ม (ถ้ามีปุ่มใหม่) |
| `utils/auditLog.js` | ชื่อการกระทำใน `AUDIT_ACTIONS` |
| `views/css/mobile.css` | responsive ของส่วนที่เพิ่ม |
| `CLAUDE.md` | อัปเดต Schema + API sections |
