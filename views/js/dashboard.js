window.INITIAL_LOAD = 200;     // แสดงเริ่มต้น 200 รายการ
window.LOAD_MORE = 100;        // เลื่อนถึงล่างสุด → โหลดเพิ่มทีละ 100
window.isLoadingMore = false;
window.allLoaded = false;
window.slipResults = [];       // ข้อมูลทั้งหมดที่โหลดมา (ล่าสุด→เก่า)
window.serverLoadedCount = 0;  // จำนวนที่โหลดจาก server แล้ว (ใช้คำนวณ skip — ไม่นับสลิปใหม่จาก SSE)

// ===== ตัวกรองร้าน (อ่านค่าต่อ user จาก window.__me ที่โหลดมาจาก /api/me) =====
function getDisplayedPrefixes() {
  const sel = window.__me?.displayedShops;
  return Array.isArray(sel) ? sel : null; // null = แสดงทุกร้าน
}

function isSlipDisplayed(prefix) {
  const sel = getDisplayedPrefixes();
  return !sel || sel.includes(prefix);
}

// ===== แถบค้นหา/ตัวกรอง (dashboard-toolbar) — อ่านค่าจาก DOM ตรงๆ ทุกครั้ง เหมือนหน้า Logs/ประวัติการใช้งาน =====
function escapeHtmlDash(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// datetime-local ให้ค่าเป็นเวลาท้องถิ่นแบบไม่มี timezone — แปลงเป็น ISO ก่อนส่ง
function toISODash(v) {
  return v ? new Date(v).toISOString() : "";
}

// เลือกไลน์ (ชื่อไลน์ที่ report เข้ามา — ตรงกับฟิลด์ shop) — null = ทุกไลน์
function getSelectedDashLines() {
  const list = document.getElementById("dashLineList");
  if (!list) return null;
  const boxes = [...list.querySelectorAll("input[type=checkbox]")];
  if (!boxes.length) return null;
  const checked = boxes.filter((b) => b.checked).map((b) => b.value);
  return checked.length === boxes.length ? null : checked;
}

function buildDashQuery(skip, limit) {
  const p = new URLSearchParams();
  p.set("skip", skip);
  p.set("limit", limit);

  const q = document.getElementById("dashSearch")?.value.trim();
  if (q) p.set("q", q);

  const status = document.getElementById("dashStatus")?.value;
  if (status) p.set("status", status);

  const lines = getSelectedDashLines();
  if (lines) p.set("shops", lines.join(","));

  const from = document.getElementById("dashFrom")?.value;
  if (from) p.set("from", toISODash(from));

  const to = document.getElementById("dashTo")?.value;
  if (to) p.set("to", toISODash(to));

  return p.toString();
}

function isDashFilterActive() {
  const q = document.getElementById("dashSearch")?.value.trim();
  const status = document.getElementById("dashStatus")?.value;
  const from = document.getElementById("dashFrom")?.value;
  const to = document.getElementById("dashTo")?.value;
  return !!(q || status || from || to || getSelectedDashLines());
}

// สลิปใหม่ที่มาจาก SSE — ต้องเช็คกับตัวกรองที่ตั้งไว้ด้วย ไม่ใช่แค่ตัวกรองร้านต่อ user
function matchesDashFilters(item) {
  const status = document.getElementById("dashStatus")?.value;
  if (status && item.status !== status) return false;

  const lines = getSelectedDashLines();
  if (lines && !lines.includes(item.shop)) return false;

  const q = document.getElementById("dashSearch")?.value.trim().toLowerCase();
  if (q) {
    const hay = [item.lineName, item.phoneNumber, item.amount != null ? String(item.amount) : "", item.ref]
      .filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }

  const from = document.getElementById("dashFrom")?.value;
  const to = document.getElementById("dashTo")?.value;
  if ((from || to) && item.createdAt) {
    const t = new Date(item.createdAt).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime()) return false;
  }

  return true;
}

