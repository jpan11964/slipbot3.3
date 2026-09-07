// customers.js — หน้าจัดการข้อมูลลูกค้า (Phone) + ค้นหา + โหลดทีละชุด

const CUST_INITIAL = 200; // โหลดเริ่มต้น 200
const CUST_MORE = 100;    // เลื่อนถึงล่างสุด → โหลดเพิ่มทีละ 100

let custLoaded = 0;
let custAllLoaded = false;
let custLoading = false;
let custQuery = "";
let custSearchTimer;   // ต้องอยู่ระดับโมดูล ปุ่มล้างจะได้ยกเลิกการค้นหาที่ค้างอยู่ได้

function custEsc(str) {
  const div = document.createElement("div");
  div.innerText = str == null ? "" : String(str);
  return div.innerHTML;
}

// ช่องเบอร์โทร: มีเบอร์ → span (ดับเบิลคลิกแก้ไข), ไม่มี → input ให้เพิ่ม
function custPhoneCell(c) {
  if (c.phoneNumber) {
    return `<span class="cust-phone-span" data-user-id="${custEsc(c.userId)}" data-prefix="${custEsc(c.prefix)}">${custEsc(c.phoneNumber)}</span>`;
  }
  return `<input type="text" class="cust-phone-input" data-user-id="${custEsc(c.userId)}" data-prefix="${custEsc(c.prefix)}" placeholder="เพิ่มเบอร์โทร">`;
}

function custRowCells(c) {
  return `
    <td title="${custEsc(c.displayName)}">${custEsc(c.displayName)}</td>
    <td class="cust-user-cell" title="${custEsc(c.user)}">${custEsc(c.user)}</td>
    <td>${custPhoneCell(c)}</td>
    <td title="${custEsc(c.linename)}">${custEsc(c.linename)}</td>
  `;
}

