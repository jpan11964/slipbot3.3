// utils/telegram.js — ส่งข้อความ Telegram (ระบุ token/chatId ของบอทแต่ละตัว)
export async function sendTelegram(token, chatId, message) {
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
  } catch (err) {
    console.error("❌ ส่ง Telegram ล้มเหลว:", err.message);
  }
}
