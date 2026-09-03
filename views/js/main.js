// Global state
window.shopData = [];
window.currentShopPrefix = "";
window.currentEditingPrefix = "";
window.currentEditingIndex = 0;
window.baseURL = "";

async function loadEnvConfig() {
  try {
    const res = await fetch("/api/env");
    const data = await res.json();
    window.baseURL = data.URL;   // ใช้ key = URL
    console.log("baseURL loaded:", window.baseURL);
  } catch (err) {
    console.error("❌ โหลดค่า baseURL ไม่สำเร็จ:", err);
  }
}

// โหลดข้อมูลร้านค้าทั้งหมดเมื่อหน้าเว็บโหลด
async function loadShops() {
    try {
        const response = await fetch("/api/shops");
        const data = await response.json();
        shopData = data.shops || [];
    } catch (error) {
        console.error("❌ โหลดข้อมูลร้านค้าไม่สำเร็จ:", error);
    }
}

// สร้าง HTML ของรายการไลน์ 1 บรรทัด — ใช้ร่วมกันทุกที่ที่วาดรายการไลน์
// (เดิมโค้ดนี้ซ้ำ 3 ที่ ทำให้เครื่องหมาย "ไลน์หลุด" หายไปในบางหน้าจอ)
// ไลน์ที่ tokenError = true จะมีเครื่องหมายสีแดงนำหน้าเสมอ จนกว่าจะบันทึกสำเร็จหรือถูกลบ
// ===== เมนู Kebab (จุดสามจุดแนวตั้ง) =====
// ใช้ร่วมกันทั้งรายการไลน์และรายการธนาคาร
// เดิมวางปุ่ม "แก้ไข/ลบ" ไว้ในแถวตรงๆ พอชื่อยาวปุ่มจะถูกดันจนเรียงไม่ตรงกัน
function renderRowMenu(items) {
    return `
        <div class="row-menu">
            <button class="kebab-btn" title="ตัวเลือก" onclick="toggleRowMenu(event, this)">
                <i class="bi bi-three-dots-vertical"></i>
            </button>
            <div class="row-menu-list" hidden>
                ${items.map(it => `
                <button class="${it.danger ? "danger" : ""}" onclick="closeAllRowMenus(); ${it.action}">
                    <i class="bi ${it.icon}"></i> ${it.label}
                </button>`).join("")}
            </div>
        </div>`;
}

function closeAllRowMenus() {
    document.querySelectorAll(".row-menu-list").forEach(m => { m.hidden = true; });
}

function toggleRowMenu(event, btn) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    const wasOpen = !menu.hidden;
    closeAllRowMenus();
    menu.hidden = wasOpen;
}

// คลิกที่อื่นแล้วปิดเมนู
document.addEventListener("click", (e) => {
    if (!e.target.closest(".row-menu")) closeAllRowMenus();
});

function renderLineItem(prefix, line, index) {
    // ไฟสถานะใช้ช่องเดียวกัน — แดงเมื่อ token มีปัญหา / เขียวเมื่อไลน์ยังทำงานปกติ
    // แยกออกมานอก .row-name เพื่อให้ทุกแถวเรียงตรงกัน และไม่โดน ... ตัดไอคอนทิ้ง
    const statusIcon = line.tokenError
        ? `<span class="line-status line-token-error" data-tip="ไลน์หลุดการเชื่อมต่อ กรุณาตรวจสอบ หรือลบไลน์นี้"><i class="bi bi-exclamation-circle-fill"></i></span>`
        : `<span class="line-status line-ok" data-tip="ไลน์ทำงานปกติ"><i class="bi bi-circle-fill"></i></span>`;
    return `
        <div class="shop-line-item">
            ${statusIcon}
            <span class="row-name" title="${line.linename}">${line.linename}</span>
            ${renderRowMenu([
                { label: "แก้ไข", icon: "bi-pencil", action: `editLine('${prefix}', ${index})` },
                { label: "ลบไลน์นี้", icon: "bi-trash", danger: true, action: `deleteLine('${prefix}', ${index})` },
            ])}
        </div>
    `;
}

function openShopLinesModal(prefix) {
    currentShopPrefix = prefix; // ตั้งค่า prefix ให้ถูกต้อง
    const modal = document.getElementById("shopLinesModal");
    const lineListElement = document.getElementById("line-list");
    const modalTitle = document.getElementById("modal-shop-title"); // ดึง h2

    // ค้นหาร้านค้าที่มี prefix ตรงกัน
    const shop = shopData.find(s => s.prefix === prefix);

    if (!shop) return;

    // **เติมชื่อร้านลงใน Modal**
    modalTitle.innerHTML = `
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/LINE_logo.svg/120px-LINE_logo.svg.png" id="line-logo"/>
            รายการ LINE ร้าน ${shop.name}
        `;

    // แสดงบัญชี LINE
    if (!shop.lines || shop.lines.length === 0) {
        lineListElement.innerHTML = "<p>ไม่มีบัญชี LINE</p>";
    } else {
        lineListElement.innerHTML = shop.lines
            .map((line, index) => renderLineItem(prefix, line, index))
            .join("");
    }

    modal.style.display = "flex";

    // shopData เป็น cache ที่โหลดตอนเปิดหน้า — ดึงสดจาก API ซ้ำ
    // เพื่อให้สถานะ "ไลน์หลุด" ล่าสุดแสดงถูกต้องเสมอ
    loadShopLines(prefix);
}

function closeEditBankModal() {
    document.getElementById("editbankModal").style.display = "none";
}

// ปิด Modal
function closeShopLinesModal() {
    document.getElementById("shopLinesModal").style.display = "none";
}


// เปิด Modal เพิ่มบัญชี LINE
function addNewLine() {
    document.getElementById("addLineModal").style.display = "flex";

    // ดึงชื่อร้านที่เกี่ยวข้องมาแสดง
    const shop = shopData.find(s => s.prefix === currentShopPrefix);
    if (shop) {
        document.getElementById("shopNameTitle").innerText = shop.name.toUpperCase();
    }
}

// สถานะกำลังเชื่อมต่อ LINE ของแต่ละ modal — ใช้กันผู้ใช้ปิดหน้าต่างกลางคัน
const lineModalBusy = { addLineModal: false, editLineModal: false };

// เปิด/ปิด overlay กำลังโหลด + disable ปุ่มบันทึก
function setLineModalLoading(modalId, isLoading, message) {
    lineModalBusy[modalId] = isLoading;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    const overlay = modal.querySelector(".line-modal-loading");
    if (overlay) {
        overlay.classList.toggle("active", isLoading);
        const text = overlay.querySelector("p");
        if (text && message) text.innerText = message;
    }

    const saveBtn = modal.querySelector(".btn-line-save");
    if (saveBtn) saveBtn.disabled = isLoading;
}

// ปิด Modal เพิ่มบัญชี LINE
// ไม่ต้องถามยืนยันตอนกำลังโหลด — overlay บังปุ่ม X อยู่แล้ว ผู้ใช้กดไม่ได้
function closeAddLineModal() {
    setLineModalLoading("addLineModal", false);
    document.getElementById("addLineModal").style.display = "none";
}

function showAlertMessage(message, elementId = "alertMessageAddline", isSuccess = false) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        return;
    }

    alertDiv.innerText = message;
    alertDiv.style.color = isSuccess ? "green" : "red";
    alertDiv.style.backgroundColor = isSuccess ? "#e6ffe6" : "#ffe6e6";
    alertDiv.style.border = isSuccess ? "1px solid green" : "1px solid red";
    alertDiv.style.display = "block";

    setTimeout(() => {
        alertDiv.style.display = "none";
    }, 3000);
}

