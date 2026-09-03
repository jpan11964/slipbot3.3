// permissions.js — หน้าจัดการสิทธิ์ผู้ใช้ (OWNER เท่านั้น)

async function initPermissionsPage() {
  const list = document.getElementById("permissions-list");
  if (!list) return;

  let data;
  try {
    const res = await fetch("/api/permissions/users");
    if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    data = await res.json();
  } catch (err) {
    list.innerHTML = `<p class="perm-error">${err.message}</p>`;
    return;
  }

  if (!data.users.length) {
    list.innerHTML = `<p class="perm-empty">ยังไม่มีผู้ใช้ ADMIN หรือ USER</p>`;
    return;
  }

  list.innerHTML = data.users.map(user => renderUserCard(user, data)).join("");

  // ต้องตั้ง guard ที่นี่ ไม่ใช่ระดับ top-level ของไฟล์
  // เพราะ loadPage โหลดสคริปต์ของแต่ละหน้าแค่ครั้งเดียว (window.__loadedScripts)
  // แต่ล้าง __pageLeaveGuard ทุกครั้งที่เปลี่ยนหน้า — ถ้าตั้งที่ top-level
  // พอเข้าหน้านี้รอบสองเป็นต้นไป guard จะไม่ถูกตั้งอีกเลย
  window.__pageLeaveGuard = permissionsLeaveGuard;
}

function renderUserCard(user, data) {
  const roleClass = user.role === "ADMIN" ? "role-admin" : "role-user";

  // สิทธิ์ผู้จัดการ — แสดงเฉพาะเมื่อผู้ดูเป็น OWNER และผู้ใช้คนนี้เป็น ADMIN
  let adminPanel = "";
  if (data.isOwner && user.role === "ADMIN") {
    const adminGroup = `adminPages:${user.role}:${user.username}`;
    const adminChecks = (data.adminPages || []).map(a => checkboxHTML(
      adminGroup, a.key, a.label, user.adminPages.includes(a.key)
    )).join("");
    adminPanel = `
      <div class="perm-section">
        <div class="perm-section-title"><i class="bi bi-shield-lock"></i> สิทธิ์ผู้จัดการ (ADMIN)</div>
        <div class="perm-checks">${adminChecks}</div>
      </div>`;
  }

  const sbGroup = `sidebar:${user.role}:${user.username}`;
  const sidebarChecks = data.pages.map(p => {
    const checked = user.sidebar.includes(p.key);
    // เมนูหน้าหลัก — ติ๊กแล้วจะเด้งแผง "ปุ่มในหน้าหลัก" ออกมา
    if (p.key === "main") {
      return `
        <label class="perm-check">
          <input type="checkbox" data-group="${sbGroup}" value="main" ${checked ? "checked" : ""}
            onchange="toggleShopButtonsPanel(this)">
          <span>${p.label}</span>
        </label>`;
    }
    return checkboxHTML(sbGroup, p.key, p.label, checked);
  }).join("");

  const btnGroup = `shopButtons:${user.role}:${user.username}`;
  const buttonChecks = data.shopButtons.map(b => {
    const checked = user.shopButtons.includes(b.key);
    // ปุ่มตั้งค่าบอท — ติ๊กแล้วจะเด้งฟังก์ชันย่อยออกมา
    if (b.key === "setbot") {
      return `
        <label class="perm-check">
          <input type="checkbox" data-group="${btnGroup}" value="setbot" ${checked ? "checked" : ""}
            onchange="toggleSetbotPanel(this)">
          <span>${b.label}</span>
        </label>`;
    }
    return checkboxHTML(btnGroup, b.key, b.label, checked);
  }).join("");

  // แผงฟังก์ชันย่อยของปุ่มตั้งค่าบอท
  const setbotGroup = `setbotFunctions:${user.role}:${user.username}`;
  const setbotChecks = (data.setbotFuncs || []).map(f => checkboxHTML(
    setbotGroup, f.key, f.label, user.setbotFunctions.includes(f.key)
  )).join("");
  const setbotShown = user.shopButtons.includes("setbot");
  const setbotPanel = `
    <div class="perm-setbot-panel" ${setbotShown ? "" : "hidden"}>
      <div class="perm-setbot-title"><i class="bi bi-arrow-return-right"></i> ฟังก์ชันในปุ่มตั้งค่าบอท</div>
      <div class="perm-checks">${setbotChecks}</div>
    </div>`;

  // แผง "ปุ่มในหน้าหลัก" — แสดงเฉพาะเมื่อมีสิทธิ์เมนูหน้าหลัก
  const shopBtnShown = user.sidebar.includes("main");
  const shopBtnPanel = `
    <div class="perm-shopbtn-panel" ${shopBtnShown ? "" : "hidden"}>
      <div class="perm-setbot-title"><i class="bi bi-arrow-return-right"></i> ปุ่มในหน้าหลัก</div>
      <div class="perm-checks">${buttonChecks}</div>
      ${setbotPanel}
    </div>`;

  return `
    <div class="perm-card" data-role="${user.role}" data-username="${escapeHTML(user.username)}">
      <div class="perm-card-head">
        <div class="perm-user">
          <i class="bi bi-person-circle"></i>
          <span class="perm-username">${escapeHTML(user.username)}</span>
          <span class="perm-role-badge ${roleClass}">${user.role}</span>
          <button class="perm-edit-btn" title="แก้ไขบัญชี"
            onclick="openEditUserModal('${user.role}', '${escapeHTML(user.username)}')">
            <i class="bi bi-pencil"></i>
          </button>
        </div>
        <button class="perm-save-btn" onclick="saveUserPermissions(this)">
          <i class="bi bi-check2"></i> บันทึก
        </button>
      </div>

      <div class="perm-section">
        <div class="perm-section-title"><i class="bi bi-list-ul"></i> เมนู Sidebar</div>
        <div class="perm-checks">${sidebarChecks}</div>
        ${shopBtnPanel}
      </div>

      ${adminPanel}

      <div class="perm-status"></div>
    </div>
  `;
}