function appendCustomerRows(list) {
  const tbody = document.getElementById("customers-body");
  if (!tbody) return;
  document.getElementById("cust-loading")?.remove();   // เอาแถวสปินเนอร์ออกก่อน ไม่งั้นค้างอยู่เหนือข้อมูล
  document.getElementById("cust-end")?.remove();       // ข้อความท้ายรายการต้องอยู่ล่างสุดเสมอ
  const frag = document.createDocumentFragment();
  list.forEach(c => {
    const tr = document.createElement("tr");
    tr.dataset.userId = c.userId;
    tr.innerHTML = custRowCells(c);
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

function custMessageRow(text, isError) {
  const tbody = document.getElementById("customers-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:${isError ? "#ef4444" : "#94a3b8"};">${text}</td></tr>`;
}

// ข้อความท้ายรายการ — โชว์เมื่อโหลดครบแล้วและมีรายการอยู่จริง
// (ไม่มีข้อมูลเลยจะมีข้อความ "ไม่มีข้อมูลลูกค้า" อยู่แล้ว ไม่ต้องบอกซ้ำว่าครบแล้ว)
function custUpdateListEnd() {
  const tbody = document.getElementById("customers-body");
  if (!tbody) return;
  tbody.querySelector("#cust-end")?.remove();
  if (!custAllLoaded || !tbody.querySelector("tr[data-user-id]")) return;
  const tr = document.createElement("tr");
  tr.id = "cust-end";
  tr.innerHTML = `<td colspan="4"><div class="app-list-end"><i class="bi bi-check2-circle"></i> แสดงครบทุกรายการแล้ว</div></td>`;
  tbody.appendChild(tr);
}

// วงกลมหมุนระหว่างรอข้อมูล — ต้องโชว์ทุกครั้งที่โหลดใหม่ (ค้นหา/กดล้าง) ไม่ใช่แค่ตอนเปิดหน้าครั้งแรก
// ไม่งั้นระหว่างรอ API ตารางจะว่างเปล่าจนดูเหมือนค้างหรือไม่มีข้อมูล
function custLoadingRow() {
  const tbody = document.getElementById("customers-body");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr id="cust-loading">
      <td colspan="4">
        <div class="app-loading"><div class="app-spinner"></div>กำลังโหลดข้อมูลลูกค้า...</div>
      </td>
    </tr>`;
}

// reset = true → ค้นหา/โหลดใหม่ตั้งแต่ต้น, false → โหลดต่อท้าย
async function loadCustomers(reset) {
  const tbody = document.getElementById("customers-body");
  if (!tbody || custLoading) return;
  if (!reset && custAllLoaded) return;

  custLoading = true;
  if (reset) {
    custLoaded = 0;
    custAllLoaded = false;
    custLoadingRow();
  }

  try {
    const limit = custLoaded === 0 ? CUST_INITIAL : CUST_MORE;
    const res = await fetch(`/api/customers?skip=${custLoaded}&limit=${limit}&q=${encodeURIComponent(custQuery)}`);
    if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const data = await res.json();

    if (Array.isArray(data)) {
      appendCustomerRows(data);
      custLoaded += data.length;
      if (data.length < limit) custAllLoaded = true;
    }
    document.getElementById("cust-loading")?.remove();   // เผื่อกรณี data ไม่ใช่ array (appendCustomerRows ไม่ได้ถูกเรียก)
    if (!tbody.querySelector("tr")) {
      custMessageRow(custQuery ? "ไม่พบลูกค้าที่ค้นหา" : "ไม่มีข้อมูลลูกค้า");
    }
    custUpdateListEnd();
  } catch (err) {
    if (custLoaded === 0) custMessageRow(err.message || "โหลดข้อมูลไม่สำเร็จ", true);
  } finally {
    custLoading = false;
    requestAnimationFrame(custFillIfNeeded);
  }
}

// ถ้ารายการยังไม่เต็มจอ → โหลดเพิ่มจนเต็มหรือหมด
function custFillIfNeeded() {
  const c = document.getElementById("customers-scroll");
  if (!c || custAllLoaded || custLoading) return;
  if (c.scrollHeight <= c.clientHeight + 10) loadCustomers(false);
}

function bindCustomerEvents() {
  const tbody = document.getElementById("customers-body");
  if (tbody && !tbody.dataset.bound) {
    tbody.dataset.bound = "1";

    tbody.addEventListener("input", (e) => {
      if (e.target.classList.contains("cust-phone-input")) {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
      }
    });

    tbody.addEventListener("keydown", (e) => {
      if (e.target.classList.contains("cust-phone-input") && e.key === "Enter") {
        saveCustomerPhone(e.target);
      }
    });

    tbody.addEventListener("dblclick", (e) => {
      const span = e.target.closest(".cust-phone-span");
      if (!span) return;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cust-phone-input";
      input.value = span.textContent.trim();
      input.dataset.userId = span.dataset.userId;
      input.dataset.prefix = span.dataset.prefix;
      span.replaceWith(input);
      input.focus();
      input.select();
    });
  }

  const scroll = document.getElementById("customers-scroll");
  if (scroll && !scroll.dataset.bound) {
    scroll.dataset.bound = "1";
    scroll.addEventListener("scroll", () => {
      if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40) loadCustomers(false);
    });
  }

  const search = document.getElementById("customers-search");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", () => {
      clearTimeout(custSearchTimer);
      custSearchTimer = setTimeout(() => {
        custQuery = search.value.trim();
        loadCustomers(true);
      }, 350);
    });
  }

  const clearBtn = document.getElementById("customers-clear");
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", () => {
      clearTimeout(custSearchTimer); // ยกเลิกการค้นหาที่ค้างอยู่ ไม่งั้นจะโหลดซ้ำอีกรอบ
      if (search) {
        search.value = "";
        search.focus();
      }
      custQuery = "";
      loadCustomers(true);
    });
  }
}

async function saveCustomerPhone(input) {
  const phone = input.value.trim();
  const userId = input.dataset.userId;
  const prefix = input.dataset.prefix || "";

  if (!/^\d{9,10}$/.test(phone)) {
    alert("กรุณากรอกเบอร์ให้ถูกต้อง (9-10 หลัก)");
    return;
  }

  input.disabled = true;
  try {
    const res = await fetch("/api/customer-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, phoneNumber: phone }),
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || "บันทึกไม่สำเร็จ");
      input.disabled = false;
      return;
    }

    const span = document.createElement("span");
    span.className = "cust-phone-span";
    span.textContent = phone;
    span.dataset.userId = userId;
    span.dataset.prefix = prefix;
    input.replaceWith(span);

    const row = span.closest("tr");
    const userCell = row?.querySelector(".cust-user-cell");
    if (userCell && result.user) {
      userCell.textContent = result.user;
      userCell.title = result.user;
    }
  } catch (err) {
    alert("เชื่อมต่อล้มเหลว");
    input.disabled = false;
  }
}

function initCustomersPage() {
  custLoaded = 0;
  custAllLoaded = false;
  custLoading = false;
  custQuery = "";
  const search = document.getElementById("customers-search");
  if (search) search.value = "";
  bindCustomerEvents();
  loadCustomers(true);
}

window.initCustomersPage = initCustomersPage;
