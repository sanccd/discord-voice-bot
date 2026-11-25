const CONFIG = require("./config");
const { Client, GatewayIntentBits } = require("discord.js");
const { initDatabase } = require("./database");

if (!CONFIG.TOKEN) {
  console.error("❌ TOKEN ไม่มี!");
  process.exit(1);
}

// HTTP server เล็กๆ ให้โฮสต์เช็กว่าบอทยังทำงานอยู่
require("http")
  .createServer((req, res) => res.end("OK"))
  .listen(process.env.PORT || 3000);

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

initDatabase();

// สร้าง Client พร้อม Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, // 🔨 จำเป็นสำหรับ guildBanAdd
    GatewayIntentBits.MessageContent,
  ],
});

// ลงทะเบียนระบบต่างๆ (แต่ละไฟล์ใน events/ ดูแลหนึ่งระบบ)
require("./events/ready")(client);
require("./events/interactionCreate")(client);
require("./events/voiceStateUpdate")(client, CONFIG);
require("./events/serverModeration")(client, CONFIG);
require("./events/Delete-log")(client, CONFIG);
require("./events/messageUpdate")(client, CONFIG);

client.on("disconnect", () => {
  console.log("⚠️ Disconnected!");
});

client.on("reconnecting", () => {
  console.log("🔄 Reconnecting...");
});

client.on("error", console.error);

// เริ่มต้นบอท
let isStarting = false;

async function startBot() {
  if (isStarting) return; // 🔥 กันซ้อน
  isStarting = true;

  try {
    console.log("🚀 START LOGIN...");

    const loginPromise = client.login(CONFIG.TOKEN);

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Login timeout")), 10000),
    );

    await Promise.race([loginPromise, timeout]);

    console.log("🔥 LOGIN SUCCESS");
  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);

    setTimeout(() => {
      console.log("🔁 RETRY LOGIN...");
      isStarting = false; // 🔥 reset ก่อน retry
      startBot();
    }, 5000);
  }
}

startBot();