async function loadDashFilterOptions() {
  try {
    const res = await fetch("/api/slip-results/filters");
    const data = await res.json();

    const statusSel = document.getElementById("dashStatus");
    if (statusSel && Array.isArray(data.statuses)) {
      statusSel.innerHTML = '<option value="">ทุกกรณีการตรวจสลิป</option>' +
        data.statuses.map((s) => `<option value="${escapeHtmlDash(s)}">${escapeHtmlDash(s)}</option>`).join("");
    }

    const list = document.getElementById("dashLineList");
    if (list && Array.isArray(data.shops)) {
      list.innerHTML = data.shops.map((s) => `
        <label class="dashboard-line-item">
          <input type="checkbox" value="${escapeHtmlDash(s)}" checked onchange="onDashLineChange()">
          <span>${escapeHtmlDash(s)}</span>
        </label>`).join("");
    }
    updateDashLineAllState();
    updateDashLineLabel();
  } catch (err) {
    console.error("โหลดตัวกรอง dashboard ล้มเหลว:", err);
  }
}

function toggleDashLineMenu() {
  const menu = document.getElementById("dashLineMenu");
  if (menu) menu.hidden = !menu.hidden;
}

function toggleDashLineAll(el) {
  document.querySelectorAll("#dashLineList input[type=checkbox]").forEach((b) => { b.checked = el.checked; });
  onDashLineChange();
}

function updateDashLineAllState() {
  const all = document.getElementById("dashLineAll");
  if (!all) return;
  const boxes = [...document.querySelectorAll("#dashLineList input[type=checkbox]")];
  all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
}

function updateDashLineLabel() {
  const label = document.getElementById("dashLineLabel");
  if (!label) return;
  const sel = getSelectedDashLines();
  label.textContent = !sel ? "ทุกไลน์" : sel.length ? `เลือก ${sel.length} ไลน์` : "ไม่ได้เลือกไลน์";
}

function onDashLineChange() {
  updateDashLineAllState();
  updateDashLineLabel();
  loadSlipResults();
}

// ปิดเมนูเลือกไลน์เมื่อคลิกนอกกล่อง — ผูกครั้งเดียวตอนสคริปต์โหลด (persist ข้ามการเข้าหน้าซ้ำ)
document.addEventListener("click", (e) => {
  const filter = document.getElementById("dashLineFilter");
  const menu = document.getElementById("dashLineMenu");
  if (filter && menu && !menu.hidden && !filter.contains(e.target)) {
    menu.hidden = true;
  }
});

function clearDashFilters() {
  const searchEl = document.getElementById("dashSearch");
  const statusEl = document.getElementById("dashStatus");
  const fromEl = document.getElementById("dashFrom");
  const toEl = document.getElementById("dashTo");
  if (searchEl) searchEl.value = "";
  if (statusEl) statusEl.value = "";
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  const allBox = document.getElementById("dashLineAll");
  if (allBox) { allBox.checked = true; toggleDashLineAll(allBox); return; } // toggleDashLineAll เรียก loadSlipResults() ให้แล้ว
  loadSlipResults();
}

function setupDashToolbar() {
  const searchEl = document.getElementById("dashSearch");
  const statusEl = document.getElementById("dashStatus");
  const fromEl = document.getElementById("dashFrom");
  const toEl = document.getElementById("dashTo");
  const clearEl = document.getElementById("dashClear");
  const toggleEl = document.getElementById("dashLineToggle");
  const allEl = document.getElementById("dashLineAll");

  // พิมพ์ค้นหาแล้วรอ 300ms ค่อยยิง (กันยิงถี่)
  let searchTimer;
  searchEl?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadSlipResults(), 300);
  });

  statusEl?.addEventListener("change", () => loadSlipResults());
  fromEl?.addEventListener("change", () => loadSlipResults());
  toEl?.addEventListener("change", () => loadSlipResults());
  clearEl?.addEventListener("click", () => clearDashFilters());
  toggleEl?.addEventListener("click", (e) => { e.stopPropagation(); toggleDashLineMenu(); });
  allEl?.addEventListener("change", () => toggleDashLineAll(allEl));
}


