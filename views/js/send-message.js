let foundUsersFull = []; // เก็บไว้ส่งข้อความภายหลัง [{ userId, prefix, accessToken }]
let uploadedImageURL = null;
let lookupInterval;
let isUploadingImage = false;

// จัดการ placeholder สำหรับ contenteditable div
const userIdInput = document.getElementById('userId');
if (userIdInput) {
  userIdInput.addEventListener('input', function() {
    // ถ้าลบจนหมด ให้เคลียร์ innerHTML เพื่อแสดง placeholder
    if (this.textContent.trim() === '' || this.innerHTML.trim() === '<br>') {
      this.innerHTML = '';
    }
  });
  
  userIdInput.addEventListener('blur', function() {
    // ตรวจสอบอีกครั้งเมื่อคลิกออก
    if (this.textContent.trim() === '' || this.innerHTML.trim() === '<br>') {
      this.innerHTML = '';
    }
  });
  
  // ป้องกันการวาง HTML/formatting จาก copy-paste
  userIdInput.addEventListener('paste', function(e) {
    e.preventDefault();
    // ดึงเฉพาะ plain text
    const text = (e.clipboardData || window.Clipboard).getData('text/plain');
    // วางเป็น plain text สีดำเท่านั้น
    document.execCommand('insertText', false, text);
  });
}

// ล้างรูปชั่วคราวทิ้งตอนปิด/รีเฟรชหน้า
//
// listener นี้อยู่ระดับ top-level = ผูกกับ window ครั้งเดียวแล้วอยู่ยาวทั้ง session
// (สคริปต์ของหน้าย่อยถูกโหลดครั้งเดียว ดู __loadedScripts ใน index.html)
// เข้าหน้านี้ครั้งเดียวก็พอ หลังจากนั้นรีเฟรชแอปตรงไหนก็ตามมันจะยิงตาม
// เดิมยิงทุกครั้งไม่ว่าจะมีรูปค้างอยู่หรือไม่ — เปลืองการ query DB เปล่าๆ
// และไปโผล่ในประวัติการใช้งานเป็น "ลบรูปที่อัปโหลดไว้" รัวๆ ทั้งที่ผู้ใช้ไม่ได้ลบอะไรเลย
// → ยิงเฉพาะตอนมีรูปค้างอยู่จริงเท่านั้น
window.addEventListener("beforeunload", () => {
  if (!uploadedImageURL) return;
  try {
    // keepalive ให้ request วิ่งต่อจนจบแม้หน้าจะปิดไปแล้ว (fetch ปกติโดนยกเลิก)
    fetch("/api/delete-my-upload", {
      method: "DELETE",
      credentials: "include", // ส่ง sessionId ไปด้วย
      keepalive: true
    });
  } catch (err) {
    console.error("❌ Error ตอนพยายามลบภาพก่อน unload:", err);
  }
});

async function removeImage() {
  const previewImg = document.getElementById('preview-img');
  const previewWrapper = document.getElementById('preview-image');
  const imageInput = document.getElementById('imageUpload');

  // เคลียร์ค่าต่างๆ
  uploadedImageURL = null;
  previewImg.src = '';
  previewWrapper.style.display = 'none';
  imageInput.value = '';

  try {
    // ลบรูปภาพจาก server
    const res = await fetch("/api/delete-my-upload", {
      method: "DELETE",
      credentials: "include"
    });

    if (!res.ok) {
      console.warn("ไม่สามารถลบรูปภาพจาก server ได้");
    }
  } catch (err) {
    console.error("❌ Error ในการลบรูปภาพ:", err);
  }
}