// บันทึกบัญชี LINE ใหม่
async function saveNewLine() {
    try {
        const newChannelID = document.getElementById("newChannelID").value.trim();
        const newSecretToken = document.getElementById("newSecretToken").value.trim();
        if (!newChannelID || !newSecretToken) {
            showAlertMessage("กรุณากรอกข้อมูลให้ครบถ้วน!", "alertMessageAddline", false);
            return;
        }

        setLineModalLoading("addLineModal", true, "กำลังเชื่อมต่อ LINE...");

        // ใช้ window.baseURL ที่โหลดมาก่อนหน้านี้
        if (!window.baseURL) {
            await loadEnvConfig();
        }
        const baseURL = window.baseURL;

        const channelID = String(newChannelID).slice(-4); // ตัดเลข 4 ตัวท้าย
        const webhookURL = `${baseURL}/webhook/${currentShopPrefix}/${channelID}.bot`;

        console.log("🌐 กำลังตั้งค่า Webhook:", webhookURL);

        const tokenRes = await fetch("/api/get-access-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                channelId: newChannelID,
                secretToken: newSecretToken
            })
        });

        // log หลัง fetch สำเร็จ
        console.log("ได้รับ response แล้ว");

        const tokenData = await tokenRes.json();
        console.log("บันทึกบัญชี LINE สำเร็จ:", tokenData);

        if (!tokenData.success) {
            showAlertMessage(tokenData.message || "ขอ Access Token ไม่สำเร็จ", "alertMessageAddline", false);
            return;
        }

        const newAccessToken = tokenData.access_token;
        const lineName = tokenData.display_name || "LINE";

        // ตั้งค่า Webhook ไปที่ LINE API
        const webhookRes = await fetch("/api/set-webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                accessToken: newAccessToken,
                webhookURL: webhookURL
            })
        });

        const webhookData = await webhookRes.json();

        if (!webhookData.success) {
            console.error("❌ ตั้งค่า Webhook ไม่สำเร็จ:", webhookData);
            showAlertMessage("❌ ตั้งค่า Webhook ไม่สำเร็จ: " + (webhookData.message || "ไม่ทราบสาเหตุ"), "alertMessageAddline", false);
            return;
        }

        // ส่งไป backend เพื่อบันทึก
        const apiResponse = await fetch("/api/add-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prefix: currentShopPrefix,
                linename: lineName,
                access_token: newAccessToken,
                secret_token: newSecretToken,
                channel_id: newChannelID
            })
        });

        const apiResult = await apiResponse.json();
        const status = apiResponse.status;

        if (apiResult.success) {
        setLineModalLoading("addLineModal", false); // เคลียร์ก่อนปิด จะได้ไม่เด้งถามยืนยัน
        closeAddLineModal();
        loadShopLines(currentShopPrefix);
        } else {
        if (status === 400) {
            showAlertMessage("❌ กรุณากรอก ข้อมูลให้ครบถ้วน!", "alertMessageAddline", false);
        } else if (status === 404) {
            showAlertMessage("❌ ไม่พบร้านค้า Prefix นี้!", "alertMessageAddline", false);
        } else if (status === 409) {
            showAlertMessage("❌ ไม่สามารถเพิ่มได้: บัญชี LINE นี้มีอยู่แล้ว", "alertMessageAddline", false);
        } else if (status === 500) {
            showAlertMessage("❌ เกิดข้อผิดพลาดในการเพิ่มบัญชี LINE", "alertMessageAddline", false);
        } else {
            showAlertMessage("เกิดข้อผิดพลาด: " + apiResult.message, "alertMessageAddline", false);
        }
    }
    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดใน saveNewLine:", err);
        showAlertMessage("เกิดข้อผิดพลาดขณะบันทึกบัญชี LINE", "alertMessageAddline", false);
    } finally {
        setLineModalLoading("addLineModal", false);
    }
}

async function loadShopLines(prefix) {
    console.log(`กำลังโหลดบัญชี LINE สำหรับร้าน: ${prefix}`);
    try {
        const res = await fetch("/api/shops");
        const data = await res.json();
        const shop = data.shops.find(s => s.prefix === prefix);
        if (!shop) {
            console.error("❌ ไม่พบร้านจาก API");
            return;
        }

        const lineListElement = document.getElementById("line-list");
        if (!shop.lines || shop.lines.length === 0) {
            lineListElement.innerHTML = "<p>ไม่มีบัญชีไลน์</p>";
            return;
        }

        lineListElement.innerHTML = shop.lines
            .map((line, index) => renderLineItem(prefix, line, index))
            .join("");
        console.log("โหลด LINE สดจาก API สำเร็จ:", shop.lines);
    } catch (err) {
        console.error("❌ โหลด LINE จาก API ไม่สำเร็จ:", err);
    }
}

async function deleteLine(prefix, index) {
    if (!confirm("คุณแน่ใจหรือไม่ที่จะลบบัญชีไลน์นี้?")) return;

    const shop = shopData.find(s => s.prefix === prefix);
    if (!shop) return;

    shop.lines.splice(index, 1); // ลบบัญชี LINE ออกจาก array

    // ส่งคำขอลบไปยัง API
    const response = await fetch("/api/delete-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, index })
    });

    const result = await response.json();
    if (result.success) {
        loadShopLines(prefix); // โหลดรายการใหม่
    } else {
        alert("เกิดข้อผิดพลาด: " + result.message);
    }
}

function editLine(prefix, index) {

    const shop = shopData.find(s => s.prefix === prefix);
    if (!shop) {
        console.error("❌ ไม่พบร้านค้า!");
        return;
    }

    const line = shop.lines[index];
    if (!line) {
        console.error("❌ ไม่พบบัญชี LINE!");
        return;
    }


    // ตั้งค่า prefix และ index ก่อนเปิด Modal
    currentEditingPrefix = prefix;
    currentEditingIndex = index;

    document.getElementById("editChannelID").value = line.channel_id;
    document.getElementById("editSecretToken").value = line.secret_token;

    document.getElementById("editLineModal").style.display = "flex";
}


function closeEditLineModal() {
    setLineModalLoading("editLineModal", false);
    document.getElementById("editLineModal").style.display = "none";
}


// ฟังก์ชันบันทึกการแก้ไข
async function saveEditedLine() {
    const newChannelID = document.getElementById("editChannelID").value.trim();
    const newSecretToken = document.getElementById("editSecretToken").value.trim();

    if (!currentEditingPrefix || currentEditingPrefix.trim() === "") {
        console.log("❌ ไม่พบ prefix ร้านค้า");
        return;
    }

    if (!newChannelID || !newSecretToken) {
        showAlertMessage("กรุณากรอกข้อมูลให้ครบถ้วน!", "alertMessageEditLine", false);
        return;
    }

    try {
        setLineModalLoading("editLineModal", true, "กำลังเชื่อมต่อ LINE...");

        // ใช้ window.baseURL ที่โหลดมาก่อนหน้านี้
        if (!window.baseURL) {
            await loadEnvConfig();
        }

        const baseURL = window.baseURL;
        const shortChannelID = String(newChannelID).slice(-4); // ใช้ 4 ตัวท้ายเพื่อแสดง Webhook
        const webhookURL = `${baseURL}/webhook/${currentShopPrefix}/${shortChannelID}.bot`;

        // ชื่อไลน์เดิม — ส่งไปให้ backend ใช้ตอนแจ้งเตือนถ้าขอ token ไม่สำเร็จ
        const editingShop = shopData.find(s => s.prefix === currentEditingPrefix);
        const editingLinename = editingShop?.lines?.[currentEditingIndex]?.linename || "";

        // ขอ Access Token
        const tokenRes = await fetch("/api/get-access-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                channelId: newChannelID,
                secretToken: newSecretToken,
                prefix: currentEditingPrefix,
                linename: editingLinename
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenData.success) {
            showAlertMessage(tokenData.message || "ขอ Access Token ไม่สำเร็จ", "alertMessageEditLine", false);
            // backend ทำเครื่องหมาย "ไลน์หลุด" ไว้แล้ว → รีเฟรชรายการให้เห็นทันที
            loadShopLines(currentEditingPrefix);
            return;
        }

        const newAccessToken = tokenData.access_token;
        const newLineName = tokenData.display_name || "LINE";

        // ตั้งค่า Webhook
        const webhookRes = await fetch("/api/set-webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                accessToken: newAccessToken,
                webhookURL: webhookURL
            })
        });

        const webhookData = await webhookRes.json();

        if (!webhookData.success) {
            showAlertMessage("❌ ตั้งค่า Webhook ไม่สำเร็จ", "alertMessageEditLine", false);
            return;
        }

        // ส่งไป backend เพื่ออัปเดต
        const apiResponse = await fetch("/api/update-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prefix: currentEditingPrefix,
                index: currentEditingIndex,
                linename: newLineName,
                access_token: newAccessToken,
                secret_token: newSecretToken,
                channel_id: newChannelID
            })
        });

        const apiResult = await apiResponse.json();

        if (apiResult.success) {
            await loadShopLines(currentEditingPrefix);
            setLineModalLoading("editLineModal", false); // เคลียร์ก่อนปิด จะได้ไม่เด้งถามยืนยัน
            closeEditLineModal();
        } else {
            if (apiResponse.status === 409) {
                showAlertMessage("❌ ไม่สามารถบันทึกได้: บัญชีนี้มีอยู่แล้ว (Channel ID ซ้ำ)", "alertMessageEditLine", false);
            } else if (apiResponse.status === 404) {
                showAlertMessage("❌ ไม่พบบัญชีหรือร้านค้าที่ต้องการแก้ไข", "alertMessageEditLine", false);
            } else {
                showAlertMessage(`เกิดข้อผิดพลาด: ${apiResult.message}`, "alertMessageEditLine", false);
            }
        }

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
        showAlertMessage("ไม่สามารถบันทึกการเปลี่ยนแปลงได้", "alertMessageEditLine", false);
    } finally {
        setLineModalLoading("editLineModal", false);
    }
}

