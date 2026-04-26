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
  getUserTime,
  getUserRank,
} = require("./database");

initDatabase();

// สร้าง Client พร้อม Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// กำหนดค่า config
const CONFIG = {
  TOKEN: process.env.TOKEN,
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
  LOG_JOIN_CHANNEL_ID: process.env.LOG_JOIN_CHANNEL_ID,
  LOG_DELETE_CHANNEL_ID: process.env.LOG_DELETE_CHANNEL_ID,
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
client.once("clientReady", async () => {
  console.log("✅ Bot is online");

  // สร้าง slash command สำหรับ leaderboard
  const guilds = client.guilds.cache;

  guilds.forEach(async (guild) => {
    try {
      await guild.commands.create({
        name: "leaderboard",
        description: "แสดงตารางคนที่ใช้เวลาใน Voice มากที่สุด 10 อันดับ",
      });

      await guild.commands.create({
        name: "time",
        description: "ดูเวลาที่คุณอยู่ใน Voice",
      });

      await guild.commands.create({
        name: "rank",
        description: "ดูอันดับของคุณ",
      });

      await guild.commands.create({
        name: "stats",
        description: "ดูข้อมูล server",
      });

      await guild.commands.create({
        name: "userinfo",
        description: "ดูข้อมูล user",
      });

      console.log(`✅ Commands created in ${guild.name}`);
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
    return handleLeaderboard(interaction);
  }

  if (interaction.commandName === "time") {
    const total = await getUserTime(interaction.user.id);

    return interaction.reply(
      `⏱️ คุณอยู่ใน Voice ไปแล้ว ${formatDuration(total)}`,
    );
  }

  if (interaction.commandName === "rank") {
    const rank = await getUserRank(interaction.user.id);

    return interaction.reply(
      rank ? `🏆 อันดับของคุณคือ #${rank}` : "❌ ยังไม่มีอันดับ",
    );
  }

if (interaction.commandName === "stats") {
  const guild = interaction.guild;

 await guild.members.fetch(); // 🔥 เพิ่มบรรทัดนี้

 const totalMembers = guild.memberCount;

 const voiceUsers = guild.members.cache.filter((m) => m.voice.channel).size;

  const embed = new EmbedBuilder()
    .setTitle("📊 Server Stats")
    .setThumbnail(guild.iconURL())
    .setColor(0x5865f2)
    .addFields(
      { name: "👥 Members", value: `${totalMembers}`, inline: true },
      { name: "🎧 In Voice", value: `${voiceUsers}`, inline: true },
      // { name: "\u200b", value: "\u200b" }, // 🔥 บังคับขึ้นบรรทัดใหม่
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

if (interaction.commandName === "userinfo") {
  const member = await interaction.guild.members.fetch(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle("👤 User Info")
    .setColor(0x00ae86)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "👤 Username", value: member.user.tag, inline: true },
      { name: "🆔 ID", value: member.user.id, inline: true },

      {
        name: "🟢 Status",
        value: getStatus(member.presence?.status),
        inline: true,
      },

      {
        name: "🎭 Roles",
        value:
          member.roles.cache
            .filter((r) => r.id !== interaction.guild.id)
            .map((r) => r.toString())
            .join(", ") || "None",
      },

      {
        name: "📅 Joined Server",
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
      },

      {
        name: "⏳ Account Created",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
      },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
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
      .setTitle("🏆 Voice Leaderboard")
      .setColor(0x5865f2)
      .setThumbnail(interaction.guild.iconURL())
      .setTimestamp()
      .setFooter({ text: "Voice Tracker Bot" });

    let description = "";

    const max = leaderboard[0].total_time || 1; // 🔥 เอาออกมานอก loop

    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];

      const user = await client.users.fetch(entry.user_id).catch(() => null);
      const username = user ? user.username : "Unknown";

      const percent = entry.total_time / max;

      const medals = ["🥇", "🥈", "🥉"];
      const rankIcon = medals[i] || `${i + 1}.`;

      description += `${rankIcon} **${username}**
${progressBar(percent)} ${formatDuration(entry.total_time)}\n\n`;
    }

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in leaderboard command:", error);
    await interaction.editReply("❌ เกิดข้อผิดพลาดในการดึงข้อมูล Leaderboard");
  }
}

function progressBar(percent) {
  const total = 10;
  const filled = Math.max(1, Math.round(percent * total));
  return "█".repeat(filled) + "░".repeat(total - filled);
}

// Event: ตรวจจับการเข้า/ออก Voice Channel
client.on("voiceStateUpdate", async (oldState, newState) => {
  const userId = newState.id || oldState.id;
  const guildId = newState.guild?.id || oldState.guild?.id;

  console.log("VOICE EVENT:", {
    user: newState.member?.user?.username,
    old: oldState.channelId,
    new: newState.channelId,
  });

  // ❌ กัน bot
  if (newState.member?.user?.bot) return;

  // 🟢 เข้า voice
  if (!oldState.channelId && newState.channelId) {
    console.log("🔥 JOIN");

    const joinTime = Date.now();

    await saveJoinSession(userId, guildId, joinTime);
    await sendJoinLog(newState);
  }

  // 🔴 ออก voice
  else if (oldState.channelId && !newState.channelId) {
    console.log("🔴 LEAVE");

    const leaveTime = Date.now();

    const durationSeconds = await saveLeaveSession(userId, leaveTime);

    if (durationSeconds) {
      await sendLogMessage(oldState, durationSeconds);
    }
  }

  // 🔁 ย้ายห้อง
  else if (
    oldState.channelId &&
    newState.channelId &&
    oldState.channelId !== newState.channelId
  ) {
    console.log("🔁 MOVE");

    const leaveTime = Date.now();

    await saveLeaveSession(userId, leaveTime);
    await saveJoinSession(userId, guildId, Date.now());
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

 const nickname = state.member?.displayName;
 const usernameRaw = state.member?.user?.username;

 const username =
   nickname && nickname !== usernameRaw
     ? `${nickname} (${usernameRaw})`
     : usernameRaw || "Unknown";
  const channelName = state.channel?.name || "Unknown";
  const durationFormatted = formatDuration(durationSeconds);
  const guildName = state.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔴 Voice Channel Leave")
    .setColor(0xef4444) // 🔥 แดง soft
    .setThumbnail(state.guild.iconURL()) // 🔥 รูป server
    .addFields(
      {
        name: "🌐 Server",
        value: guildName,
      },

      { name: "👤 User", value: username, inline: true },
      { name: "📢 Channel", value: channelName, inline: true },
      { name: "⏱ Duration", value: durationFormatted, inline: true },
      {
        name: "⏰ Left At",
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
}

async function sendJoinLog(state) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_JOIN_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Join log channel not found");
    return;
  }

  const nickname = state.member?.displayName;
  const usernameRaw = state.member?.user?.username;

  const username =
    nickname && nickname !== usernameRaw
      ? `${nickname} (${usernameRaw})`
      : usernameRaw || "Unknown";
  const channelName = state.channel?.name || "Unknown";
  const guildName = state.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🟢 Voice Channel Join")
    .setColor(0x22c55e) // 🔥 เขียว soft ดูแพง
    .setThumbnail(state.guild.iconURL()) // 🔥 รูป server
    .addFields(
      {
        name: "🌐 Server",
        value: guildName,
      },

      { name: "👤 User", value: username, inline: true },
      { name: "📢 Channel", value: channelName, inline: true },
      {
        name: "⏰ Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
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

function getStatus(status) {
  switch (status) {
    case "online":
      return "🟢 Online";
    case "idle":
      return "🌙 Idle";
    case "dnd":
      return "⛔ Do Not Disturb";
    default:
      return "⚫ Offline";
  }
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

client.on("messageDelete", async (message) => {
  try {
    if (!message.guild || !message.author || message.author.bot) return;

    const logChannel = await client.channels
      .fetch(CONFIG.LOG_DELETE_CHANNEL_ID)
      .catch(() => null);

      let deletedBy = "Unknown";

      try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
          limit: 5,
          type: 72,
        });

        const deletionLog = fetchedLogs.entries.find((entry) => {
          return (
            entry.target?.id === message.author?.id &&
            Date.now() - entry.createdTimestamp < 5000
          );
        });

        if (deletionLog) {
          deletedBy = deletionLog.executor?.tag || "Unknown";
        } else {
          deletedBy = message.author?.tag || "Unknown (self delete)";
        }
      } catch (err) {
        console.log("⚠️ Cannot fetch audit logs");
      }

    if (!logChannel) {
      console.log("⚠️ Delete log channel not found");
      return;
    }

    const hasAttachment = message.attachments && message.attachments.size > 0;

    const content =
      message.content ||
      (hasAttachment ? "📎 เป็นไฟล์/รูปภาพ" : "❌ ไม่สามารถดึงข้อความได้");

    const attachments = message.attachments
      ? message.attachments.map((a) => a.url).join("\n")
      : "";

    const link = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Message Deleted")
      .setColor(0xff0000)
      .addFields(
        {
          name: "User",
          value: message.author?.tag || "Unknown",
          inline: true,
        },

        {
          name: "Deleted By",
          value: deletedBy,
          inline: true,
        },

        {
          name: "Channel",
          value: `<#${message.channel.id}>`,
          inline: true,
        },
        {
          name: "Message ID",
          value: message.id,
        },
        {
          name: "Content",
          value: content.slice(0, 1000),
        },
        {
          name: "Jump",
          value: `[คลิกดูข้อความ](${link})`,
        },
      )
      .setTimestamp();

    if (attachments) {
      embed.addFields({
        name: "Attachments",
        value: attachments,
      });
    }

    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Delete log error:", err);
  }
});

startBot();
