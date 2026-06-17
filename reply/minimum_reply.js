import { broadcastLog } from "../index.js";

/**
 * ฟังก์ชันสำหรับส่งข้อความ Flex Message ตอบกลับกรณีสลิปถูกต้อง
 * @param {string} replyToken - Token สำหรับการตอบกลับ LINE Messaging API
 * @param {Object} client - LINE Client สำหรับส่งข้อความ
 * @param {string} formattedTransactionDateTime - วันที่และเวลาที่จัดรูปแบบแล้ว
 * @param {string} transRef - Reference Transaction ID
 * @param {string} amount - จำนวนเงิน
 * @param {string} fromName - ชื่อผู้โอน
 * @param {string} fromBank - ชื่อธนาคารต้นทาง
 * @param {string} toName - ชื่อผู้รับ
 * @param {string} toBank - ชื่อธนาคารปลายทาง
 */
export async function sendMessageMinimum(replyToken, client, formattedTransactionDateTime, transRef, amount, fromName, fromBank, fromAccount, toName, toBank ,toAccount) {
    // LINE Flex ไม่ยอมรับ text ว่าง/undefined → ใส่ fallback ทุก field กัน 400
    const safe = (v) => (v === undefined || v === null || v === "" ? "-" : String(v));
    formattedTransactionDateTime = safe(formattedTransactionDateTime);
    transRef = safe(transRef);
    amount = safe(amount);
    fromName = safe(fromName);
    fromBank = safe(fromBank);
    fromAccount = safe(fromAccount);
    toName = safe(toName);
    toBank = safe(toBank);
    toAccount = safe(toAccount);

    const flexMessage = {
        "type": "bubble",
        "hero": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "image",
              "url": "https://imgur.com/DywRa1y.png",
              "align": "start",
              "gravity": "top",
              "size": "xxl",
              "margin": "lg",
              "aspectMode": "fit",
              "aspectRatio": "20:9",
              "offsetStart": "20px",
              "offsetBottom": "3px"
            }
          ],
          "margin": "none",
          "spacing": "none",
          "background": {
            "type": "linearGradient",
            "angle": "10deg",
            "endColor": "#81b3eb",
            "startColor": "#d4e8ff"
          }
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": "รายการ",
                  "size": "25px",
                  "color": "#edc904",
                  "align": "center",
                  "weight": "bold",
                  "position": "relative",
                  "margin": "md"
                },
                {
                  "type": "text",
                  "text": "ยอดเงินต่ำกว่ากำหนด ⚠",
                  "size": "25px",
                  "color": "#edc904",
                  "align": "center",
                  "weight": "bold",
                  "position": "relative"
                },
                {
                    "type": "text",
                    "text": `${amount} บาท`,
                    "weight": "bold",
                    "size": "xxl",
                    "margin": "md",
                    "align": "center"
                }
                ]
            },
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                {
                    "type": "text",
                    "text": "วันที่",
                    "size": "md",
                    "flex": 1,
                    "weight": "bold"
                },
                {
                    "type": "text",
                    "text": formattedTransactionDateTime,
                    "flex": 5,
                    "wrap": false,
                    "align": "end",
                    "weight": "bold"
                }
                ],
                "offsetTop": "sm",
                "margin": "xs"
            },
            {
                "type": "separator",
                "margin": "lg"
            },
            {
                "type": "box",
                "layout": "vertical",
                "margin": "md",
                "spacing": "md",
                "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                    {
                        "type": "text",
                        "text": "จาก",
                        "size": "md",
                        "color": "#666666",
                        "flex": 1
                    },
                    {
                        "type": "text",
                        "text": fromName,
                        "size": "md",
                        "color": "#111111",
                        "align": "end",
                        "weight": "bold",
                        "flex": 4
                    }
                    ]
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                    {
                        "type": "text",
                        "text": "ธนาคาร",
                        "size": "md",
                        "color": "#666666",
                        "flex": 1
                    },
                    {
                        "type": "text",
                        "text": fromBank,
                        "size": "md",
                        "color": "#111111",
                        "align": "end",
                        "flex": 4
                    }
                    ]
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                    {
                        "type": "text",
                        "text": "เลขบัญชี",
                        "size": "md",
                        "color": "#666666",
                        "flex": 2
                    },
                    {
                        "type": "text",
                        "text": fromAccount,
                        "size": "md",
                        "color": "#111111",
                        "align": "end",
                        "flex": 4
                    }
                    ]
                },
                {
                    "type": "separator",
                    "margin": "lg"
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                    {
                        "type": "text",
                        "text": "ไปยัง",
                        "size": "md",
                        "color": "#666666",
                        "flex": 1
                    },
                    {
                        "type": "text",
                        "text": toName,
                        "size": "md",
                        "color": "#111111",
                        "align": "end",
                        "weight": "bold",
                        "flex": 4
                    }
                    ],
                    "margin": "md"
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                    {
                        "type": "text",
                        "text": "ธนาคาร",
                        "size": "md",
                        "color": "#666666",
                        "flex": 1
                    },
                    {
                        "type": "text",
                        "text": toBank,
                        "size": "md",
                        "color": "#111111",
                        "align": "end",
                        "flex": 4
                    }
                    ]
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                    {
                        "type": "text",
                        "text": "เลขบัญชี",
                        "size": "md",
                        "color": "#666666",
                        "flex": 2
                    },
                    {
                        "type": "text",
                        "text": toAccount,
                        "size": "md",
                        "color": "#111111",
                        "align": "end",
                        "flex": 4
                    }
                    ]
                }
                ]
            },
            {
                "type": "separator",
                "margin": "lg"
            },
            {
                "type": "box",
                "layout": "horizontal",
                "margin": "md",
                "contents": [
                {
                    "type": "text",
                    "text": "เลขอ้างอิง",
                    "size": "xs",
                    "color": "#aaaaaa",
                    "flex": 2
                },
                {
                    "type": "text",
                    "text": transRef,
                    "color": "#aaaaaa",
                    "size": "xs",
                    "align": "end",
                    "flex": 4
                    }
                ]
            }
        ]
    }
};

  try {
    // ส่งข้อความผ่าน LINE Messaging API
    await client.replyMessage(replyToken, { type: "flex", altText: "🟡 สลิปยอดเงินต่ำกว่ากำหนด", contents: flexMessage });
    console.log("ตอบกลับแล้ว ยอดเงินต่ำกว่าที่กำหนด");
    broadcastLog("ตอบกลับแล้ว ยอดเงินต่ำกว่าที่กำหนด");
} catch (err) {
    console.error("❌ เกิดข้อผิดพลาดในการส่งข้อความ Flex Message:", err.message || err);
    broadcastLog("❌ เกิดข้อผิดพลาดในการส่งข้อความ Flex Message:", err.message || err);
}
}