function clearLoadingRow() {
  document.getElementById("loading-row")?.remove();
  document.getElementById("empty-row")?.remove();
}

function showEmptyRow(text) {
  const tbody = document.getElementById("slip-results-body");
  if (!tbody) return;
  clearLoadingRow();
  if (tbody.querySelector("tr")) return; // มีแถวข้อมูลอยู่แล้ว ไม่ต้องแสดง
  const tr = document.createElement("tr");
  tr.id = "empty-row";
  tr.innerHTML = `<td colspan="9" style="text-align:center;color:#94a3b8;padding:24px;">${text}</td>`;
  tbody.appendChild(tr);
}

// สร้าง HTML ของแถวสลิป 1 แถว
function buildSlipRowHTML(r) {
  return `
    <td>${r.time || "-"}</td>
    <td title="${r.shop || "-"}">${truncateText(r.shop || "-", 10)}</td>
    <td class="line-name-cell" data-user-id="${r.userId}" title="${r.lineName || "-"}">
      ${truncateText(r.lineName || "-", 12)}
    </td>
    <td title="${r.text || "-"}">${truncateText(r.text || "-", 10)}</td>
    <td>${renderPhoneColumn(r.userId, r.phoneNumber, r.prefix)}</td>
    <td class="${getStatusClass(r.status)}">${r.status || "-"}</td>
    <td>${r.amount != null ? r.amount.toLocaleString() : "-"}</td>
    <td class="${getStatusReply(r.response)}">${r.response || "-"}</td>
    <td>${renderRefOrReply(r) || "-"}</td>
  `;
}

