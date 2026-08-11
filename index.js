require("dotenv").config();
const testPUBG = require("./services/pubgTracker");

const diceCooldown = new Map();


require("http")
  .createServer((req, res) => res.end("OK"))
  .listen(process.env.PORT || 3000);

function diceEmoji(n) {
  return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1];
}

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  AuditLogEvent,
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
  LOG_EDIT_CHANNEL_ID: process.env.LOG_EDIT_CHANNEL_ID,
  LOG_MOVE_CHANNEL_ID: process.env.LOG_MOVE_CHANNEL_ID,
  LOG_VOICE_KICK_CHANNEL_ID: process.env.LOG_VOICE_KICK_CHANNEL_ID,
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

      await guild.commands.create({
        name: "dice",
        description: "ทอยลูกเต๋าในห้อง voice",
        options: [
          {
            name: "amount",
            description: "จำนวนลูกเต๋า (1 หรือ 2)",
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 2,
          },
        ],
      });

      await guild.commands.create({
        name: "diceall",
        description: "ทอยลูกเต๋าทั้งห้อง",
        options: [
          {
            name: "amount",
            description: "จำนวนลูกเต๋า (1 หรือ 2)",
            type: 4,
            required: true,
            min_value: 1,
            max_value: 2,
          },
        ],
      });

      console.log(`✅ Commands created in ${guild.name}`);
    } catch (error) {
      console.error(
        `❌ Failed to create command in ${guild.name}:`,
        error.message,
      );
    }
  });
  
    // 🔥 PUBG Tracker
  setInterval(() => {
    testPUBG(client);
  }, 60000);

  testPUBG(client);
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

  if (interaction.commandName === "dice") {
    const now = Date.now();
    const cooldown = 2500; // 2.5 วิ

    if (diceCooldown.has(interaction.user.id)) {
      const expire = diceCooldown.get(interaction.user.id) + cooldown;

      if (now < expire) {
        return interaction.reply({
          content: "⏳ รอแป๊บไอจูด",
          ephemeral: true,
        });
      }
    }

    diceCooldown.set(interaction.user.id, now);
    const amount = interaction.options.getInteger("amount");

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("❌ คุณต้องอยู่ใน voice ก่อน");
    }

    const member = interaction.member;

    // 🎲 roll
    let rolls = [];

    for (let i = 0; i < amount; i++) {
      rolls.push(Math.floor(Math.random() * 6) + 1);
    }

    const total = rolls.reduce((a, b) => a + b, 0);

    let diceText = rolls.map((n) => `${diceEmoji(n)}(${n})`).join(" + ");

    let text = `Dice (${amount} ลูก)\n\n`;

    text += `${member.displayName}\n[${diceText}] = ${total}\n`;

    text += `\nResult:\n- ${member.displayName}`;

    return interaction.reply({ content: text });
  }

  if (interaction.commandName === "diceall") {
    const now = Date.now();
    const cooldown = 2000;

    if (diceCooldown.has(interaction.user.id)) {
      const expire = diceCooldown.get(interaction.user.id) + cooldown;

      if (now < expire) {
        return interaction.reply({
          content: "⏳ ใจเย็นดิ รอหน่อย",
          ephemeral: true,
        });
      }
    }

    diceCooldown.set(interaction.user.id, now);

    const amount = interaction.options.getInteger("amount");

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("❌ คุณต้องอยู่ใน voice ก่อน");
    }

    const members = [...voiceChannel.members.values()].filter(
      (m) => !m.user.bot,
    );

    if (members.length < 2) {
      return interaction.reply("❌ ต้องมีอย่างน้อย 2 คน");
    }

    // 🎲 roll ทุกคน
    const results = members.map((member) => {
      let rolls = [];

      for (let i = 0; i < amount; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
      }

      const total = rolls.reduce((a, b) => a + b, 0);

      return {
        name: member.displayName,
        rolls,
        total,
      };
    });

    const min = Math.min(...results.map((r) => r.total));
    const losers = results.filter((r) => r.total === min);

    let text = `🎲 Dice ทั้งห้อง (${amount} ลูก)

\`\`\`
┌──────────────┬────────────────────┬───────┐
│ Player       │ Dice               │ Total │
├──────────────┼────────────────────┼───────┤
`;

    results.forEach((r) => {
      let diceText = r.rolls.map((n) => `${diceEmoji(n)}(${n})`).join(" + ");

      text += `│ ${r.name.slice(0, 10).padEnd(12)} │ ${diceText.padEnd(18)} │ ${r.total
        .toString()
        .padEnd(5)} │\n`;
    });

    text += `└──────────────┴────────────────────┴───────┘\n\`\`\`\n`;

    // ❗ ถ้าแต้มเท่ากันหมด
    if (losers.length === members.length) {
      text += "\nResult: Draw";
    } else {
      text += "\nResult:\n";
      losers.forEach((l) => {
        text += `- ${l.name}\n`;
      });
    }

    await interaction.deferReply();

    // เริ่ม animation
    await interaction.editReply("🎲 กำลังทอย...");

    const frames = ["🎲 .", "🎲 ..", "🎲 ...", "🎲 ทอยแล้ววว..."];

    for (let i = 0; i < frames.length; i++) {
      await new Promise((res) => setTimeout(res, 300));
      await interaction.editReply(frames[i]);
    }

    // หน่วงก่อนเฉลย
    await new Promise((res) => setTimeout(res, 400));

    // แสดงผลจริง
    await interaction.editReply(text);
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

  // 🔴 ออก voice (อาจเป็นออกเอง หรือถูกเตะ)
  else if (oldState.channelId && !newState.channelId) {
    console.log("🔴 LEAVE");

    const leaveTime = Date.now();

    const durationSeconds = await saveLeaveSession(userId, leaveTime);

    const kickEntry = CONFIG.LOG_VOICE_KICK_CHANNEL_ID
      ? await findVoiceKickAuditEntry(oldState.guild, leaveTime)
      : null;

    if (kickEntry) {
      console.log("🔊 VOICE KICK");
      await sendVoiceKickLog(oldState, kickEntry);
    } else if (durationSeconds) {
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
    await sendMoveLog(oldState, newState);
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

  await logChannel.send({
    content: `🔍 ${username}`,
    embeds: [embed],
  });
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

  await logChannel.send({
    content: `🔍 ${username}`,
    embeds: [embed],
  });
}

async function sendMoveLog(oldState, newState) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_MOVE_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Move log channel not found");
    return;
  }

  const nickname = newState.member?.displayName;
  const usernameRaw = newState.member?.user?.username;

  const username =
    nickname && nickname !== usernameRaw
      ? `${nickname} (${usernameRaw})`
      : usernameRaw || "Unknown";
  const fromChannelName = oldState.channel?.name || "Unknown";
  const toChannelName = newState.channel?.name || "Unknown";
  const guildName = newState.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔄 Voice Channel Move")
    .setColor(0xfacc15) // 🔥 เหลือง soft
    .setThumbnail(newState.guild.iconURL())
    .addFields(
      {
        name: "🌐 Server",
        value: guildName,
      },

      { name: "👤 User", value: username, inline: true },
      { name: "📤 From", value: fromChannelName, inline: true },
      { name: "📥 To", value: toChannelName, inline: true },
      {
        name: "⏰ Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({
    content: `🔍 ${username}`,
    embeds: [embed],
  });
}