function showAlertMessage(message, elementId = "alertMessageEditLine", isSuccess = false) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        return;
    }

    alertDiv.innerText = message;
    alertDiv.style.color = isSuccess ? "green" : "red";
    alertDiv.style.backgroundColor = isSuccess ? "#e6ffe6" : "#ffe6e6";
    alertDiv.style.border = isSuccess ? "1px solid green" : "1px solid red";
    alertDiv.style.display = "block";

    setTimeout(() => {
        alertDiv.style.display = "none";
        console.log(`ซ่อนข้อความแจ้งเตือนที่ ${elementId}`);
    }, 3000);
}


function updateShopLinesUI(prefix) {
    const shop = shopData.find(s => s.prefix === prefix);
    const lineListElement = document.getElementById("line-list");

    if (!shop || !shop.lines || shop.lines.length === 0) {
        lineListElement.innerHTML = "<p>ไม่มีบัญชีไลน์</p>";
        return;
    }

    lineListElement.innerHTML = shop.lines
        .map((line, index) => renderLineItem(prefix, line, index))
        .join("");
}

async function openShopSetBotModal(prefix) {
  const shop = shopData.find(s => s.prefix === prefix);
  if (!shop) return;

  document.getElementById("shopSetbotTitle").innerText = `การตั้งค่าบอท ร้าน: ${shop.name}`;

  const slipCheckOption = shop.slipCheckOption || "duplicate";

  const html = `
        <div class="bottext-settings">
        ${canSetbot("withdraw") ? `
        <div class="setting-box">
            <div class="buttonsBot">
            <label class="switch-label">ปิด / เปิดการถอน</label>
            <label class="switch">
                <input type="checkbox" ${shop.statusWithdraw ? "checked" : ""}
                    onchange="updateWithdrawStatus('${prefix}', this.checked)">
                <span class="slider round"></span>
            </label>
            </div>
        </div>` : ""}

        ${canSetbot("textbot") ? `
        <div class="setting-box">
            <div class="buttonsBot">
            <label class="switch-label">ปิด / เปิดบอทตอบข้อความ</label>
            <label class="switch">
                <input type="checkbox" ${shop.statusBot ? "checked" : ""}
                    onchange="updateTextBotStatus('${prefix}', this.checked)">
                <span class="slider round"></span>
            </label>
            </div>
        </div>` : ""}

        ${canSetbot("slipoption") ? `
        <div class="setting-option-box">
            <div class="slip-check-option">
            <label class="select-label">ตัวเลือกการตรวจสลิป</label>
            <select onchange="updateSlipCheckOption('${shop.prefix}', this.value)">
                <option value="duplicate" ${slipCheckOption === "duplicate" ? "selected" : ""}>
                ตรวจเฉพาะสลิปซ้ำ
                </option>
                <option value="all" ${slipCheckOption === "all" ? "selected" : ""}>
                ตรวจสลิปทุกแบบ
                </option>
            </select>
            </div>
        </div>` : ""}

        ${canSetbot("bonustime") ? `
        <div class="setting-box is-checking" id="bonusBox_${prefix}">
        <!-- ตอนเปิด modal ยังไม่รู้ว่ามีรูปไหม → บังทั้งกล่องไว้ก่อน
             ไม่งั้นเห็นกรอบสล็อตว่างแล้วเข้าใจผิดว่ามีรูปอยู่ -->
        <div class="box-loading"><span class="slot-spinner"></span></div>
        <div class="bonus-row">
            <div class="buttonsBot">
            <label class="switch-label">ปิด / เปิดการตอบ BonusTime</label>
            <label class="switch">
                <input type="checkbox" ${shop.statusBonusTime ? "checked" : ""}
                    onchange="updateBonusTimeStatus('${prefix}', this.checked, this)">
                <span class="slider round"></span>
            </label>
            </div>

            <div class="buttonsBot bonus-upload is-locked" id="bonusUpload_${prefix}">
            <label class="switch-label">อัปโหลดรูป BonusTime (สูงสุด 2 รูป)</label>
            <div class="upload-row-column">
                <label for="bonusImageInput_${prefix}" class="custom-file-btn">
                    <i class="bi bi-cloud-arrow-up"></i> อัปโหลดรูป
                </label>
                <!-- เลือกไฟล์แล้วอัปโหลดทันที ไม่ต้องกดบันทึกอีกรอบ -->
                <input type="file" id="bonusImageInput_${prefix}"
                    name="image"
                    accept="image/*" hidden
                    onchange="uploadBonusImage('${prefix}', this)">
            </div>
            <div class="bonus-actions">
                <!-- โผล่เฉพาะตอนมีรูปครบ 2 รูป — updateBonusActions() เป็นคนสั่ง -->
                <button class="bonus-btn-delete" hidden
                        onclick="deleteAllBonusImage('${prefix}')">ลบทั้งหมด</button>
            </div>
            </div>
        </div>

        <div class="bonus-preview" id="bonusPreviewWrapper_${prefix}">
            ${[1, 2].map(i => `
            <div class="image-slot is-checking" id="bonusSlot${i}_${prefix}"
                 onclick="changeBonusImage('${prefix}', ${i})" title="กดเพื่อเปลี่ยนรูปนี้">
                <img
                    id="bonusPreview${i}_${prefix}"
                    src="/api/get-bonus-image?prefix=${prefix}&index=${i}&t=${Date.now()}"
                    alt="รูป BonusTime ${i}"
                    onload="bonusSlotLoaded('${prefix}', ${i})"
                    onerror="markBonusSlotEmpty('${prefix}', ${i})"
                >
                <div class="slot-hint">
                    <i class="bi bi-arrow-repeat"></i>
                    <span>กดเพื่อเปลี่ยนรูปนี้</span>
                </div>
                <button class="slot-remove" title="ลบรูปนี้"
                        onclick="event.stopPropagation(); deleteBonusImage('${prefix}', ${i})">
                    <i class="bi bi-x-lg"></i>
                </button>
                <div class="slot-loading"><span class="slot-spinner"></span></div>
            </div>`).join("")}
        </div>
        </div>` : ""}

        ${canSetbot("password") ? `
        <div class="setting-box is-checking" id="passwordBox_${prefix}">
        <div class="box-loading"><span class="slot-spinner"></span></div>
        <div class="password-row">
            <div class="buttonsBot">
            <label class="switch-label">ปิด / เปิดการตอบ ลืม password</label>
            <label class="switch">
                <input type="checkbox" ${shop.statusPassword  ? "checked" : ""}
                    onchange="updatePasswordStatus('${prefix}', this.checked, this)">
                <span class="slider round"></span>
            </label>
            </div>

            <div class="buttonsBot password-upload is-locked" id="passwordUpload_${prefix}">
            <label class="switch-label">อัปโหลดรูป ลืม password</label>
            <div class="upload-row-column">
                <label for="passwordImageInput_${prefix}" class="custom-file-btn">
                    <i class="bi bi-cloud-arrow-up"></i> อัปโหลดรูป
                </label>
                <!-- เลือกไฟล์แล้วอัปโหลดทันที ไม่ต้องกดบันทึกอีกรอบ -->
                <input type="file" id="passwordImageInput_${prefix}"
                    name="image"
                    accept="image/*" hidden
                    onchange="uploadPasswordImage('${prefix}', this)">
            </div>
            </div>
        </div>

        <div class="password-preview">
            <div class="image-slot is-checking" id="passwordSlot_${prefix}"
                 onclick="changePasswordImage('${prefix}')" title="กดเพื่อเปลี่ยนรูปนี้">
                <img
                    id="passwordPreview_${prefix}"
                    src="/api/get-password-image?prefix=${prefix}&t=${Date.now()}"
                    alt="รูป ลืม password"
                    onload="passwordSlotLoaded('${prefix}')"
                    onerror="markPasswordSlotEmpty('${prefix}')"
                >
                <div class="slot-hint">
                    <i class="bi bi-arrow-repeat"></i>
                    <span>กดเพื่อเปลี่ยนรูปนี้</span>
                </div>
                <button class="slot-remove" title="ลบรูปนี้"
                        onclick="event.stopPropagation(); deletePasswordImage('${prefix}')">
                    <i class="bi bi-x-lg"></i>
                </button>
                <div class="slot-loading"><span class="slot-spinner"></span></div>
            </div>
        </div>
        </div>` : ""}
  `;

  document.getElementById("shopSetbotBody").innerHTML = html;
  document.getElementById("shopSetbotModal").style.display = "flex";
}