async function handleImageSelect(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    const previewImg = document.getElementById('preview-img');
    const previewWrapper = document.getElementById('preview-image');

    // ตรวจสอบประเภทไฟล์
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
      event.target.value = '';
      return;
    }

    // ตรวจสอบขนาดไฟล์
    if (file.size > 20 * 1024 * 1024) {
      alert('ขนาดไฟล์ต้องไม่เกิน 20MB');
      event.target.value = '';
      return;
    }

    // แสดงพรีวิวเบลอ + overlay ก่อนอัปโหลด
    const reader = new FileReader();
    reader.onload = async function (e) {
      uploadedImageURL = e.target.result;
      previewImg.src = uploadedImageURL;
      previewWrapper.style.display = 'block';
      previewWrapper.classList.add('loading'); // เปิดโหมดโหลด
      isUploadingImage = true;

      try {
        // เริ่มอัปโหลดไฟล์
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/upload-send-image-line', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        const data = await response.json();

        if (response.ok && data.success) {
          console.log("อัปโหลดสำเร็จ:", data);
          previewWrapper.classList.remove('loading'); // ลบเบลอออก
          previewImg.title = `ID: ${data.fileId || ''}`;
        } else {
          throw new Error(data.error || 'อัปโหลดล้มเหลว');
        }
      } catch (uploadError) {
        console.error('❌ Upload error:', uploadError);
        alert(uploadError.message || 'เกิดข้อผิดพลาดในการอัปโหลด');
        previewImg.src = '';
        previewWrapper.style.display = 'none';
        uploadedImageURL = null;
      } finally {
        isUploadingImage = false;
      }
    };

    reader.readAsDataURL(file);
  } catch (err) {
    console.error('❌ General error:', err);
    alert('เกิดข้อผิดพลาดในการจัดการไฟล์');
    event.target.value = '';
    isUploadingImage = false;
  }
}

function startLookupAnimation() {
  const lookupStatus = document.getElementById("lookup-status");
  if (!lookupStatus) return;

  const frames = ["กำลังค้นหา.", "กำลังค้นหา..", "กำลังค้นหา..."];
  let i = 0;

  lookupStatus.textContent = frames[i];
  lookupStatus.style.color = "black"; // สีระหว่างค้นหา

  clearInterval(lookupInterval);
  lookupInterval = setInterval(() => {
    i = (i + 1) % frames.length;
    lookupStatus.textContent = frames[i];
  }, 500);
}

function stopLookupAnimation() {
  clearInterval(lookupInterval);
}

async function lookupUser() {
  const input = document.getElementById("userId");
  const rawInput = (input.textContent || input.innerText || "").trim();

  const lookupStatus = document.getElementById("lookup-status");
  const userNotFound = document.getElementById("user-not-found");

  userNotFound.textContent = "";
  startLookupAnimation();

  if (!rawInput) {
    lookupStatus.textContent = "* กรุณากรอกข้อมูลผู้ใช้ก่อน";
    lookupStatus.style.color = "orange";
    return;
  }

  const userList = [...new Set(extractUserIds(rawInput))];
  if (userList.length === 0) {
    lookupStatus.textContent = "* ไม่พบรหัสผู้ใช้ที่ถูกต้อง";
    lookupStatus.style.color = "orange";
    return;
  }

  try {
    const res = await fetch('/api/user-lookup-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: userList }),
    });
    const data = await res.json();

    stopLookupAnimation();

    foundUsersFull = [];
    const notFoundUsers = [];

    for (const user of data.results) {
      if (user.found) {
        foundUsersFull.push({
          userId: user.userId,
          username: user.username,
          prefix: user.username.substring(0, 3),
          accessToken: user.accessToken,
        });
      } else {
        notFoundUsers.push(user.username);
      }
    }

    const foundCount = foundUsersFull.length;
    const color = foundCount === 0 ? "red" : (foundCount < userList.length ? "orange" : "green");
    lookupStatus.innerHTML = `พบ USER : <span style="color:${color}">${foundCount} / ${userList.length}</span> คน`;

    if (notFoundUsers.length > 0) {
      const displayLimit = 22;
      const shownUsers = notFoundUsers.slice(0, displayLimit);

      // สร้างข้อความแสดงผล
      let result = "ไม่พบ USER: " + shownUsers.join(", ");

      userNotFound.innerHTML = result;

      // สร้างปุ่ม "... ดูทั้งหมด" เฉพาะเมื่อมีมากกว่า 3 รายการ
      if (notFoundUsers.length > 3) {
        const viewAllBtn = document.createElement('button');
        viewAllBtn.textContent = ' ... ดูทั้งหมด';
        viewAllBtn.onclick = () => showAllNotFoundUsers(notFoundUsers);
        userNotFound.appendChild(viewAllBtn);
      }
      
      // เปลี่ยนสีตัวอักษรที่ไม่เจอเป็นสีแดง
      highlightNotFoundUsers(input, rawInput, notFoundUsers);
    } else {
      // ถ้าเจอหมด ให้แสดงข้อความปกติ (ไม่มีสี)
      input.textContent = rawInput;
    }

  } catch (err) {
    console.error("❌ Error in batch lookup:", err);
    lookupStatus.textContent = "เกิดข้อผิดพลาดระหว่างค้นหา";
    lookupStatus.style.color = "red";
  }
}