// ต่อท้ายแถว (ของเก่าอยู่ล่าง) ตามตัวกรองร้านที่ผู้ใช้เลือก
function appendSlipRows(rows) {
  const tbody = document.getElementById("slip-results-body");
  if (!tbody) return;
  clearLoadingRow();
  const frag = document.createDocumentFragment();
  rows.filter(r => isSlipDisplayed(r.prefix)).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = buildSlipRowHTML(r);
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

// โหลดครั้งแรก 200 รายการล่าสุด (เรียกซ้ำได้ทุกครั้งที่ตัวกรองในแถบเครื่องมือเปลี่ยน — เริ่มนับใหม่จาก skip 0 เสมอ)
async function loadSlipResults() {
  window.allLoaded = false;
  window.isLoadingMore = false;
  try {
    const res = await fetch(`/api/slip-results?${buildDashQuery(0, window.INITIAL_LOAD)}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("ไม่ใช่ array");

    window.slipResults = data;                 // ล่าสุดก่อน (server sort DESC)
    window.serverLoadedCount = data.length;
    window.allLoaded = data.length < window.INITIAL_LOAD;

    const tbody = document.getElementById("slip-results-body");
    if (tbody) tbody.innerHTML = "";
    appendSlipRows(data);

    const countEl = document.getElementById("dashCount");
    if (countEl) countEl.textContent = isDashFilterActive() ? `แสดง ${window.slipResults.length.toLocaleString()} รายการ` : "";

    const tb = document.getElementById("slip-results-body");
    if (tb && !tb.querySelector("tr")) {
      showEmptyRow(isDashFilterActive() ? "ไม่พบรายการตามตัวกรองที่เลือก"
        : getDisplayedPrefixes() ? "ไม่มีข้อมูลตามตัวกรองร้านที่เลือก" : "ยังไม่มีข้อมูลสลิป");
    }
    requestAnimationFrame(fillIfNeeded); // กรองร้านแล้วแถวน้อย → โหลดเพิ่มจนเต็มจอ
  } catch (err) {
    console.error("❌ โหลด slip ล้มเหลว:", err);
    showEmptyRow("โหลดข้อมูลไม่สำเร็จ");
  }
}

// โหลดเพิ่มทีละ 100 (ของเก่ากว่า) เมื่อเลื่อนถึงล่างสุด
async function loadMoreSlips() {
  if (window.isLoadingMore || window.allLoaded) return;
  window.isLoadingMore = true;
  try {
    const res = await fetch(`/api/slip-results?${buildDashQuery(window.serverLoadedCount, window.LOAD_MORE)}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      window.slipResults.push(...data);        // ต่อท้าย (เก่ากว่า)
      window.serverLoadedCount += data.length;
      appendSlipRows(data);
      const countEl = document.getElementById("dashCount");
      if (countEl && isDashFilterActive()) countEl.textContent = `แสดง ${window.slipResults.length.toLocaleString()} รายการ`;
    }
    if (!Array.isArray(data) || data.length < window.LOAD_MORE) window.allLoaded = true;
  } catch (err) {
    console.error("❌ โหลดสลิปเพิ่มล้มเหลว:", err);
  } finally {
    window.isLoadingMore = false;
    requestAnimationFrame(fillIfNeeded); // ถ้ายังไม่เต็มจอ (เช่นกรองร้าน) ให้โหลดต่อ
  }
}

// ถ้าเนื้อหายังไม่เต็มจน scroll ไม่ติด → โหลดเพิ่มจนเต็มหรือหมด
function fillIfNeeded() {
  const c = document.getElementById("dashboard-scroll");
  if (!c || window.allLoaded || window.isLoadingMore) return;
  if (c.scrollHeight <= c.clientHeight + 10) loadMoreSlips();
}


function getStatusClass(status) {
  switch (status) {
    case "สลิปถูกต้อง":
      return "status-success";
    
    case "ข้อความ":
      return "status-text";

    case "รูปภาพ":
    case "รูปภาพ ''เล่นกิจกรรม''":
    case "รูปภาพ ''ยอดเสีย''":
      return "status-image";

    case "สลิปซ้ำเดิม":
    case "บัญชีปลายทางผิด":
      return "status-fail";

    case "สลิปยอดเงินต่ำ":
    case "ใช้เวลาตรวจสอบนานเกินไป":
    case "สลิปซ้ำ ไม่เกิน 1 ชั่วโมง":
    case "พบสลิปต้องสงสัย (ไม่มี QRcode หรือปลอมสลิป)":
    case "เกิดข้อผิดพลาดระหว่างตรวจสอบ":
    default:
      return "status-pending";
  }
}

function getStatusReply(status) {
  switch (status) {
    case "ตอบกลับแล้ว":
      return "status-success";   

    case "ไม่ได้ตอบกลับ":
    default:
      return "status-pending";
  }
}


// บนมือถือแถบค้นหา+ตัวกรองกินจอเกือบครึ่ง เหลือที่ให้ตารางนิดเดียว
// เลื่อนดูรายการ = ยุบแถบเก็บไว้ก่อน เลื่อนกลับขึ้นบนสุดค่อยกางคืน (เหมือนหน้า Logs/ประวัติการใช้งาน)
// ใช้ค่าเข้า/ออกคนละค่า กันกระพริบตอนเลื่อนอยู่แถวเส้นแบ่งพอดี
function updateDashCompact(container) {
  const pageEl = document.querySelector(".dashboard-page");
  if (!pageEl) return;
  const y = container.scrollTop;
  if (y > 40) pageEl.classList.add("compact");
  else if (y < 10) pageEl.classList.remove("compact");
}

function setupScrollListener() {
  const container = document.getElementById("dashboard-scroll");
  if (!container || container.dataset.scrollBound) return;
  container.dataset.scrollBound = "1";

  const head = document.getElementById("dashboard-head");

  container.addEventListener("scroll", () => {
    // เลื่อนแนวนอน → ให้หัวตารางเลื่อนตาม (คอลัมน์ตรงกัน)
    if (head) head.scrollLeft = container.scrollLeft;
    updateDashCompact(container);
    // เลื่อนถึงใกล้ล่างสุด → โหลดของเก่าเพิ่มทีละ 100
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 40) {
      loadMoreSlips();
    }
  });
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? text.substring(0, maxLength) + ".." : text;
}