function closeShopSetBotModal() {
  document.getElementById("shopSetbotModal").style.display = "none";
}

// ฟังก์ชันเปิด Modal แก้ไขร้านค้า
function openEditShopModal(name, prefix) {
    document.getElementById("editShopName").value = name;
    document.getElementById("editShopPrefix").value = prefix;
    currentEditingPrefix = prefix;
    document.getElementById("editShopModal").style.display = "flex";
}

// ฟังก์ชันปิด Modal
function closeEditShopModal() {
    document.getElementById("editShopModal").style.display = "none";
}

// เปิด Modal
function openAddShopModal() {
    document.getElementById("addShopModal").style.display = "flex";
}

// ปิด Modal
function closeAddShopModal() {
    document.getElementById("addShopModal").style.display = "none";
}


// ฟังก์ชันบันทึกการแก้ไขร้านค้า
async function saveShopChanges() {
    const newName = document.getElementById("editShopName").value.trim();

    if (!newName) {
        showAlertMessage("กรุณากรอกข้อมูลให้ครบถ้วน!", "alertMessageEditShop", false);
        return;
    }

    const response = await fetch("/api/update-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: currentEditingPrefix, name: newName })
    });

    const result = await response.json();
    if (result.success) {
        window.location.reload(); // รีเฟรชหน้า
    } else {
        alert("เกิดข้อผิดพลาด: " + result.message, "alertMessageEditShop", false);
    }
}

function showAlertMessage(message, elementId = "alertMessageEditShop", isSuccess = false) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        return;
    }
    alertDiv.innerText = message;
    alertDiv.style.color = isSuccess ? "green" : "red";
    alertDiv.style.backgroundColor = isSuccess ? "#e6ffe6" : "#ffe6e6";
    alertDiv.style.border = isSuccess ? "1px solid green" : "1px solid red";
    alertDiv.style.display = "block";

    setTimeout(() => {
        alertDiv.style.display = "none";
    }, 3000);
}

// ฟังก์ชันหลัก โหลดร้านค้า + render
// ===== ตัวกรองเลือกร้านที่แสดง (เก็บต่อ user ใน DB ผ่าน /api/me + /api/my-shop-filter) =====
// คืน array ของ prefix ที่เลือก หรือ null = แสดงทุกร้าน (รวมร้านที่เพิ่มใหม่ภายหลัง)
function getDisplayedPrefixes() {
    const sel = window.__me?.displayedShops;
    return Array.isArray(sel) ? sel : null;
}

function setDisplayedPrefixes(prefixes) {
    const value = Array.isArray(prefixes) ? prefixes : null;
    if (window.__me) window.__me.displayedShops = value; // อัปเดตในหน่วยความจำทันที (dashboard อ่านต่อได้)
    // บันทึกลง DB ต่อ user (ไม่กระทบ user อื่น + คงอยู่ข้ามอุปกรณ์)
    fetch("/api/my-shop-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: value })
    }).catch(err => console.error("บันทึกตัวกรองร้านล้มเหลว:", err));
}

function isShopDisplayed(prefix) {
    const sel = getDisplayedPrefixes();
    return !sel || sel.includes(prefix);
}

function toggleShopFilter() {
    const menu = document.getElementById("shopFilterMenu");
    if (menu) menu.hidden = !menu.hidden;
}

function renderShopFilterMenu() {
    const list = document.getElementById("shopFilterList");
    if (!list) return;
    const sel = getDisplayedPrefixes();
    list.innerHTML = shopData.map(s => {
        const checked = (!sel || sel.includes(s.prefix)) ? "checked" : "";
        return `
            <label class="shop-filter-item">
                <input type="checkbox" value="${s.prefix}" ${checked} onchange="onShopFilterChange()">
                <span>${s.name}</span>
            </label>`;
    }).join("");
    updateShopFilterAllState();
    updateShopFilterLabel();
}

function onShopFilterChange() {
    const boxes = [...document.querySelectorAll("#shopFilterList input[type=checkbox]")];
    const checked = boxes.filter(b => b.checked).map(b => b.value);
    // ถ้าเลือกครบทุกร้าน → เก็บเป็น null (แสดงทุกร้าน รวมร้านใหม่)
    setDisplayedPrefixes(checked.length === boxes.length ? null : checked);
    updateShopFilterAllState();
    updateShopFilterLabel();
    renderShopCards();
}

function toggleShopFilterAll(el) {
    document.querySelectorAll("#shopFilterList input[type=checkbox]")
        .forEach(b => { b.checked = el.checked; });
    onShopFilterChange();
}

function updateShopFilterAllState() {
    const all = document.getElementById("shopFilterAll");
    if (!all) return;
    const boxes = [...document.querySelectorAll("#shopFilterList input[type=checkbox]")];
    all.checked = boxes.length > 0 && boxes.every(b => b.checked);
}

function updateShopFilterLabel() {
    const label = document.getElementById("shopFilterLabel");
    if (!label) return;
    const sel = getDisplayedPrefixes();
    label.textContent = !sel ? "แสดงทุกร้าน" : `แสดง ${sel.length} ร้าน`;
}

// ปิดเมนูเมื่อคลิกนอกตัวกรอง
document.addEventListener("click", (e) => {
    const filter = document.getElementById("shopFilterMenu")?.closest(".shop-filter");
    const menu = document.getElementById("shopFilterMenu");
    if (filter && menu && !menu.hidden && !filter.contains(e.target)) {
        menu.hidden = true;
    }
});

// เช็คสิทธิ์ปุ่ม — OWNER เห็นทุกปุ่ม, คนอื่นเห็นเฉพาะที่ได้รับสิทธิ์
function canBtn(key) {
    const me = window.__me;
    if (!me || me.role === "OWNER") return true;
    return (me.permissions?.shopButtons || []).includes(key);
}

// เช็คสิทธิ์ฟังก์ชันย่อยในปุ่มตั้งค่าบอท
function canSetbot(key) {
    const me = window.__me;
    if (!me || me.role === "OWNER") return true;
    return (me.permissions?.setbotFunctions || []).includes(key);
}

function renderShopCards() {
    const shopListElement = document.getElementById("shop-list");
    if (!shopListElement) return;

    // ปุ่มเพิ่มร้านค้า (footer) — ซ่อนถ้าไม่มีสิทธิ์
    const addBtn = document.querySelector(".btn-add-shop");
    if (addBtn) addBtn.style.display = canBtn("addshop") ? "" : "none";

    if (!shopData.length) {
        shopListElement.innerHTML = '<div class="no-shop">ยังไม่มีข้อมูลร้านค้า</div>';
        return;
    }

    const visible = shopData.filter(s => isShopDisplayed(s.prefix));
    if (!visible.length) {
        shopListElement.innerHTML = '<div class="no-shop">ไม่มีร้านที่เลือกแสดง — เลือกร้านจากตัวกรองด้านบน</div>';
        return;
    }

    let html = "";
    visible.forEach(shop => {
        // บนมือถือปุ่ม "แก้ไข/ลบร้านค้า" ย้ายเข้าเมนู Kebab มุมขวาบนของการ์ด
        // (วาดไว้เสมอ แล้วให้ CSS สลับว่าจะโชว์ปุ่มในแถวหรือเมนู — resize จอแล้วไม่ต้อง re-render)
        const shopMenuItems = [];
        if (canBtn("edit")) shopMenuItems.push({
            label: "แก้ไข", icon: "bi-pencil",
            action: `openEditShopModal('${shop.name}', '${shop.prefix}')`,
        });
        if (canBtn("delete")) shopMenuItems.push({
            label: "ลบร้านค้า", icon: "bi-trash", danger: true,
            action: `deleteShop('${shop.prefix}')`,
        });

        html += `
        <div class="main-page shop-item">
            <div class="shop-info ${shop.status ? "active" : "inactive"}">
            <span class="status-dot"></span>
            <span class="shop-name">${shop.name}</span>
            </div>

            <div class="buttons">
            ${canBtn("toggle") ? `
            <span class="toggle-label">ปิด / เปิดบอท</span>
            <label class="switch">
                <input type="checkbox" ${shop.status ? "checked" : ""} onchange="handleToggle('${shop.prefix}', this)">
                <span class="slider"></span>
            </label>` : ""}
            ${canBtn("line") ? `
            <button class="btn btn-line" onclick="openShopLinesModal('${shop.prefix}')">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/LINE_logo.svg/120px-LINE_logo.svg.png" class="btn-logo" alt="LINE Logo"/>
            ไลน์ร้าน
            </button>` : ""}
            ${canBtn("bank") ? `<button class="btn btn-bank" onclick="openBankModal('${shop.prefix}')">จัดการบัญชีธนาคาร</button>` : ""}
            ${canBtn("setbot") ? `<button class="btn btn-setBot" onclick="openShopSetBotModal('${shop.prefix}')">ตั้งค่าบอท</button>` : ""}
            ${canBtn("edit") ? `<button class="btn btn-edit" onclick="openEditShopModal('${shop.name}', '${shop.prefix}')">แก้ไข</button>` : ""}
            ${canBtn("delete") ? `<button class="btn btn-delete" onclick="deleteShop('${shop.prefix}')">ลบร้านค้า</button>` : ""}
            </div>
            ${shopMenuItems.length ? `<div class="shop-row-menu">${renderRowMenu(shopMenuItems)}</div>` : ""}
        </div>
        `;
    });

    shopListElement.innerHTML = html;
}