// ฟังก์ชันเปิด Modal แสดงรายชื่อ user ที่ไม่พบทั้งหมด
function showAllNotFoundUsers(notFoundUsers) {
  const modal = document.getElementById("notFoundUsersModal");
  const listContainer = document.getElementById("notFoundUsersList");
  const countText = document.getElementById("notFoundUsersCount");
  
  // อัปเดตจำนวน
  countText.textContent = `ไม่พบ USER ทั้งหมด ${notFoundUsers.length} คน`;
  
  // สร้างรายการ
  listContainer.innerHTML = notFoundUsers.map(user => 
    `<div style="padding: 4px 8px; border-bottom: 1px solid #eee;">${user}</div>`
  ).join('');
  
  // แสดง Modal
  modal.style.display = "block";
}

// ฟังก์ชันปิด Modal
function closeNotFoundUsersModal() {
  document.getElementById("notFoundUsersModal").style.display = "none";
}

// ปิด Modal เมื่อคลิกนอกกรอบ
window.addEventListener('click', function(event) {
  const modal = document.getElementById("notFoundUsersModal");
  if (event.target === modal) {
    closeNotFoundUsersModal();
  }
});

// ฟังก์ชันสำหรับ highlight username ที่ไม่เจอด้วยสีแดง
function highlightNotFoundUsers(element, originalText, notFoundUsers) {
  // สร้าง Set ของ username ที่ไม่เจอ
  const notFoundSet = new Set(notFoundUsers.map(u => u.toUpperCase()));
  
  // แยก username ทั้งหมด
  const allUsernames = extractUserIds(originalText);
  
  // แบ่งข้อความเป็นบรรทัด
  const lines = originalText.toUpperCase().split('\n');
  
  // ประมวลผลแต่ละบรรทัด
  const processedLines = lines.map(line => {
    let processedLine = escapeHtml(line);
    
    allUsernames.forEach(username => {
      const upperUsername = username.toUpperCase();
      if (notFoundSet.has(upperUsername) && line.includes(upperUsername)) {
        const regex = new RegExp(`\\b${upperUsername}\\b`, 'g');
        processedLine = processedLine.replace(regex, `<span style="color:red;display:inline;">${upperUsername}</span>`);
      }
    });
    
    return processedLine;
  });
  
  // รวมบรรทัดกลับมาด้วย <br> และกรอง blank lines ออกเพื่อไม่ให้ช่องว่างเกิน
  element.innerHTML = processedLines.filter(l => l.trim()).join('<br>');
}

// ฟังก์ชัน escape HTML เพื่อป้องกัน XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function extractUserIds(rawInput) {
  // แปลงเป็นพิมพ์ใหญ่ก่อน แล้วลบช่องว่าง, comma และ newline
  const cleanInput = rawInput.toUpperCase().replace(/[\s,]+/g, "");

  const matches = [];
  const regex = /([A-Z]{3})(\d+)/g;
  let match;

  while ((match = regex.exec(cleanInput)) !== null) {
    const prefix = match[1];
    const digits = match[2];
    matches.push(prefix + digits);
  }

  return matches;
}