function truncateEndText(text, maxLength) {
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function renderRefOrReply(data) {
  const ref = data.ref?.trim() || '';
  const reply = data.reply?.trim() || '';

  if (ref) {
    return `<div class="ref-text">${ref.slice(-20)}</div>`;
  }

  if (reply) {
    return `<div class="reply-text">${reply}</div>`;
  }

  return '';
}

function renderPhoneColumn(userId, phoneNumber, prefix) {
  if (!phoneNumber || phoneNumber === '-') {
    return `<input type="text" class="phone-input" data-user-id="${userId}" data-prefix="${prefix}" placeholder="เพิ่มเบอร์โทร">`;
  } else {
    return `<span class="phone-span" data-user-id="${userId}" data-prefix="${prefix}">
              ${phoneNumber}
            </span>`;
  }
}

function updatePhoneNumberInDOM(userId, phone) {
  document.querySelectorAll(`[data-user-id="${userId}"]`).forEach(el => {
    if (el.classList.contains('phone-input')) {
      // เปลี่ยน <input> กลับเป็น <span>
      const span = document.createElement('span');
      span.textContent = phone;
      span.className = 'phone-span'; // เพื่อให้ triple click ใช้ได้อีก
      span.dataset.userId = userId;
      span.dataset.prefix = el.dataset.prefix || '';

      el.replaceWith(span);
    } else if (el.tagName === 'SPAN') {
      // อัปเดตค่าใน <span> ที่มีอยู่
      el.textContent = phone;
    }
  });
}

// SSE สำหรับสลิปใหม่
function connectSSE() {
    if (window._sseConnected) return;
    console.log("Connecting SSE...");

    const eventSource = new EventSource("/events");

    eventSource.onopen = () => console.log("SSE opened");
    eventSource.onerror = (e) => console.error("SSE error", e);
    eventSource.onmessage = (event) => {
      try {
        const newSlip = JSON.parse(event.data);
        window.slipResults = window.slipResults || [];
        window.slipResults.unshift(newSlip);
        // ถ้าร้านนี้ไม่ได้เลือกแสดง (ตัวกรองร้านต่อ user) หรือไม่ตรงกับตัวกรองในแถบเครื่องมือ
        // → เก็บไว้ใน data แต่ไม่แสดงในตาราง
        if (!isSlipDisplayed(newSlip.prefix) || !matchesDashFilters(newSlip)) return;
        const tbody = document.getElementById("slip-results-body");
        if (tbody) {
          clearLoadingRow(); // เคลียร์ placeholder "ยังไม่มีข้อมูล" ถ้ามี
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${newSlip.time || "-"}</td>
            <td title="${newSlip.shop || "-"}">${truncateText(newSlip.shop || "-", 15)}</td>
            <td class="line-name-cell" data-user-id="${newSlip.userId}" title="${newSlip.lineName || "-"}">
              ${truncateText(newSlip.lineName || "-", 15)}
            </td>
            <td title="${newSlip.text || "-"}">${truncateText(newSlip.text || "-", 15)}</td>
            <td>${renderPhoneColumn(newSlip.userId, newSlip.phoneNumber, newSlip.prefix)}</td>
            <td class="${getStatusClass(newSlip.status)}">${newSlip.status || "-"}</td>
            <td>${newSlip.amount || "-"}</td>
            <td class="${getStatusReply(newSlip.response)}">${newSlip.response || "-"}</td>
            <td>${renderRefOrReply(newSlip)}</td>
          `;
          tbody.insertBefore(tr, tbody.firstChild);
        }
      } catch (err) {
        console.error("❌ Error parsing SSE data", err);
      }
    };

    eventSource.addEventListener("phoneUpdate", (event) => {
      try {
        const { userId, phoneNumber, lineName } = JSON.parse(event.data);
        updatePhoneNumberInDOM(userId, phoneNumber);
        console.log("อัปเดตเบอร์โทรใน DOM เรียบร้อย");

        document.querySelectorAll(`.line-name-cell[data-user-id="${userId}"]`).forEach(el => {
          el.textContent = lineName;
        });

        window.slipResults.forEach(item => {
          if (item.userId === userId) {
            item.phoneNumber = phoneNumber;
            item.lineName = lineName;
          }
        });
      } catch (err) {
        console.error("❌ SSE phoneUpdate เกิดข้อผิดพลาด:", err);
      }
    });
  window._sseConnected = true;
}

function setupPhoneInputHandlers() {
  const slipResultsBody = document.querySelector('#slip-results-body');
  if (!slipResultsBody) return;

  slipResultsBody.addEventListener('input', handlePhoneInputLimit);
  slipResultsBody.addEventListener('keydown', handlePhoneSaveOnEnter);
}

function handlePhoneInputLimit(e) {
  if (e.target.classList.contains('phone-input')) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  }
}

async function handlePhoneSaveOnEnter(e) {
  if (!e.target.classList.contains('phone-input') || e.key !== 'Enter') return;

  const input = e.target;
  const phone = input.value.trim();
  const userId = input.dataset.userId;
  const prefix = input.dataset.prefix;

  if (!/^\d{9,10}$/.test(phone)) {
    alert('กรุณากรอกเบอร์ให้ถูกต้อง');
    return;
  }

  try {
    const res = await fetch('/api/save-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, userId, prefix })
    });

    if (res.ok) {
      const newLineName = `${prefix}${phone.slice(-7)}`;
      updatePhoneNumberInDOM(userId, phone);

      document.querySelectorAll(`.line-name-cell[data-user-id="${userId}"]`).forEach(el => {
        el.textContent = newLineName;
      });

      window.slipResults.forEach(item => {
        if (item.userId === userId) {
          item.phoneNumber = phone;
          item.lineName = newLineName;
        }
      });
    } else {
      const data = await res.json();
      alert('เกิดข้อผิดพลาด: ' + data.message);
    }
  } catch (err) {
    console.error('❌ บันทึกเบอร์โทรล้มเหลว:', err);
    alert('ไม่สามารถบันทึกเบอร์โทรได้');
  }
}

function setupPhoneTripleClick() {
  const slipResultsBody = document.querySelector('#slip-results-body');
  if (!slipResultsBody) return;

  slipResultsBody.addEventListener('click', (e) => {
    const span = e.target;
    if (span.tagName === 'SPAN' && span.classList.contains('phone-span')) {
      // ตรวจสอบว่าเป็นการคลิกครั้งที่ 3
      if (e.detail === 3) {
        const userId = span.dataset.userId;
        const prefix = span.dataset.prefix;
        const currentPhone = span.textContent.trim();

        // สร้าง input ใหม่
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentPhone;
        input.className = 'phone-input';
        input.dataset.userId = userId;
        input.dataset.prefix = prefix;

        span.replaceWith(input);
        input.focus();
      }
    }
  });
}

function initDashboardSlip() {
  setupDashToolbar();
  loadDashFilterOptions().then(loadSlipResults); // ต้องรอ options มาก่อน ไม่งั้น dropdown ยังว่างตอน render แถวแรก
  setupScrollListener();
  connectSSE();
  setupPhoneInputHandlers();
  setupPhoneTripleClick();
}

window.initDashboardSlip = initDashboardSlip;