function checkboxHTML(group, key, label, checked) {
  return `
    <label class="perm-check">
      <input type="checkbox" data-group="${group}" value="${key}" ${checked ? "checked" : ""}>
      <span>${label}</span>
    </label>
  `;
}

async function saveUserPermissions(btn) {
  const card = btn.closest(".perm-card");
  const role = card.dataset.role;
  const username = card.dataset.username;

  const getValues = (groupPrefix) =>
    Array.from(card.querySelectorAll(`input[data-group^="${groupPrefix}:"]:checked`))
      .map(i => i.value);

  const sidebar = getValues("sidebar");
  const shopButtons = getValues("shopButtons");
  const setbotFunctions = getValues("setbotFunctions");
  const adminPages = getValues("adminPages");

  const status = card.querySelector(".perm-status");
  btn.disabled = true;

  try {
    const res = await fetch("/api/permissions/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, username, sidebar, shopButtons, setbotFunctions, adminPages }),
    });
    const result = await res.json();
    if (result.success) {
      status.textContent = "บันทึกเรียบร้อย";
      status.className = "perm-status success";
      delete card.dataset.dirty;   // บันทึกแล้ว = ไม่ค้าง
      return true;
    } else {
      status.textContent = result.message || "เกิดข้อผิดพลาด";
      status.className = "perm-status error";
      return false;
    }
  } catch (err) {
    status.textContent = "เชื่อมต่อล้มเหลว";
    status.className = "perm-status error";
    return false;
  } finally {
    btn.disabled = false;
    setTimeout(() => { if (status) status.textContent = ""; }, 3000);
  }
}

// ===== เตือนเมื่อยังไม่ได้บันทึกสิทธิ์ แล้วจะออกจากหน้า =====