// ตรวจสอบ Audit Log ว่า user ถูกเตะออกจาก Voice หรือไม่
// Discord ไม่ผูก target_id กับ MEMBER_DISCONNECT audit log entry (อาจเตะได้หลายคนพร้อมกัน)
// จึงใช้วิธีจับคู่ entry ล่าสุดที่เวลาใกล้เคียงกับ voiceStateUpdate แทน
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let auditLogPermissionWarned = false;

async function findVoiceKickAuditEntry(guild, leaveTimestamp) {
  if (!guild) return null;

  const KICK_MATCH_WINDOW_MS = 8000; // เวลาที่ยอมรับได้ระหว่าง leave event กับ audit log entry
  const RETRY_DELAYS_MS = [0, 1200]; // ลองทันที แล้วลองซ้ำอีกครั้งถ้า audit log ยังมาไม่ทัน (race condition)

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberDisconnect,
        limit: 5,
      });

      const entry = logs.entries.find(
        (e) => Math.abs(leaveTimestamp - e.createdTimestamp) <= KICK_MATCH_WINDOW_MS,
      );

      if (entry) return entry;
    } catch (error) {
      if (error.code === 50013) {
        // ❌ บอทไม่มีสิทธิ์ View Audit Log
        if (!auditLogPermissionWarned) {
          console.log("⚠️ Bot ไม่มีสิทธิ์ View Audit Log — ข้ามการตรวจจับ Voice Kick");
          auditLogPermissionWarned = true;
        }
        return null;
      }

      console.error("⚠️ Error fetching audit logs for voice kick:", error.message);
    }
  }

  return null; // ไม่พบ entry ที่ตรง = ถือว่าออกเอง
}

async function sendVoiceKickLog(oldState, kickEntry) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_VOICE_KICK_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Voice kick log channel not found");
    return;
  }

  const targetNickname = oldState.member?.displayName;
  const targetUsernameRaw = oldState.member?.user?.username;

  const targetName =
    targetNickname && targetNickname !== targetUsernameRaw
      ? `${targetNickname} (${targetUsernameRaw})`
      : targetUsernameRaw || "ไม่ทราบ";

  let executorName = "ไม่ทราบ";

  try {
    const executor = kickEntry.executor;

    if (executor) {
      const executorMember = await oldState.guild.members
        .fetch(executor.id)
        .catch(() => null);

      const execNickname = executorMember?.displayName;
      const execUsernameRaw = executor.username;

      executorName =
        execNickname && execNickname !== execUsernameRaw
          ? `${execNickname} (${execUsernameRaw})`
          : execUsernameRaw || "ไม่ทราบ";
    }
  } catch (error) {
    console.error("⚠️ Error resolving voice kick executor:", error.message);
  }

  const reason = kickEntry.reason || "ไม่ระบุ";
  const channelName = oldState.channel?.name || "Unknown";
  const guildName = oldState.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔊 Voice Kick")
    .setColor(0xf97316) // 🔥 ส้ม soft
    .setThumbnail(oldState.guild.iconURL())
    .addFields(
      {
        name: "🌐 Server",
        value: guildName,
      },

      { name: "👤 ผู้ถูกเตะ", value: targetName, inline: true },
      { name: "🛡️ ผู้ดำเนินการ", value: executorName, inline: true },
      { name: "📢 ห้อง", value: channelName, inline: true },
      { name: "📝 Reason", value: reason, inline: true },
      {
        name: "⏰ Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({
    content: `🔍 ${targetName}`,
    embeds: [embed],
  });
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



require("./events/Delete-log")(client, CONFIG);
require("./events/messageUpdate")(client, CONFIG);

startBot();