async function loadShopsAndRender() {
    try {
        const response = await fetch("/api/shops");
        const data = await response.json();
        shopData = data.shops || [];

        renderShopFilterMenu();
        renderShopCards();
        initAddShopBtnWatcher();

    } catch (err) {
        console.error("❌ โหลดข้อมูลร้านค้าไม่สำเร็จ:", err);
    }
}

// ซ่อนปุ่ม "เพิ่มร้านค้า" เมื่อมี modal ใดเปิดอยู่ (กันปุ่มลอยทับ modal)
function updateAddShopBtnVisibility() {
    const addBtn = document.querySelector(".btn-add-shop");
    if (!addBtn) return;
    if (!canBtn("addshop")) { addBtn.style.display = "none"; return; }
    const anyModalOpen = Array.from(document.querySelectorAll(".modal"))
        .some(m => getComputedStyle(m).display !== "none");
    addBtn.style.display = anyModalOpen ? "none" : "";
}

function initAddShopBtnWatcher() {
    // main.html ถูก inject ใหม่ทุกครั้งที่เข้าหน้าหลัก → modal เป็น node ใหม่ ต้อง re-bind
    if (window._addShopWatcher) window._addShopWatcher.disconnect();
    const obs = new MutationObserver(updateAddShopBtnVisibility);
    document.querySelectorAll(".modal").forEach(m =>
        obs.observe(m, { attributes: true, attributeFilter: ["style", "class"] })
    );
    window._addShopWatcher = obs;
}

// Event เริ่มต้น
(async () => {
    await loadShopsAndRender();
})();

function openBankModal(prefix) {
    let modal = document.getElementById("bankModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "bankModal";
        modal.className = "modal";
        document.body.appendChild(modal);
    }

    modal.style.display = "flex";  // เปิด Modal

    fetch("/api/bank-accounts")
        .then((res) => res.json())
        .then((data) => {
            const accounts = data.accounts[prefix] || [];
            const listContainer = document.getElementById("bank-list");
            const bankTitle = document.getElementById("BankTitle");

            listContainer.innerHTML = "";
            const shop = shopData.find(s => s.prefix === prefix);
            if (shop) {
                shop.bankAccounts = accounts;
                bankTitle.textContent = `รายการบัญชีธนาคารร้าน: ${shop.name}`;
            }

            if (accounts.length === 0) {
                listContainer.innerHTML = "<p>ยังไม่มีบัญชีธนาคารสำหรับร้านนี้</p>";
            } else {
                accounts.forEach((account, index) => {
                    const row = document.createElement("div");
                    row.className = "bank-row";
                    row.innerHTML = `
              <div class="shop-info ${account.status ? "active" : "inactive"}">
                <span class="status-dot"></span>
                <div class="bank-text">
                  <span class="shop-name row-name" title="${account.name}">${account.name}</span>
                  <span class="bank-account-no">${account.account || "-"}</span>
                </div>
              </div>
              <div class="slip-check-option">
                <label class="switchBank">
                  <input type="checkbox" ${account.status ? "checked" : ""} onchange="toggleBankStatus('${prefix}', ${index}, this)">
                  <span class="slider"></span>
                </label>
              </div>
              ${renderRowMenu([
                { label: "แก้ไข", icon: "bi-pencil", action: `openEditBankModal('${prefix}', ${index})` },
                { label: "ลบบัญชีนี้", icon: "bi-trash", danger: true, action: `deleteBank('${prefix}', ${index})` },
              ])}
            `;
                    listContainer.appendChild(row);
                });
            }

            // เพิ่มปุ่มด้านล่างรายการ
            const addBtn = document.createElement("button");
            addBtn.className = "btn btn-add-bank";
            addBtn.textContent = "+ เพิ่มธนาคารใหม่";
            addBtn.style.marginTop = "30px";
            addBtn.style.fontSize = "16px";
            addBtn.style.padding = "10px 20px";
            addBtn.style.borderRadius = "8px";
            addBtn.addEventListener("click", () => openAddBankModal(prefix));
            listContainer.appendChild(addBtn);
            
            modal.style.display = "flex";
        })
        .catch((err) => {
            console.error("เกิดข้อผิดพลาดในการโหลดบัญชีธนาคาร:", err);
        });
}

function openAddBankModal(prefix) {
    const modal = document.getElementById("addbankModal");

    if (!modal) {
        console.error("❌ ไม่พบ modal addbankModal");
        return;
    }

    modal.style.display = "flex";
    modal.dataset.prefix = prefix;  // เก็บ prefix ไว้ใน modal

    const shop = shopData.find(s => s.prefix === prefix);
    if (!shop) {
        console.error("❌ ไม่พบข้อมูลร้านสำหรับ prefix:", prefix);
        document.getElementById("lineShopNameTitle").textContent = "ไม่พบร้าน";
        return;
    }

    document.getElementById("lineShopNameTitle").textContent = `เพิ่มบัญชีธนาคารสำหรับร้าน: ${shop.name}`;
    document.getElementById("bankAccountName").value = "";
    document.getElementById("bankAccountNumber").value = "";
}

// ปิด Modal
function closeAddBankModal() {
    document.getElementById("addbankModal").style.display = "none";
}

function closeBankModal() {
    const modal = document.getElementById("bankModal");
    if (modal) {
        modal.style.display = "none";  // ซ่อน Modal
    }
}

async function toggleBankStatus(prefix, index, checkbox) {
    const newStatus = checkbox.checked;
    try {
        const res = await fetch("/api/update-bank-status", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prefix, index, status: newStatus }),
        });

        const result = await res.json();
        if (result.success) {
            openBankModal(prefix);
        } else {
            alert("ไม่สามารถอัปเดตสถานะบัญชีได้: " + result.message);
            checkbox.checked = !newStatus;
        }
    } catch (err) {
        console.error("เกิดข้อผิดพลาดในการอัปเดตสถานะบัญชีธนาคาร", err);
        alert("เกิดข้อผิดพลาดในการอัปเดตสถานะบัญชีธนาคาร");
        checkbox.checked = !newStatus;
    }
}

function openEditBankModal(prefix, index) {
    const modal = document.getElementById("editbankModal");
    const shop = shopData.find(s => s.prefix === prefix);
    if (!shop || !shop.bankAccounts || !shop.bankAccounts[index]) {
        console.error("ไม่พบข้อมูลร้านหรือบัญชีธนาคาร");
        return;
    }

    const account = shop.bankAccounts[index];
    document.getElementById("editBankAccountName").value = account.name;
    document.getElementById("editBankAccountNumber").value = account.account;

    // บันทึก prefix และ index ไว้ใน data attribute ของ modal
    modal.dataset.prefix = prefix;
    modal.dataset.index = index;

    modal.style.display = "flex";
}

function closeEditBankModal() {
    document.getElementById("editbankModal").style.display = "none";
}

function showAlertMessage(message, elementId = "alertMessageAddBank", isSuccess = false) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        return;
    }
    alertDiv.innerText = message;
    alertDiv.style.color = isSuccess ? "green" : "red";
    alertDiv.style.backgroundColor = isSuccess ? "#e6ffe6" : "#ffe6e6";
    alertDiv.style.border = isSuccess ? "1px solid green" : "1px solid red";
    alertDiv.style.display = "block";

    setTimeout(() => {
        alertDiv.style.display = "none";
    }, 3000);
}