// ติ๊ก checkbox ในการ์ดไหน = การ์ดนั้นมีการแก้ที่ยังไม่บันทึก
document.addEventListener("change", (e) => {
  const card = e.target.closest?.(".perm-card");
  if (card && e.target.matches('input[type="checkbox"][data-group]')) {
    card.dataset.dirty = "1";
  }
});

function getDirtyCards() {
  return Array.from(document.querySelectorAll('.perm-card[data-dirty="1"]'));
}

// สร้างกล่องถามแบบ 2 ตัวเลือก — คืน "save" หรือ "leave"
// ประกอบ DOM เองแทนการต่อ string เพื่อไม่ต้องพึ่ง escapeHTML (global จาก index.html)
// ถ้าฟังก์ชันนี้ throw จะทำให้ await ใน loadPage พังจนเปลี่ยนหน้าไม่ได้เลย
function askUnsavedPermissions(usernames) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "perm-modal";

    const inner = document.createElement("div");
    inner.className = "perm-modal-box";

    const head = document.createElement("div");
    head.className = "perm-modal-head";
    const h3 = document.createElement("h3");
    h3.textContent = "ยังไม่ได้บันทึกสิทธิ์";
    head.appendChild(h3);

    const text = document.createElement("p");
    text.className = "perm-unsaved-text";
    text.append("ยังไม่ได้ทำการบันทึกสิทธิ์ ผู้ใช้ ");
    const names = document.createElement("strong");
    names.textContent = usernames.join(", ");   // textContent = ปลอดภัยจาก HTML injection
    text.append(names, document.createElement("br"), "จะทำการบันทึกไหม?");

    const actions = document.createElement("div");
    actions.className = "perm-unsaved-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "perm-modal-save";
    saveBtn.dataset.act = "save";
    saveBtn.textContent = "บันทึกทั้งหมด";

    const leaveBtn = document.createElement("button");
    leaveBtn.className = "perm-unsaved-leave";
    leaveBtn.dataset.act = "leave";
    leaveBtn.textContent = "ออกโดยไม่บันทึก";

    actions.append(saveBtn, leaveBtn);
    inner.append(head, text, actions);
    box.appendChild(inner);
    document.body.appendChild(box);

    box.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;   // คลิกนอกปุ่มไม่ปิด — ต้องเลือกอย่างใดอย่างหนึ่ง
      box.remove();
      resolve(act);
    });
  });
}

// loadPage เรียกก่อนเปลี่ยนหน้า — คืน true = ออกได้
// (ผูกเข้ากับ window.__pageLeaveGuard ใน initPermissionsPage ทุกครั้งที่เข้าหน้านี้)
async function permissionsLeaveGuard() {
  const dirty = getDirtyCards();
  if (!dirty.length) return true;

  const choice = await askUnsavedPermissions(dirty.map((c) => c.dataset.username));
  if (choice === "save") {
    for (const card of dirty) {
      const btn = card.querySelector(".perm-save-btn");
      if (btn) await saveUserPermissions(btn);
    }
  }
  return true; // ทั้งสองตัวเลือกคือออกจากหน้า
}

// ===== Modal: สร้างบัญชีใหม่ =====
function openCreateUserModal() {
  const roleSelect = document.getElementById("createRole");
  const isOwner = window.__me?.role === "OWNER";
  // ADMIN สร้างได้เฉพาะ USER — ซ่อนตัวเลือก ADMIN
  const adminOpt = roleSelect.querySelector('option[value="ADMIN"]');
  if (adminOpt) adminOpt.hidden = !isOwner;
  roleSelect.value = isOwner ? "ADMIN" : "USER";

  document.getElementById("createUsername").value = "";
  document.getElementById("createPassword").value = "";
  document.getElementById("createStatus").textContent = "";
  document.getElementById("createUserModal").hidden = false;
}
function closeCreateUserModal() {
  document.getElementById("createUserModal").hidden = true;
}
async function submitCreateUser() {
  const role = document.getElementById("createRole").value;
  const username = document.getElementById("createUsername").value.trim();
  const password = document.getElementById("createPassword").value.trim();
  const status = document.getElementById("createStatus");

  if (!username || !password) {
    status.textContent = "กรุณากรอกข้อมูลให้ครบ";
    status.className = "perm-modal-status error";
    return;
  }

  try {
    const res = await fetch("/api/permissions/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, username, password }),
    });
    const result = await res.json();
    if (result.success) {
      closeCreateUserModal();
      initPermissionsPage();
    } else {
      status.textContent = result.message || "เกิดข้อผิดพลาด";
      status.className = "perm-modal-status error";
    }
  } catch (err) {
    status.textContent = "เชื่อมต่อล้มเหลว";
    status.className = "perm-modal-status error";
  }
}

