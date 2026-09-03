// views/js/audit.js — หน้าประวัติการใช้งาน (ใครกดอะไรไปบ้าง)
//
// สคริปต์นี้ถูกโหลดครั้งเดียวตลอดอายุ session (ดู __loadedScripts ใน index.html)
// ทุกอย่างที่ต้องตั้งใหม่ทุกครั้งที่เข้าหน้า จึงต้องอยู่ใน initAuditPage() เท่านั้น

const AUDIT_PAGE_SIZE = 100;

const AUDIT_THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ไอคอนประจำหมวด — ดูปราดเดียวรู้ว่าเป็นเรื่องอะไร
const AUDIT_ICONS = {
  auth: "bi-box-arrow-in-right",
  shop: "bi-shop",
  line: "bi-chat-dots",
  bank: "bi-bank",
  setbot: "bi-robot",
  image: "bi-image",
  settings: "bi-sliders2",
  prefix: "bi-tags",
  perm: "bi-shield-lock",
  customer: "bi-person-lines-fill",
  message: "bi-send",
  noti: "bi-bell",
};

function initAuditPage() {
  const bodyEl = document.getElementById("auditBody");
  if (!bodyEl) return;

  const searchEl = document.getElementById("auditSearch");
  const userEl = document.getElementById("auditUser");
  const actionEl = document.getElementById("auditAction");
  const fromEl = document.getElementById("auditFrom");
  const toEl = document.getElementById("auditTo");
  const quickEl = document.getElementById("auditQuick");
  const clearEl = document.getElementById("auditClear");
  const countEl = document.getElementById("auditCount");
  const stateEl = document.getElementById("auditState");
  const moreEl = document.getElementById("auditMore");

  let loaded = 0;
  let total = 0;
  let loading = false;

  // ---------- สถานะกลางตาราง ----------
  function setState(kind, text, hint) {
    stateEl.hidden = false;
    stateEl.className = "audit-state" + (kind === "error" ? " error" : "");
    stateEl.replaceChildren();

    if (kind === "loading") {
      const sp = document.createElement("div");
      sp.className = "audit-spinner";
      stateEl.appendChild(sp);
    } else {
      const ic = document.createElement("i");
      ic.className = "bi " + (kind === "error" ? "bi-exclamation-triangle" : "bi-inbox");
      stateEl.appendChild(ic);
    }

    const t = document.createElement("span");
    t.className = "audit-state-text";
    t.textContent = text;
    stateEl.appendChild(t);

    if (hint) {
      const h = document.createElement("span");
      h.className = "audit-state-hint";
      h.textContent = hint;
      stateEl.appendChild(h);
    }
  }
  const clearState = () => { stateEl.hidden = true; stateEl.replaceChildren(); };

  // ---------- เวลา ----------
  function formatTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, "0");
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === new Date().toDateString()) return { date: "", time: hm };
    return { date: `${d.getDate()} ${AUDIT_THAI_MONTHS[d.getMonth()]}`, time: hm };
  }

  // ---------- หนึ่งแถว ----------
  function makeRow(r) {
    const tr = document.createElement("tr");
    if (!r.ok) tr.className = "failed";

    // เวลา
    const tdTime = document.createElement("td");
    tdTime.className = "col-time";
    const { date, time } = formatTime(r.ts);
    if (date) {
      const dEl = document.createElement("span");
      dEl.className = "audit-date";
      dEl.textContent = date;
      tdTime.appendChild(dEl);
    }
    const tEl = document.createElement("span");
    tEl.className = "audit-time";
    tEl.textContent = time;
    tdTime.appendChild(tEl);
    tdTime.title = new Date(r.ts).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium" });

    // ผู้ใช้
    const tdUser = document.createElement("td");
    tdUser.className = "col-user";
    const uName = document.createElement("span");
    uName.className = "audit-user";
    uName.textContent = r.username || "-";
    tdUser.appendChild(uName);
    if (r.role) {
      const badge = document.createElement("span");
      badge.className = "audit-role " + r.role.toLowerCase();
      badge.textContent = r.role;
      tdUser.appendChild(badge);
    }

    // การกระทำ
    const tdAction = document.createElement("td");
    tdAction.className = "col-action";
    const ic = document.createElement("i");
    ic.className = "bi " + (AUDIT_ICONS[String(r.action || "").split(".")[0]] || "bi-dot");
    tdAction.appendChild(ic);
    const lb = document.createElement("span");
    lb.textContent = r.label || r.action || "-";
    tdAction.appendChild(lb);

    // เป้าหมาย / รายละเอียด
    const tdTarget = document.createElement("td");
    tdTarget.className = "col-target";
    tdTarget.textContent = r.target || "-";
    tdTarget.title = r.target || "";

    const tdDetail = document.createElement("td");
    tdDetail.className = "col-detail";
    tdDetail.textContent = r.detail || "-";
    tdDetail.title = r.detail || "";

    // ผลลัพธ์
    const tdStatus = document.createElement("td");
    tdStatus.className = "col-status";
    const st = document.createElement("span");
    st.className = "audit-status " + (r.ok ? "ok" : "fail");
    st.textContent = r.ok ? "สำเร็จ" : "ไม่สำเร็จ";
    st.title = `HTTP ${r.status ?? "-"}${r.ip ? " · " + r.ip : ""}`;
    tdStatus.appendChild(st);

    tr.append(tdTime, tdUser, tdAction, tdTarget, tdDetail, tdStatus);
    return tr;
  }

  // ---------- ตัวกรอง ----------
  const toISO = v => (v ? new Date(v).toISOString() : "");

  function query() {
    const p = new URLSearchParams();
    if (searchEl.value.trim()) p.set("q", searchEl.value.trim());
    if (userEl.value) p.set("username", userEl.value);
    if (actionEl.value) p.set("action", actionEl.value);
    if (fromEl.value) p.set("from", toISO(fromEl.value));
    if (toEl.value) p.set("to", toISO(toEl.value));
    return p;
  }

  const hasFilter = () =>
    !!(searchEl.value.trim() || userEl.value || actionEl.value || fromEl.value || toEl.value);

  // ---------- โหลดข้อมูล ----------
  async function load(initial) {
    if (loading) return;
    loading = true;
    moreEl.hidden = true;

    if (initial) {
      bodyEl.replaceChildren();
      loaded = 0;
      setState("loading", "กำลังโหลดประวัติ...");
    }

    try {
      const p = query();
      p.set("skip", loaded);
      p.set("limit", AUDIT_PAGE_SIZE);
      const res = await fetch(`/api/audit?${p.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const rows = data.rows || [];
      total = data.total ?? 0;

      if (initial) clearState();
      rows.forEach(r => bodyEl.appendChild(makeRow(r)));
      loaded += rows.length;

      countEl.textContent = total
        ? `ทั้งหมด ${total.toLocaleString()} รายการ` + (loaded < total ? ` (แสดง ${loaded.toLocaleString()})` : "")
        : "";

      if (!loaded) {
        setState(
          "empty",
          hasFilter() ? "ไม่พบประวัติตามเงื่อนไขที่เลือก" : "ยังไม่มีประวัติการใช้งาน",
          "ระบบเก็บประวัติย้อนหลัง 90 วัน ข้อมูลที่เก่ากว่านั้นจะถูกลบอัตโนมัติ"
        );
      }
      moreEl.hidden = loaded >= total;
    } catch (err) {
      console.error("โหลดประวัติการใช้งานล้มเหลว", err);
      if (initial) setState("error", "โหลดประวัติไม่สำเร็จ", "ลองรีเฟรชหน้าอีกครั้ง");
    } finally {
      loading = false;
    }
  }

  // ---------- ตัวเลือกใน dropdown ----------
  async function loadFilterOptions() {
    try {
      const res = await fetch("/api/audit/filters");
      const data = await res.json();

      // เก็บค่าที่เลือกอยู่ไว้ เผื่อผู้ใช้กรองค้างแล้วเข้าหน้าใหม่
      const keepUser = userEl.value;
      const keepAction = actionEl.value;

      userEl.replaceChildren(new Option("ทุกผู้ใช้", ""));
      (data.users || []).forEach(u => userEl.appendChild(new Option(u, u)));
      userEl.value = keepUser;

      actionEl.replaceChildren(new Option("ทุกการกระทำ", ""));
      (data.actions || []).forEach(a => actionEl.appendChild(new Option(a.label, a.action)));
      actionEl.value = keepAction;
    } catch (err) {
      console.error("โหลดตัวกรองไม่สำเร็จ", err);
    }
  }

  // ---------- ผูก event ----------
  const toLocalInput = (d) => {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
           `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  quickEl.addEventListener("change", () => {
    const days = Number(quickEl.value);
    if (!days) {
      fromEl.value = ""; toEl.value = "";
    } else {
      const now = new Date();
      fromEl.value = toLocalInput(new Date(now.getTime() - days * 86400000));
      toEl.value = toLocalInput(now);
    }
    load(true);
  });

  // แก้ช่วงเวลาเองแล้ว ตัวเลือกกรองด่วนไม่ควรค้างค่าเดิมไว้
  const resetQuick = () => { quickEl.value = ""; };
  fromEl.addEventListener("change", () => { resetQuick(); load(true); });
  toEl.addEventListener("change", () => { resetQuick(); load(true); });
  userEl.addEventListener("change", () => load(true));
  actionEl.addEventListener("change", () => load(true));
  moreEl.addEventListener("click", () => load(false));

  let searchTimer;
  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(true), 300);
  });

  clearEl.addEventListener("click", () => {
    searchEl.value = "";
    userEl.value = "";
    actionEl.value = "";
    fromEl.value = "";
    toEl.value = "";
    resetQuick();
    load(true);
  });

  loadFilterOptions();
  load(true);
}