function showAlertMessage(message, elementId = "alertMessageEditBank", isSuccess = false) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        return;
    }
    alertDiv.innerText = message;
    alertDiv.style.color = isSuccess ? "green" : "red";
    alertDiv.style.backgroundColor = isSuccess ? "#e6ffe6" : "#ffe6e6";
    alertDiv.style.border = isSuccess ? "1px solid green" : "1px solid red";
    alertDiv.style.display = "block";

    setTimeout(() => {
        alertDiv.style.display = "none";
    }, 3000);
}


function saveNewBank() {
    const modal = document.getElementById("addbankModal");
    const prefix = modal.dataset.prefix; // ดึง prefix จาก modal
    const name = document.getElementById("bankAccountName").value.trim();
    const number = document.getElementById("bankAccountNumber").value.trim();

    if (!name || !number) {
        showAlertMessage("กรุณากรอกชื่อบัญชีและเลขบัญชีให้ครบ", "alertMessageAddBank", false);
        return;
    }

    fetch("/api/add-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, name, number })
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            closeAddBankModal();
            openBankModal(prefix); // โหลดใหม่
            restartWebhooks();
        } else {
            showAlertMessage("❌ ไม่สามารถเพิ่มบัญชีธนาคารได้: " + result.message, "alertMessageAddBank", false);
        }
    })
    .catch(err => {
        console.error("เกิดข้อผิดพลาดในการเพิ่มบัญชีธนาคาร", err);
    });
}

function saveEditedBank() {
    const modal = document.getElementById("editbankModal");
    const prefix = modal.dataset.prefix;
    const index = Number(modal.dataset.index); // อย่าลืมแปลงเป็น number

    const name = document.getElementById("editBankAccountName").value.trim();
    const number = document.getElementById("editBankAccountNumber").value.trim();

    if (!name || !number) {
        showAlertMessage("กรุณากรอกชื่อบัญชีและเลขบัญชีให้ครบ", "alertMessageEditBank", false);
        return;
    }

    fetch("/api/edit-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, index, name, number }),
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            closeEditBankModal();
            openBankModal(prefix);
        } else {
            showAlertMessage("❌ ไม่สามารถแก้ไขบัญชีธนาคารได้: " + result.message, "alertMessageEditBank", false);
        }
    })
    .catch(err => {
        console.error("เกิดข้อผิดพลาดในการแก้ไขบัญชีธนาคาร:", err);
        showAlertMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "alertMessageEditBank", false);
    });
}

function deleteBank(prefix, index) {
    if (!confirm("คุณแน่ใจหรือไม่ที่จะลบบัญชีนี้?")) return;
    fetch("/api/delete-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, index }),
    })
        .then((res) => res.json())
        .then((result) => {
            if (result.success) {
                openBankModal(prefix);
            } else {
                alert("ไม่สามารถลบบัญชีธนาคารได้: " + result.message);
            }
        })
        .catch((err) => {
            console.error("เกิดข้อผิดพลาดในการลบบัญชีธนาคาร", err);
        });
}


function showAlertMessage(message, elementId = "alertMessageShop", isSuccess = false) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        return;
    }
    alertDiv.innerText = message;
    alertDiv.style.color = isSuccess ? "green" : "red";
    alertDiv.style.backgroundColor = isSuccess ? "#e6ffe6" : "#ffe6e6";
    alertDiv.style.border = isSuccess ? "1px solid green" : "1px solid red";
    alertDiv.style.display = "block";

    setTimeout(() => {
        alertDiv.style.display = "none";
    }, 3000);
}

async function addShop() {
    const shopName = document.getElementById("shopName").value.trim();
    const shopPrefix = document.getElementById("shopPrefix").value.trim();

    if (!shopName || !shopPrefix) {
        showAlertMessage("กรุณากรอกข้อมูลให้ครบถ้วน!", "alertMessageShop", false);
        return;
    }

    const response = await fetch("/api/add-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shopName, prefix: shopPrefix })
    });

    const result = await response.json();
    if (result.success) {
        window.location.reload(); // รีเฟรชหน้า
    } else {
        showAlertMessage(result.message, "alertMessageShop", false);
    }
}

function closeBotSettingsModal() {
    document.getElementById("botSettingsModal").style.display = "none";
}


// ฟังก์ชันสำหรับอัปเดตสถานะร้านผ่าน API
async function updateShopStatus(prefix, newStatus) {
    try {
        const response = await fetch("/api/update-shop-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, status: newStatus })
        });

        const result = await response.json();
        if (result.success) {
        } else {
            console.error(`❌ ไม่สามารถอัปเดตสถานะร้าน: ${result.message}`);
        }
    } catch (error) {
        console.error("❌ Error updating shop status:", error);
    }
}

// ฟังก์ชันสำหรับจัดการสวิตช์ (Toggle) เมื่อมีการเปลี่ยนแปลง
async function handleToggle(prefix, checkbox) {
    const newStatus = checkbox.checked; // true: เปิด, false: ปิด
    try {
        const response = await fetch("/api/update-shop", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ prefix, status: newStatus })
        });

        const result = await response.json();
        if (result.success) {
            // อัปเดต state ในหน่วยความจำ + UI ของ card นี้เท่านั้น (ไม่รีโหลดทั้งหน้า)
            const shop = shopData.find(s => s.prefix === prefix);
            if (shop) shop.status = newStatus;

            const shopInfo = checkbox.closest(".shop-item")?.querySelector(".shop-info");
            if (shopInfo) {
                shopInfo.classList.toggle("active", newStatus);
                shopInfo.classList.toggle("inactive", !newStatus);
            }
        } else {
            alert("❌ ไม่สามารถอัปเดตสถานะร้านค้าได้: " + result.message);
            checkbox.checked = !newStatus; // กลับสถานะเดิมถ้าล้มเหลว
        }
    } catch (error) {
        console.error("Error updating shop status:", error);
        alert("❌ เกิดข้อผิดพลาดในการอัปเดตสถานะร้านค้า");
        checkbox.checked = !newStatus; // กลับสถานะเดิมถ้าล้มเหลว
    }
}

// ฟังก์ชันสำหรับลบร้านค้า
async function deleteShop(prefix) {
    if (!confirm("คุณแน่ใจหรือไม่ที่จะลบร้านค้า?")) return;
    try {
        const response = await fetch("/api/delete-shop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix })
        });
        if (!response.ok) {
            throw new Error("ไม่สามารถลบร้านค้าได้");
        }
        const result = await response.json();
        if (result.success) {
            window.location.reload();
        } else {
            alert("ไม่สามารถลบร้านค้าได้");
        }
    } catch (error) {
        console.error("Error deleting shop:", error);
        alert("เกิดข้อผิดพลาดในการลบร้านค้า");
    }
}

async function updateTextBotStatus(prefix, newStatusBot) {
    try {
        const response = await fetch("/api/update-textbot-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, statusBot: newStatusBot })
        });

        const result = await response.json();
        if (!result.success) {
            console.error(`❌ ไม่สามารถอัปเดตสถานะบอทข้อความ: ${result.message}`);
        }
    } catch (error) {
        console.error("❌ Error updating text bot status:", error);
    }
}

async function updateWithdrawStatus(prefix, newWithdrawStatus) {
    try {
        const response = await fetch("/api/update-withdraw-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, statusWithdraw: newWithdrawStatus })
        });

        const result = await response.json();
        if (!result.success) {
            console.error(`❌ ไม่สามารถอัปเดตสถานะ เปิด/ปิด ถอน: ${result.message}`);
        }
    } catch (error) {
        console.error("❌ Error updating withdraw status:", error);
    }
}

async function updateBonusTimeStatus(prefix, newBonusTimeStatus, checkbox) {
  try {
    if (newBonusTimeStatus) {
      // ตรวจว่ามีรูปอย่างน้อย 1 slot
      const check1 = await fetch(`/api/get-bonus-image?prefix=${prefix}&index=1&t=${Date.now()}`);
      const check2 = await fetch(`/api/get-bonus-image?prefix=${prefix}&index=2&t=${Date.now()}`);
      if (!check1.ok && !check2.ok) {
        alert("❌ กรุณาอัปโหลดรูป BonusTime ก่อนเปิดการใช้งาน");
        if (checkbox) checkbox.checked = false;
        return;
      }
    }

    // อัปเดตสถานะจริง
    const response = await fetch("/api/update-bonusTime-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, statusBonusTime: newBonusTimeStatus })
    });

    const result = await response.json();
    if (!result.success) {
      console.error(`❌ ไม่สามารถอัปเดตสถานะ BonusTime: ${result.message}`);
    }
  } catch (error) {
    console.error("❌ Error updating BonusTime status:", error);
  }
}