// ===== Modal: แก้ไข/ลบบัญชี =====
function openEditUserModal(role, username) {
  document.getElementById("editRole").value = role;
  document.getElementById("editOldUsername").value = username;
  document.getElementById("editUsername").value = username;
  document.getElementById("editPassword").value = "";
  document.getElementById("editStatus").textContent = "";
  document.getElementById("editUserModal").hidden = false;
}
function closeEditUserModal() {
  document.getElementById("editUserModal").hidden = true;
}
async function submitEditUser() {
  const role = document.getElementById("editRole").value;
  const oldUsername = document.getElementById("editOldUsername").value;
  const username = document.getElementById("editUsername").value.trim();
  const password = document.getElementById("editPassword").value.trim();
  const status = document.getElementById("editStatus");

  if (!username) {
    status.textContent = "กรุณากรอกชื่อผู้ใช้";
    status.className = "perm-modal-status error";
    return;
  }

  try {
    const res = await fetch("/api/permissions/edit-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, oldUsername, username, password }),
    });
    const result = await res.json();
    if (result.success) {
      closeEditUserModal();
      initPermissionsPage();
    } else {
      status.textContent = result.message || "เกิดข้อผิดพลาด";
      status.className = "perm-modal-status error";
    }
  } catch (err) {
    status.textContent = "เชื่อมต่อล้มเหลว";
    status.className = "perm-modal-status error";
  }
}
async function submitDeleteUser() {
  const role = document.getElementById("editRole").value;
  const username = document.getElementById("editOldUsername").value;
  const status = document.getElementById("editStatus");

  if (!confirm(`ยืนยันลบบัญชี "${username}" ?`)) return;

  try {
    const res = await fetch("/api/permissions/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, username }),
    });
    const result = await res.json();
    if (result.success) {
      closeEditUserModal();
      initPermissionsPage();
    } else {
      status.textContent = result.message || "เกิดข้อผิดพลาด";
      status.className = "perm-modal-status error";
    }
  } catch (err) {
    status.textContent = "เชื่อมต่อล้มเหลว";
    status.className = "perm-modal-status error";
  }
}

// เปิด/ปิดแผงฟังก์ชันย่อยตามการติ๊กปุ่มตั้งค่าบอท
function toggleSetbotPanel(checkbox) {
  const panel = checkbox.closest(".perm-card")?.querySelector(".perm-setbot-panel");
  if (panel) panel.hidden = !checkbox.checked;
}

// เปิด/ปิดแผง "ปุ่มในหน้าหลัก" ตามการติ๊กเมนูหน้าหลัก
function toggleShopButtonsPanel(checkbox) {
  const panel = checkbox.closest(".perm-card")?.querySelector(".perm-shopbtn-panel");
  if (panel) panel.hidden = !checkbox.checked;
}

window.initPermissionsPage = initPermissionsPage;
window.toggleSetbotPanel = toggleSetbotPanel;
window.toggleShopButtonsPanel = toggleShopButtonsPanel;
window.openCreateUserModal = openCreateUserModal;
window.closeCreateUserModal = closeCreateUserModal;
window.submitCreateUser = submitCreateUser;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.submitEditUser = submitEditUser;
window.submitDeleteUser = submitDeleteUser;
