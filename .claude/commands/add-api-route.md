# เพิ่ม API Endpoint ใหม่

## ข้อมูลที่ต้องการก่อนเริ่ม

กรุณาระบุ:
- ชื่อ endpoint และ method (GET/POST/DELETE)
- input ที่รับ (body fields / query params)
- output ที่ส่งกลับ
- model ที่เกี่ยวข้อง

## Pattern มาตรฐาน

```js
app.post("/api/{name}", async (req, res) => {
  try {
    const { prefix, ...fields } = req.body;

    // validation
    if (!prefix) return res.status(400).json({ success: false, message: "ระบุ prefix" });

    // logic
    const shop = await Shop.findOneAndUpdate(
      { prefix },
      { ...fields },
      { new: true }
    );

    if (!shop) return res.json({ success: false, message: "ไม่พบร้านค้า" });

    res.json({ success: true, message: "..." });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
```

## Auth / สิทธิ์

route ที่ผู้ใช้เรียกจากหน้าเว็บ ควรใส่ `isAuthenticated` เสมอ
ถ้าต้องจำกัดเฉพาะบางสิทธิ์ ให้เช็คด้วย `getUserPermissions`:

```js
app.get("/api/{name}", isAuthenticated, async (req, res) => {
  const { username, role } = req.session.user;
  if (role !== "OWNER") {
    const perms = await getUserPermissions(role, username);
    if (!(perms.sidebar || []).includes("{permKey}")) {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์" });
    }
  }
  // ...
});
```

สิทธิ์ทั้งหมดนิยามใน `utils/permissions.js` — เพิ่ม key ใหม่ต้องใส่ทั้ง `ALL_PAGES` และ `PAGE_LABELS`

## ข้อควรระวังเรื่อง query

**ห้าม `Shop.find()` โดยไม่ใส่ projection** — `bonusImage`/`passwordImage` รวม ~5 MB
ทำให้ query ใช้เวลา ~40 วินาที จนเกิด `MongoNetworkTimeoutError`

```js
await Shop.find({}, { bonusImage: 0, passwordImage: 0 });  // รายชื่อร้าน
await Shop.findOne({ prefix });                             // ร้านเดียว (~50 ms)
```

## ขั้นตอน

1. ดู Route Map ใน `index.js` (~line 72) เพื่อหาตำแหน่งที่เหมาะสม
2. วาง route ในกลุ่มที่เกี่ยวข้อง (ตามหมวดใน Route Map)
3. อัปเดต Route Map comment (บรรทัดโดยประมาณ)
4. อัปเดต `CLAUDE.md` section API Routes
5. เพิ่ม frontend call ใน `views/js/` ไฟล์ที่เกี่ยวข้อง

## Image Upload Pattern

```js
app.post("/api/upload-{name}", upload.single("image"), async (req, res) => {
  const { prefix } = req.body;
  if (!req.file) return res.status(400).json({ success: false, message: "ไม่พบไฟล์" });

  const imageBuffer = await sharp(req.file.buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg()
    .toBuffer();

  await Shop.findOneAndUpdate({ prefix }, { fieldName: { data: imageBuffer, contentType: "image/jpeg" } });
  res.json({ success: true });
});
```