async function updatePasswordStatus(prefix, newPasswordStatus, checkbox) {
  try {
    if (newPasswordStatus) {
      const check = await fetch(`/api/get-password-image?prefix=${prefix}&t=${Date.now()}`);
      if (!check.ok) {
        alert("❌ กรุณาอัปโหลดรูปลืม password ก่อนเปิดการใช้งาน");
        if (checkbox) checkbox.checked = false; // ใช้ parameter checkbox
        return;
      }
    }

    // อัปเดตสถานะจริง
    const response = await fetch("/api/update-password-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, statusPassword: newPasswordStatus })
    });

    const result = await response.json();
    if (!result.success) {
      console.error(`❌ ไม่สามารถอัปเดตสถานะ Password: ${result.message}`);
    }
  } catch (error) {
    console.error("❌ Error updating Password status:", error);
  }
}

// ใช้กับรูป password เท่านั้น — รูป BonusTime อัปโหลดทันทีที่เลือกไฟล์ ไม่มีช่องชื่อไฟล์แล้ว
function showFileName(input, prefix, type) {
  const file = input.files[0];
  const fileNameSpan = document.getElementById(
    type === "bonus"
      ? `bonusFileName_${prefix}`
      : `passwordFileName_${prefix}`
  );
  if (!fileNameSpan) return;

  if (file) {
    let name = file.name;

    // ถ้าชื่อยาวเกิน 30 ตัวอักษร → ตัดกลางออก
    if (name.length > 30) {
      const start = name.substring(0, 10);
      const end = name.substring(name.length - 10);
      name = `${start}...${end}`;
    }

    fileNameSpan.textContent = name;
  } else {
    fileNameSpan.textContent = "ยังไม่ได้เลือกไฟล์";
  }
}


async function deleteBonusImage(prefix, index) {
    if (!confirm(`ยืนยันลบรูป BonusTime รูปที่ ${index}?`)) return;

    // ใช้สถานะเดียวกับตอนอัปโหลด (เบลอ + สปินเนอร์) เพื่อบอกว่ากำลังลบอยู่
    const slot = document.getElementById(`bonusSlot${index}_${prefix}`);
    slot?.classList.add("is-loading");

    try {
        const response = await fetch("/api/delete-bonus-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, index: String(index) })
        });

        const result = await response.json();
        if (result.success) {
            const img = document.getElementById(`bonusPreview${index}_${prefix}`);
            if (img) img.src = "";
            markBonusSlotEmpty(prefix, index);   // ซ่อนสล็อตทั้งอัน (เคลียร์ is-loading ให้ด้วย)
        } else {
            slot?.classList.remove("is-loading");
            alert("ไม่สามารถลบรูปได้: " + result.message);
        }
    } catch (err) {
        slot?.classList.remove("is-loading");
        console.error("❌ Error deleting bonus image:", err);
        alert("เกิดข้อผิดพลาดในการลบรูป");
    }
}

async function deleteAllBonusImage(prefix) {
    if (!confirm("ยืนยันลบรูป BonusTime ทั้งหมด? (การตอบ BonusTime จะถูกปิดด้วย)")) return;

    // แสดงสถานะกำลังลบบนทุกรูปที่ยังอยู่
    const slots = [1, 2]
        .map(i => document.getElementById(`bonusSlot${i}_${prefix}`))
        .filter(s => s && !s.hidden);
    slots.forEach(s => s.classList.add("is-loading"));

    try {
        const response = await fetch("/api/delete-bonus-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix })
        });

        const result = await response.json();
        if (result.success) {
            for (const i of [1, 2]) {
                const img = document.getElementById(`bonusPreview${i}_${prefix}`);
                if (img) img.src = "";
                markBonusSlotEmpty(prefix, i);
            }

            const switchInput = document.querySelector(
                `input[type="checkbox"][onchange*="updateBonusTimeStatus('${prefix}"]`
            );
            if (switchInput) switchInput.checked = false;

            await fetch("/api/update-bonusTime-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prefix, statusBonusTime: false })
            });
        } else {
            slots.forEach(s => s.classList.remove("is-loading"));
            alert("ไม่สามารถลบรูปได้: " + result.message);
        }
    } catch (err) {
        slots.forEach(s => s.classList.remove("is-loading"));
        console.error("❌ Error deleting all bonus images:", err);
        alert("เกิดข้อผิดพลาดในการลบรูป");
    }
}

// กดที่รูป → เลือกไฟล์ใหม่มาแทนที่สล็อตนั้น
async function changeBonusImage(prefix, index) {
    const slot = document.getElementById(`bonusSlot${index}_${prefix}`);
    if (!slot || slot.hidden) return;            // สล็อตว่าง — ให้ใช้ปุ่มอัปโหลดแทน
    if (slot.classList.contains("is-loading")) return;  // กำลังอัปโหลดอยู่

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    document.body.appendChild(fileInput);

    fileInput.onchange = async () => {
        const file = fileInput.files[0];
        document.body.removeChild(fileInput);
        if (!file) return;
        await putBonusImage({
            prefix, index, file,
            url: "/api/upload-change-bonus-image",
            isChange: true,
        });
    };

    fileInput.click();
}

async function deletePasswordImage(prefix) {
    if (!confirm("ยืนยันลบรูป ลืม password? (การตอบ ลืม password จะถูกปิดด้วย)")) return;

    // แสดงสถานะกำลังลบบนรูป (เบลอ + สปินเนอร์) เหมือนตอนอัปโหลด
    const slot = document.getElementById(`passwordSlot_${prefix}`);
    slot?.classList.add("is-loading");

    try {
        const response = await fetch("/api/delete-password-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix })
        });

        const result = await response.json();
        if (result.success) {
            const img = document.getElementById(`passwordPreview_${prefix}`);
            if (img) img.src = "";
            markPasswordSlotEmpty(prefix);   // ซ่อนสล็อตทั้งอัน (เคลียร์ is-loading ให้ด้วย)

            const switchInput = document.querySelector(
                `input[type="checkbox"][onchange*="updatePasswordStatus('${prefix}"]`
            );
            if (switchInput) {
                switchInput.checked = false;
            }
            
            await fetch("/api/update-password-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prefix, statusPassword: false })
            });
        } else {
            slot?.classList.remove("is-loading");
            alert("ไม่สามารถลบรูปได้: " + result.message);
        }
    } catch (err) {
        slot?.classList.remove("is-loading");
        console.error("❌ Error deleting password image:", err);
        alert("เกิดข้อผิดพลาดในการลบรูป");
    }
}


// ===== รูป BonusTime =====
// เลือกไฟล์แล้วอัปโหลดทันที (ไม่มีปุ่มบันทึกแล้ว)
// ระหว่างอัปโหลดจะโชว์รูปที่เลือกแบบเบลอ + สปินเนอร์ พอเสร็จค่อยสลับเป็นรูปจริง

// ตอนเปิด modal ยังไม่รู้ว่าร้านนี้มีรูปไหม สล็อตจึงเริ่มที่สถานะ "กำลังตรวจสอบ"
// (สปินเนอร์ + ล็อกปุ่มอัปโหลด) แล้วค่อยเผยผลจริงเมื่อรูปโหลดเสร็จหรือโหลดไม่ได้
// ไม่งั้นจะเห็นกล่องเปล่าพร้อมปุ่มลบ ทำให้เข้าใจผิดว่ามีรูปอยู่แล้ว
const bonusChecksLeft = {};

function finishBonusCheck(prefix) {
  bonusChecksLeft[prefix] = (bonusChecksLeft[prefix] ?? 2) - 1;
  if (bonusChecksLeft[prefix] > 0) return;   // รอให้รู้ผลครบทั้ง 2 สล็อตก่อน
  document.getElementById(`bonusUpload_${prefix}`)?.classList.remove("is-locked");
  document.getElementById(`bonusBox_${prefix}`)?.classList.remove("is-checking");
}

// นับสล็อตที่มีรูปจริง (สล็อตว่างถูกซ่อนไว้)
function countBonusImages(prefix) {
  return [1, 2].filter(i => {
    const slot = document.getElementById(`bonusSlot${i}_${prefix}`);
    return slot && !slot.hidden;
  }).length;
}

// ปุ่ม "ลบทั้งหมด" จะโผล่เฉพาะตอนมีรูปครบ 2 รูป
// (มีรูปเดียวก็ใช้ปุ่ม X บนรูปนั้นได้เลย ไม่ต้องมีปุ่มซ้ำซ้อน)
function updateBonusActions(prefix) {
  const btn = document.querySelector(`#bonusUpload_${prefix} .bonus-btn-delete`);
  if (btn) btn.hidden = countBonusImages(prefix) < 2;
}

