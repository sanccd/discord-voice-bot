require("dotenv").config();


require("http")
  .createServer((req, res) => res.end("OK"))
  .listen(process.env.PORT || 3000);

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");
const {
  initDatabase,
  saveJoinSession,
  saveLeaveSession,
  getLeaderboard,
} = require("./database");

initDatabase();

// สร้าง Client พร้อม Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

// กำหนดค่า config
const CONFIG = {
  TOKEN: process.env.TOKEN,
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
  LOG_JOIN_CHANNEL_ID: process.env.LOG_JOIN_CHANNEL_ID,
};
if (!CONFIG.TOKEN) {
  console.error("❌ TOKEN ไม่มี!");
  process.exit(1);
}

// if (!CONFIG.LOG_CHANNEL_ID) {
//   console.error("❌ LOG_CHANNEL_ID ไม่มี!");
//   process.exit(1);
// }

// if (!CONFIG.LOG_JOIN_CHANNEL_ID) {
//   console.error("❌ LOG_JOIN_CHANNEL_ID ไม่มี!");
//   process.exit(1);
// }

// Event: เมื่อบอทพร้อมใช้งาน
client.once("ready", async () => {
  console.log("✅ Bot is online");

  // สร้าง slash command สำหรับ leaderboard
  const guilds = client.guilds.cache;

  guilds.forEach(async (guild) => {
    try {
      await guild.commands.create({
        name: "leaderboard",
        description: "แสดงตารางคนที่ใช้เวลาใน Voice มากที่สุด 10 อันดับ",
      });
      console.log(`✅ Command /leaderboard created in ${guild.name}`);
    } catch (error) {
      console.error(
        `❌ Failed to create command in ${guild.name}:`,
        error.message,
      );
    }
  });
});

// Event: จัดการ Slash Commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "leaderboard") {
    await handleLeaderboard(interaction);
  }
});

// ฟังก์ชันสำหรับแสดง Leaderboard
async function handleLeaderboard(interaction) {
  try {
    await interaction.deferReply();

    const leaderboard = await getLeaderboard(10);

    if (leaderboard.length === 0) {
      await interaction.editReply("❌ ยังไม่มีข้อมูลใน Leaderboard");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 Voice Time Leaderboard")
      .setColor(0x00ae86)
      .setTimestamp();

    let description = "";
    const medals = ["🥇", "🥈", "🥉"];

    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const user = await client.users.fetch(entry.user_id).catch(() => null);
      const username = user ? user.username : `Unknown (${entry.user_id})`;
      const timeFormatted = formatDuration(entry.total_time);
      const medal = medals[i] || `${i + 1}.`;

      description += `${medal} **${username}** - ${timeFormatted}\n`;
    }

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in leaderboard command:", error);
    await interaction.editReply("❌ เกิดข้อผิดพลาดในการดึงข้อมูล Leaderboard");
  }
}

// Event: ตรวจจับการเข้า/ออก Voice Channel
client.on("voiceStateUpdate", async (oldState, newState) => {
  const userId = newState.id || oldState.id;
  const guildId = newState.guild?.id || oldState.guild?.id;

  // ตรวจจับเมื่อ user เข้า voice channel ใหม่
  if (!oldState.channel && newState.channel) {
    console.log("🔥 JOIN EVENT TRIGGERED"); // 👈 เพิ่ม
    if (newState.member.user.bot) return; // กัน bot

    const joinTime = Date.now();

    console.log(
      `🎧 ${newState.member?.user?.username} เข้าห้อง Voice: ${newState.channel.name}`,
    );

    await saveJoinSession(userId, guildId, joinTime);

    // ✅ เพิ่มบรรทัดนี้
    await sendJoinLog(newState);
  }

  // ตรวจจับเมื่อ user ออกจาก voice channel
  if (oldState.channel && !newState.channel) {
    const leaveTime = Date.now();
    const username = oldState.member?.user?.username || "Unknown";

    console.log(`🔴 ${username} ออกจากห้อง Voice: ${oldState.channel.name}`);

    const durationSeconds = await saveLeaveSession(userId, leaveTime);

    if (durationSeconds) {
      const durationMinutes = Math.floor(durationSeconds / 60);

      console.log(`⏱️ ${username} อยู่ใน Voice ${durationMinutes} นาที`);

      // ส่ง log ไปยัง channel ที่กำหนด
      await sendLogMessage(oldState, durationSeconds);
    }
  }
});

// ฟังก์ชันส่ง log ไปยัง Discord channel
async function sendLogMessage(state, durationSeconds) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Log channel not found");
    return;
  }

  const username = state.member?.user?.username || "Unknown";
  const channelName = state.channel?.name || "Unknown";
  const durationFormatted = formatDuration(durationSeconds);

  const embed = new EmbedBuilder()
    .setTitle("🔴 Voice Channel Leave")
    .setColor(0xff0000)
    .addFields(
      { name: "User", value: username, inline: true },
      { name: "Channel", value: channelName, inline: true },
      { name: "Duration", value: durationFormatted, inline: true },
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

async function sendJoinLog(state) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_JOIN_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Join log channel not found");
    return;
  }

  const username = state.member?.user?.username || "Unknown";
  const channelName = state.channel?.name || "Unknown";

  const embed = new EmbedBuilder()
    .setTitle("🟢 Voice Channel Join")
    .setColor(0x00ff00)
    .addFields(
      { name: "User", value: username, inline: true },
      { name: "Channel", value: channelName, inline: true },
      { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:T>` },
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

// ฟังก์ชันจัดรูปแบบ duration
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// เริ่มต้นบอท
let isStarting = false;

async function startBot() {
  if (isStarting) return; // 🔥 กันซ้อน
  isStarting = true;

  try {
    console.log("TOKEN EXISTS:", !!process.env.TOKEN);
    console.log("TOKEN LENGTH:", process.env.TOKEN?.length);

    console.log("🚀 START LOGIN...");

    const loginPromise = client.login(process.env.TOKEN);

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

client.on("disconnect", () => {
  console.log("⚠️ Disconnected!");
});

client.on("reconnecting", () => {
  console.log("🔄 Reconnecting...");
});

client.on("error", console.error);

startBot();
