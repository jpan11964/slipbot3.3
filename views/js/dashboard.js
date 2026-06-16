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

// โหลดครั้งแรก 200 รายการล่าสุด
async function loadSlipResults() {
  window.allLoaded = false;
  window.isLoadingMore = false;
  try {
    const res = await fetch(`/api/slip-results?skip=0&limit=${window.INITIAL_LOAD}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("ไม่ใช่ array");

    window.slipResults = data;                 // ล่าสุดก่อน (server sort DESC)
    window.serverLoadedCount = data.length;
    window.allLoaded = data.length < window.INITIAL_LOAD;

    const tbody = document.getElementById("slip-results-body");
    if (tbody) tbody.innerHTML = "";
    appendSlipRows(data);

    const tb = document.getElementById("slip-results-body");
    if (tb && !tb.querySelector("tr")) {
      showEmptyRow(getDisplayedPrefixes() ? "ไม่มีข้อมูลตามตัวกรองร้านที่เลือก" : "ยังไม่มีข้อมูลสลิป");
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
    const res = await fetch(`/api/slip-results?skip=${window.serverLoadedCount}&limit=${window.LOAD_MORE}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      window.slipResults.push(...data);        // ต่อท้าย (เก่ากว่า)
      window.serverLoadedCount += data.length;
      appendSlipRows(data);
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


function setupScrollListener() {
  const container = document.getElementById("dashboard-scroll");
  if (!container || container.dataset.scrollBound) return;
  container.dataset.scrollBound = "1";

  const head = document.getElementById("dashboard-head");

  container.addEventListener("scroll", () => {
    // เลื่อนแนวนอน → ให้หัวตารางเลื่อนตาม (คอลัมน์ตรงกัน)
    if (head) head.scrollLeft = container.scrollLeft;
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
        // ถ้าร้านนี้ไม่ได้เลือกแสดง → เก็บไว้ใน data แต่ไม่แสดงในตาราง
        if (!isSlipDisplayed(newSlip.prefix)) return;
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
  loadSlipResults();
  setupScrollListener();
  connectSSE();
  setupPhoneInputHandlers();
  setupPhoneTripleClick();
}

window.initDashboardSlip = initDashboardSlip;