async function sendMessageToFoundUsers(event) {
  if (event) event.preventDefault();

  if (isUploadingImage) {
    alert("กำลังอัปโหลดรูปภาพอยู่ โปรดรอสักครู่...");
    return;
  }

  const message = document.getElementById("message")?.value?.trim();
  const sendButton = document.querySelector(".btn.sending");

  if (!message && !uploadedImageURL) {
    alert("กรุณากรอกข้อความหรือเลือกรูปภาพก่อนส่ง");
    return;
  }

  if (!foundUsersFull || foundUsersFull.length === 0) {
    alert("ยังไม่มีผู้ใช้ที่ค้นหาเจอ");
    return;
  }

  // 🔒 ล็อคปุ่มก่อนเริ่มส่ง
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "กำลังส่ง...";
    sendButton.style.opacity = "0.6";
    sendButton.style.cursor = "not-allowed";
  }

  const CONCURRENCY = 5;
  // พักระหว่างกลุ่ม แบบสุ่มเวลา (ms) — ลดสัญญาณ bot/spam ของ LINE
  const BATCH_DELAY_MIN = 1500; // 1.5 วินาที
  const BATCH_DELAY_MAX = 3000; // 3 วินาที
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const randomDelay = () => BATCH_DELAY_MIN + Math.random() * (BATCH_DELAY_MAX - BATCH_DELAY_MIN);

  // แบ่งกลุ่มผู้ใช้เป็น batch ขนาด CONCURRENCY
  for (let i = 0; i < foundUsersFull.length; i += CONCURRENCY) {
    const batch = foundUsersFull.slice(i, i + CONCURRENCY);

    // ส่งพร้อมกันทุกคน
    const batchPromises = batch.map(async (user) => {
      const { userId, username } = user;

      // เริ่ม log “กำลังส่ง...”
      startUserSending(username, userId);

      try {
        const formData = new FormData();
        formData.append("userId", userId);
        formData.append("message", message || "");

        // ถ้ามีรูปภาพ ให้ดึง blob จาก URL แล้วแนบไป
        if (uploadedImageURL) {
          const response = await fetch(uploadedImageURL);
          if (!response.ok) throw new Error("ไม่สามารถโหลดรูปภาพได้");
          const blob = await response.blob();
          const contentType = blob.type || "image/jpeg";
          const extension = contentType.split("/")[1] || "jpg";
          formData.append("image", blob, `uploaded-image.${extension}`);
        }

        // ส่งข้อความ
        const res = await fetch("/api/send-message", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (data.success) {
          const usedLine = data.usedLine || "-";
          markUserSuccess(userId, usedLine);
        } else {
          markUserFail(userId);
        }

      } catch (err) {
        markUserFail(userId);
        console.error("ส่งข้อความล้มเหลว:", err);
      }
    });

    // รอ batch นี้จบก่อนจะเริ่ม batch ต่อไป
    await Promise.all(batchPromises);

    // พักแบบสุ่มก่อนเริ่มกลุ่มถัดไป (ไม่พักหลังกลุ่มสุดท้าย)
    if (i + CONCURRENCY < foundUsersFull.length) {
      await sleep(randomDelay());
    }
  }

  // ปลดล็อกปุ่มส่ง + เคลียร์ข้อมูล input ทั้งหมด
  if (sendButton) {
    sendButton.disabled = false;
    sendButton.textContent = "ส่งข้อความ";
    sendButton.style.opacity = "1";
    sendButton.style.cursor = "pointer";
  }

  // เคลียร์ข้อความใน textarea
  const messageBox = document.getElementById("message");
  if (messageBox) messageBox.value = "";

  // เคลียร์รูปภาพที่ preview
  const previewImg = document.getElementById("preview-img");
  const previewWrapper = document.getElementById("preview-image");
  if (previewImg) previewImg.src = "";
  if (previewWrapper) previewWrapper.style.display = "none";

  // รีเซ็ต input file ให้พร้อมเลือกไฟล์ใหม่ได้
  const fileInput = document.getElementById("imageUpload");
  if (fileInput) fileInput.value = "";

  // ล้างตัวแปรอ้างอิงรูปเก่า
  uploadedImageURL = null;
}

const sendingIntervals = new Map();

function getCurrentTime() {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

// สร้าง log แถวใหม่
function createLogRow(username, userId, statusText, statusClass) {
  const tbody = document.getElementById("logBody");
  const row = document.createElement("tr");

  const time  = document.createElement("td"); time.textContent = `${getCurrentTime()}`;
  const lineuser  = document.createElement("td"); lineuser.textContent = username;
  const user  = document.createElement("td"); user.textContent = userId;
  const shop  = document.createElement("td"); shop.textContent = "-";
  const state = document.createElement("td"); state.textContent = statusText; state.className = statusClass;


  row.append(time, lineuser, user, shop, state);
  tbody.appendChild(row);
  tbody.scrollTop = tbody.scrollHeight;

  return { state, shop };
}

function startUserSending(username, userId) {
  const frames = ["กำลังส่ง.", "กำลังส่ง..", "กำลังส่ง..."];
  let i = 0;

  const { state, shop } = createLogRow( username, userId, frames[i], "log-status--sending");

  const interval = setInterval(() => {
    i = (i + 1) % frames.length;
    state.textContent = frames[i];
  }, 500);

  sendingIntervals.set(userId, { interval, state, shop });
}

function markUserSuccess(userId, shopName) {
  const it = sendingIntervals.get(userId);
  if (!it) return;
  clearInterval(it.interval);
  it.state.className = "log-status--ok";
  it.state.textContent = "ส่งสำเร็จ";
  it.shop.textContent = shopName || "-";
  sendingIntervals.delete(userId);
}

function markUserFail(userId) {
  const it = sendingIntervals.get(userId);
  if (!it) return;
  clearInterval(it.interval);
  it.state.className = "log-status--fail";
  it.state.textContent = "ส่งไม่สำเร็จ";
  it.shop.textContent = "-";
  sendingIntervals.delete(userId);
}