// รูปโหลดได้ = สล็อตนี้มีรูปจริง
// นับเฉพาะรอบตรวจสอบครั้งแรกเท่านั้น (onload ยิงซ้ำทุกครั้งที่เปลี่ยนรูป)
function bonusSlotLoaded(prefix, index) {
  const slot = document.getElementById(`bonusSlot${index}_${prefix}`);
  if (!slot) return;
  const wasChecking = slot.classList.contains("is-checking");
  slot.classList.remove("is-checking");
  if (wasChecking) finishBonusCheck(prefix);
  updateBonusActions(prefix);
}

// สล็อตที่ไม่มีรูปจะถูกซ่อน — โหลดรูปไม่สำเร็จ = สล็อตว่าง
// ฟังก์ชันนี้ถูกเรียกตอนลบรูปด้วย จึงต้องเช็คก่อนว่าอยู่ในรอบตรวจสอบหรือไม่
function markBonusSlotEmpty(prefix, index) {
  const slot = document.getElementById(`bonusSlot${index}_${prefix}`);
  if (!slot) return;
  const wasChecking = slot.classList.contains("is-checking");
  slot.classList.remove("is-checking");
  slot.classList.remove("is-loading");
  slot.hidden = true;
  if (wasChecking) finishBonusCheck(prefix);
  updateBonusActions(prefix);
}

function getEmptyBonusSlot(prefix) {
  for (const i of [1, 2]) {
    const slot = document.getElementById(`bonusSlot${i}_${prefix}`);
    if (slot && slot.hidden) return i;
  }
  return null;
}

// รอให้รูปจริงโหลดเสร็จก่อนค่อยเอาเบลอออก จะได้ไม่กระพริบ
function preloadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = im.onerror = () => resolve();
    im.src = src;
  });
}

async function putBonusImage({ prefix, index, file, url, isChange }) {
  const slot = document.getElementById(`bonusSlot${index}_${prefix}`);
  const img = document.getElementById(`bonusPreview${index}_${prefix}`);
  if (!slot || !img) return;

  // โชว์รูปที่เพิ่งเลือกทันที (เบลอ + สปินเนอร์) ผู้ใช้จะรู้ว่ากำลังทำงานอยู่
  const localUrl = URL.createObjectURL(file);
  slot.hidden = false;
  img.src = localUrl;
  slot.classList.add("is-loading");

  const formData = new FormData();
  formData.append("image", file);
  formData.append("prefix", prefix);
  if (isChange) formData.append("index", String(index));

  try {
    const res = await fetch(url, { method: "POST", body: formData });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || "อัปโหลดรูปไม่สำเร็จ");

    // ตอนเพิ่มรูปใหม่ เซิร์ฟเวอร์เป็นคนตัดสินใจว่าลงสล็อตไหน
    const finalIndex = isChange ? index : (result.slot === "image2" ? 2 : 1);
    const finalSlot = document.getElementById(`bonusSlot${finalIndex}_${prefix}`);
    const finalImg = document.getElementById(`bonusPreview${finalIndex}_${prefix}`);

    const realUrl = `/api/get-bonus-image?prefix=${prefix}&index=${finalIndex}&t=${Date.now()}`;
    await preloadImage(realUrl);

    if (finalSlot && finalImg) {
      finalSlot.hidden = false;
      finalImg.src = realUrl;
      finalSlot.classList.remove("is-loading");
    }
    if (finalSlot !== slot) slot.classList.remove("is-loading");
  } catch (err) {
    console.error("❌ อัปโหลดรูป BonusTime ไม่สำเร็จ:", err);
    alert("❌ " + err.message);
    slot.classList.remove("is-loading");
    // คืนสภาพเดิม — ถ้าไม่มีรูปเดิมอยู่ onerror จะซ่อนสล็อตให้เอง
    img.src = `/api/get-bonus-image?prefix=${prefix}&index=${index}&t=${Date.now()}`;
  } finally {
    URL.revokeObjectURL(localUrl);
  }
}

// กดปุ่ม "อัปโหลดรูป" → ลงสล็อตว่างถัดไป
async function uploadBonusImage(prefix, input) {
  const file = input.files?.[0];
  input.value = "";   // เคลียร์ เพื่อให้เลือกไฟล์เดิมซ้ำได้
  if (!file) return;

  const index = getEmptyBonusSlot(prefix);
  if (!index) {
    alert("มีรูปครบ 2 รูปแล้ว — กดที่รูปเพื่อเปลี่ยนรูปนั้นแทน");
    return;
  }
  await putBonusImage({ prefix, index, file, url: "/api/upload-bonus-image", isChange: false });
}

// ===== รูป ลืม password (สล็อตเดียว) =====
// ใช้หลักการเดียวกับรูป BonusTime — เลือกไฟล์แล้วอัปโหลดทันที + เบลอระหว่างรอ

// ปลดล็อกปุ่มอัปโหลดเมื่อรู้ผลแล้วว่ามีรูปหรือไม่
function finishPasswordCheck(prefix) {
  document.getElementById(`passwordUpload_${prefix}`)?.classList.remove("is-locked");
  document.getElementById(`passwordBox_${prefix}`)?.classList.remove("is-checking");
}

function passwordSlotLoaded(prefix) {
  const slot = document.getElementById(`passwordSlot_${prefix}`);
  if (!slot) return;
  const wasChecking = slot.classList.contains("is-checking");
  slot.classList.remove("is-checking");
  if (wasChecking) finishPasswordCheck(prefix);
}

function markPasswordSlotEmpty(prefix) {
  const slot = document.getElementById(`passwordSlot_${prefix}`);
  if (!slot) return;
  const wasChecking = slot.classList.contains("is-checking");
  slot.classList.remove("is-checking");
  slot.classList.remove("is-loading");
  slot.hidden = true;
  if (wasChecking) finishPasswordCheck(prefix);
}

async function putPasswordImage(prefix, file) {
  const slot = document.getElementById(`passwordSlot_${prefix}`);
  const img = document.getElementById(`passwordPreview_${prefix}`);
  if (!slot || !img) return;

  const localUrl = URL.createObjectURL(file);
  slot.hidden = false;
  img.src = localUrl;
  slot.classList.add("is-loading");

  const formData = new FormData();
  formData.append("image", file);
  formData.append("prefix", prefix);

  try {
    const res = await fetch("/api/upload-password-image", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || "อัปโหลดรูปไม่สำเร็จ");

    const realUrl = `/api/get-password-image?prefix=${prefix}&t=${Date.now()}`;
    await preloadImage(realUrl);
    img.src = realUrl;
  } catch (err) {
    console.error("❌ อัปโหลดรูป password ไม่สำเร็จ:", err);
    alert("❌ " + err.message);
    img.src = `/api/get-password-image?prefix=${prefix}&t=${Date.now()}`;
  } finally {
    slot.classList.remove("is-loading");
    URL.revokeObjectURL(localUrl);
  }
}

// กดปุ่ม "อัปโหลดรูป"
async function uploadPasswordImage(prefix, input) {
  const file = input.files?.[0];
  input.value = "";   // เคลียร์ เพื่อให้เลือกไฟล์เดิมซ้ำได้
  if (!file) return;
  await putPasswordImage(prefix, file);
}

// กดที่รูป → เลือกไฟล์ใหม่มาแทน
async function changePasswordImage(prefix) {
  const slot = document.getElementById(`passwordSlot_${prefix}`);
  if (!slot || slot.hidden) return;
  if (slot.classList.contains("is-loading")) return;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    document.body.removeChild(fileInput);
    if (!file) return;
    await putPasswordImage(prefix, file);
  };

  fileInput.click();
}

async function updateSlipCheckOption(prefix, newOption) {
    try {
        const response = await fetch("/api/update-slip-option", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, slipCheckOption: newOption })
        });

        const result = await response.json();
        if (result.success) {
            window.location.reload(); // รีโหลดหน้าหลังจากเปลี่ยนตัวเลือก
        } else {
            alert(`❌ ไม่สามารถอัปเดตตัวเลือกตรวจสลิป: ${result.message}`);
        }
    } catch (error) {
        console.error("❌ Error updating slip check option:", error);
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("/api/shops");
        const data = await response.json();
        const shopListElement = document.getElementById("shop-list");

        if (!data.shops || data.shops.length === 0) {
            shopListElement.innerHTML = '<div class="no-shop">ยังไม่มีข้อมูลร้านค้า</div>';
            return;
        }

    } catch (error) {
        console.error("ไม่สามารถโหลดข้อมูลร้านค้า:", error);
    }
});

