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
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
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

//

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

// กำหนดค่า config
const CONFIG = {
  TOKEN: process.env.TOKEN,
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
  LOG_JOIN_CHANNEL_ID: process.env.LOG_JOIN_CHANNEL_ID,
  LOG_DELETE_CHANNEL_ID: process.env.LOG_DELETE_CHANNEL_ID,
  LOG_EDIT_CHANNEL_ID: process.env.LOG_EDIT_CHANNEL_ID,
  LOG_MOVE_CHANNEL_ID: process.env.LOG_MOVE_CHANNEL_ID,
  LOG_VOICE_KICK_CHANNEL_ID: process.env.LOG_VOICE_KICK_CHANNEL_ID,
  LOG_KICK_SERVER_CHANNEL_ID: process.env.LOG_KICK_SERVER_CHANNEL_ID,
  LOG_BAN_SERVER_CHANNEL_ID: process.env.LOG_BAN_SERVER_CHANNEL_ID,
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

  // 🐛 DEBUG (ชั่วคราว)
  console.log("SERVER KICK DEBUG | Guilds connected:");
  guilds.forEach((guild) => {
    console.log(`- ${guild.name} (${guild.id})`);
  });

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

  // 🔊 ตั้ง baseline ของ MEMBER_DISCONNECT audit log ก่อนเริ่มตรวจจับ Voice Kick
  guilds.forEach((guild) => {
    initVoiceKickBaseline(guild);
  });

    // 🔥 PUBG Tracker
  setInterval(() => {
    testPUBG(client);
  }, 60000);

  testPUBG(client);
});

// Event: จัดการ Slash Commands
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith("server_unban:")) {
    return handleServerUnbanButton(interaction);
  }

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
      ? await findVoiceKickAuditEntry(oldState.guild)
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

// Event: สมาชิกออกจาก Server (อาจเป็นออกเอง หรือถูก Kick — ถูก Ban จะแยกไปที่ guildBanAdd)
client.on("guildMemberRemove", async (member) => {
  // 🐛 DEBUG (ชั่วคราว)
  console.log("SERVER MEMBER REMOVE EVENT", member.id, member.user?.username);

  if (!CONFIG.LOG_KICK_SERVER_CHANNEL_ID) return;

  try {
    const kickEntry = await findServerKickAuditEntry(member);

    // 🐛 DEBUG (ชั่วคราว)
    console.log("SERVER KICK | kickEntry =", kickEntry ? kickEntry.id : null);

    if (kickEntry) {
      console.log("SERVER KICK | MATCHED"); // 🐛 DEBUG (ชั่วคราว)
      console.log("🔨 SERVER KICK");
      await sendServerKickLog(member, kickEntry);
    }
    // ไม่พบ MEMBER_KICK entry ที่ตรง = ออกเอง (หรือเป็น Ban ซึ่งจัดการแยกที่ guildBanAdd) → ไม่ส่ง log
  } catch (error) {
    console.error("⚠️ Error handling guildMemberRemove for server kick:", error.message);
  }
});

// Event: สมาชิกถูก Ban ออกจาก Server
client.on("guildBanAdd", async (ban) => {
  if (!CONFIG.LOG_BAN_SERVER_CHANNEL_ID) return;

  try {
    const banEntry = await findServerBanAuditEntry(ban.guild, ban.user?.id);

    console.log("🔨 SERVER BAN");
    await sendServerBanLog(ban, banEntry);
  } catch (error) {
    console.error("⚠️ Error handling guildBanAdd:", error.message);
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

// ตรวจสอบว่า user ถูกเตะออกจาก Voice หรือไม่ โดยติดตามการเปลี่ยนแปลงของ
// extra.count บน MEMBER_DISCONNECT audit log entry ล่าสุด (ไม่ใช้ createdTimestamp
// เพราะ Discord "stack" การ disconnect ซ้ำของ executor เดิมเข้า entry เดียวกัน
// โดยไม่ refresh เวลา — ยืนยันจากการทดสอบจริงและ discord-api-docs#2280)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let auditLogPermissionWarned = false;

// guildId -> { entryId: string|null, count: number }
const voiceDisconnectBaseline = new Map();

// guildId -> Promise ล่าสุดในคิว กันหลาย leave event ในกิลด์เดียวกันแย่งกันอ่าน/เขียน baseline พร้อมกัน
const voiceKickCheckQueue = new Map();

async function fetchLatestDisconnectEntry(guild) {
  const logs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberDisconnect,
    limit: 1,
  });

  return logs.entries.first() ?? null;
}

// เรียกตอน bot พร้อมใช้งาน เพื่อจำ count ปัจจุบันไว้เป็น baseline
// กัน count ที่มีอยู่ก่อน bot start ถูกตีความว่าเป็น kick ใหม่
async function initVoiceKickBaseline(guild) {
  if (!CONFIG.LOG_VOICE_KICK_CHANNEL_ID) return;

  try {
    const entry = await fetchLatestDisconnectEntry(guild);

    voiceDisconnectBaseline.set(guild.id, {
      entryId: entry?.id ?? null,
      count: entry ? Number(entry.extra?.count ?? 1) : 0,
    });
  } catch (error) {
    if (error.code === 50013) {
      if (!auditLogPermissionWarned) {
        console.log("⚠️ Bot ไม่มีสิทธิ์ View Audit Log — ข้ามการตรวจจับ Voice Kick");
        auditLogPermissionWarned = true;
      }
    } else {
      console.error("⚠️ Error initializing voice kick baseline:", error.message);
    }
  }
}

// เทียบ count ล่าสุดกับ baseline คืน audit log entry (มี .executor / .reason) ถ้ามั่นใจว่าเป็น kick, ไม่งั้นคืน null
async function checkVoiceKickDelta(guild) {
  // ยังไม่มี baseline (เช่น bot เพิ่ง start ยัง init ไม่เสร็จ หรือไม่มีสิทธิ์อ่าน) → conservative ไม่ถือเป็น kick
  if (!voiceDisconnectBaseline.has(guild.id)) return null;

  const RETRY_DELAYS_MS = [0, 1200]; // เผื่อ audit log เขียนไม่ทัน voiceStateUpdate

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);

    let entry;

    try {
      entry = await fetchLatestDisconnectEntry(guild);
    } catch (error) {
      console.error("⚠️ Error fetching audit logs for voice kick:", error.message);
      continue;
    }

    if (!entry) return null; // ไม่เคยมี MEMBER_DISCONNECT ใน guild นี้เลย

    const baseline = voiceDisconnectBaseline.get(guild.id);
    const currentCount = Number(entry.extra?.count ?? 1);

    // entry id เปลี่ยน = entry ใหม่ทั้งอัน ไม่เอาของเก่ามาลบเทียบ ถือว่า count ทั้งหมดคือของใหม่
    const delta = entry.id !== baseline.entryId ? currentCount : currentCount - baseline.count;

    // อัปเดต baseline ทุกครั้งที่เห็นการเปลี่ยนแปลง กันนับซ้ำในรอบถัดไป
    voiceDisconnectBaseline.set(guild.id, { entryId: entry.id, count: currentCount });

    if (delta === 1) {
      return entry; // มี disconnect ใหม่เกิดขึ้นพอดี 1 ครั้ง ตรงกับ leave event ที่เพิ่งเกิด
    }

    if (delta > 1) {
      console.log(
        `⚠️ Voice kick ambiguous: entry ${entry.id} count เพิ่มขึ้น ${delta} พร้อมกัน — ไม่สามารถระบุ target ได้แน่นอน, fallback เป็น leave`,
      );
      return null;
    }

    // delta <= 0 → ยังไม่เห็นการเปลี่ยนแปลง ลอง retry รอบถัดไป
  }

  return null; // ไม่พบการเปลี่ยนแปลง = ถือว่าออกเอง
}

// serialize การเช็คต่อ guild ผ่านคิว กันสอง leave event พร้อมกันแย่งอ่าน/เขียน baseline
function findVoiceKickAuditEntry(guild) {
  if (!guild) return Promise.resolve(null);

  const guildId = guild.id;
  const prevInQueue = voiceKickCheckQueue.get(guildId) ?? Promise.resolve(null);

  const run = prevInQueue.catch(() => null).then(() => checkVoiceKickDelta(guild));

  voiceKickCheckQueue.set(guildId, run.catch(() => null));

  return run;
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

// หา Audit Log entry ของ action type ที่ target ตรงกับ userId และเกิดขึ้นเมื่อไม่นานมานี้
// (MEMBER_KICK / MEMBER_BAN_ADD มี target_id ที่เชื่อถือได้ ต่างจาก MEMBER_DISCONNECT/MOVE)
// retryDelaysMs default เดิม [0, 1200] ใช้กับ Kick อยู่ (ห้ามแตะ) — Ban ส่ง schedule ของตัวเองแยกมา
async function findMatchingAuditEntry(
  guild,
  actionType,
  targetId,
  windowMs = 8000,
  retryDelaysMs = [0, 1200],
) {
  if (!guild || !targetId) return null;

  for (const delay of retryDelaysMs) {
    if (delay) await sleep(delay);

    try {
      const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });

      const entry = logs.entries.find(
        (e) => e.target?.id === targetId && Date.now() - e.createdTimestamp <= windowMs,
      );

      if (entry) return entry;
    } catch (error) {
      if (error.code === 50013) {
        if (!auditLogPermissionWarned) {
          console.log("⚠️ Bot ไม่มีสิทธิ์ View Audit Log — ข้ามการตรวจจับ Kick/Ban");
          auditLogPermissionWarned = true;
        }
        return null;
      }

      console.error("⚠️ Error fetching audit logs:", error.message);
    }
  }

  return null;
}

function findServerKickAuditEntry(member) {
  // window 30 วิ (มากกว่าค่า default 8 วิ) เพราะพบจริงว่า audit log ของ MEMBER_KICK
  // อาจล่าช้ากว่า guildMemberRemove event ได้ถึง ~17 วิ
  return findMatchingAuditEntry(
    member.guild,
    AuditLogEvent.MemberKick,
    member.id,
    30000,
  );
}

function findServerBanAuditEntry(guild, userId) {
  // window 30 วิ + retry ที่เวลารวมนับจาก event ประมาณ 0 / 1.2s / 3s / 5s
  // เพราะพบว่า audit log ของ MEMBER_BAN_ADD อาจมาช้ากว่า guildBanAdd event ได้
  return findMatchingAuditEntry(
    guild,
    AuditLogEvent.MemberBanAdd,
    userId,
    30000,
    [0, 1200, 1800, 2000],
  );
}

async function sendServerKickLog(member, kickEntry) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_KICK_SERVER_CHANNEL_ID)
    .catch((error) => {
      console.error("SERVER KICK DEBUG | channel fetch error:", error.message);
      return null;
    });

  // 🐛 DEBUG (ชั่วคราว)
  console.log(
    "SERVER KICK | CHANNEL =",
    logChannel ? { id: logChannel.id, name: logChannel.name } : null,
  );

  if (!logChannel) {
    console.log("⚠️ Server kick log channel not found");
    return;
  }

  const targetTag = member.user?.tag || member.user?.username || "ไม่ทราบ";
  const executorTag =
    kickEntry.executor?.tag || kickEntry.executor?.username || "ไม่ทราบ";
  const reason = kickEntry.reason || "ไม่ระบุ";
  const guildName = member.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔨 Server Kick")
    .setColor(0xef4444)
    .setThumbnail(member.guild?.iconURL())
    .addFields(
      {
        name: "🌐 Server",
        value: guildName,
      },

      { name: "👤 User", value: targetTag, inline: true },
      { name: "🔨 Kicked By", value: executorTag, inline: true },
      { name: "📝 Reason", value: reason, inline: true },
      {
        name: "⏰ Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  try {
    await logChannel.send({
      content: `🔍 ${targetTag}`,
      embeds: [embed],
    });
    console.log("SERVER KICK | SENT"); // 🐛 DEBUG (ชั่วคราว)
  } catch (error) {
    console.error("SERVER KICK | SEND ERROR:", error.message); // 🐛 DEBUG (ชั่วคราว)
  }
}

async function sendServerBanLog(ban, banEntry) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_BAN_SERVER_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Server ban log channel not found");
    return;
  }

  const targetTag = ban.user?.tag || ban.user?.username || "ไม่ทราบ";
  const executorTag =
    banEntry?.executor?.tag || banEntry?.executor?.username || "ไม่ทราบ";
  const reason = banEntry?.reason || ban.reason || "ไม่ระบุ";
  const guildName = ban.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔨 Server Ban")
    .setColor(0x991b1b)
    .setThumbnail(ban.guild?.iconURL())
    .addFields(
      {
        name: "🌐 Server",
        value: guildName,
      },

      { name: "👤 User", value: targetTag, inline: true },
      { name: "🔨 Banned By", value: executorTag, inline: true },
      { name: "📝 Reason", value: reason, inline: true },
      {
        name: "⏰ Time",
        value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  const unbanButton = new ButtonBuilder()
    .setCustomId(`server_unban:${ban.guild.id}:${ban.user.id}`)
    .setLabel("Unban")
    .setEmoji("🔓")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(unbanButton);

  await logChannel.send({
    content: `🔍 ${targetTag}`,
    embeds: [embed],
    components: [row],
  });
}

// กันกดปุ่ม Unban ซ้ำพร้อมกัน (double-click race) ต่อ guildId:userId เดียวกัน
const unbanInFlight = new Set();

async function handleServerUnbanButton(interaction) {
  const [, guildId, userId] = interaction.customId.split(":");

  // #9 ห้ามเชื่อ customId เฉยๆ ต้องตรวจ guild ให้ตรงกับที่ interaction เกิดขึ้นจริง + userId ต้องเป็น snowflake ที่ถูกต้อง
  if (interaction.guildId !== guildId || !/^\d{17,20}$/.test(userId)) {
    return interaction
      .reply({ content: "❌ ปุ่มนี้ไม่ถูกต้อง", ephemeral: true })
      .catch(() => {});
  }

  // #8 ตรวจ permission ของคนกดทุกครั้ง ห้ามเชื่อแค่ customId
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    return interaction
      .reply({ content: "❌ คุณไม่มีสิทธิ์ Unban สมาชิก", ephemeral: true })
      .catch(() => {});
  }

  const guild = interaction.guild;

  if (!guild) {
    return interaction
      .reply({ content: "❌ ไม่พบ Server", ephemeral: true })
      .catch(() => {});
  }

  if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return interaction
      .reply({ content: "❌ Bot ไม่มีสิทธิ์ Unban สมาชิก", ephemeral: true })
      .catch(() => {});
  }

  const lockKey = `${guildId}:${userId}`;

  if (unbanInFlight.has(lockKey)) {
    return interaction
      .reply({ content: "⏳ กำลังดำเนินการอยู่ กรุณารอสักครู่", ephemeral: true })
      .catch(() => {});
  }
  unbanInFlight.add(lockKey);

  try {
    let existingBan;

    try {
      existingBan = await guild.bans.fetch(userId);
    } catch (error) {
      if (error.code === 10026) {
        // Unknown Ban
        return interaction
          .reply({
            content: "⚠️ User is already unbanned or ban not found.",
            ephemeral: true,
          })
          .catch(() => {});
      }

      console.error("⚠️ Error fetching ban before unban:", error.message);
      return interaction
        .reply({ content: "❌ เกิดข้อผิดพลาดขณะตรวจสอบสถานะ Ban", ephemeral: true })
        .catch(() => {});
    }

    // อ่านข้อมูลเดิม (User / Reason / Server) จาก embed ของ message นี้เอง ไม่ต้องพึ่ง database
    const originalEmbed = interaction.message.embeds[0];
    const targetTag =
      originalEmbed?.fields?.find((f) => f.name.includes("User"))?.value ||
      existingBan.user?.tag ||
      "ไม่ทราบ";
    const previousReason =
      originalEmbed?.fields?.find((f) => f.name.includes("Reason"))?.value ||
      existingBan.reason ||
      "ไม่ระบุ";
    const guildName =
      originalEmbed?.fields?.find((f) => f.name.includes("Server"))?.value ||
      guild.name;

    try {
      await guild.members.unban(
        userId,
        `Unbanned by ${interaction.user.tag} via bot button`,
      );
    } catch (error) {
      console.error("⚠️ Error unbanning member:", error.message);
      return interaction
        .reply({ content: "❌ เกิดข้อผิดพลาดขณะ Unban", ephemeral: true })
        .catch(() => {});
    }

    const executorNickname = interaction.member?.displayName;
    const unbannedByTag =
      executorNickname && executorNickname !== interaction.user.username
        ? `${executorNickname} (${interaction.user.username})`
        : interaction.user.tag;

    const unbanEmbed = new EmbedBuilder()
      .setTitle("✅ Server Unban")
      .setColor(0x22c55e)
      .setThumbnail(guild.iconURL())
      .addFields(
        {
          name: "🌐 Server",
          value: guildName,
        },

        { name: "👤 User", value: targetTag, inline: true },
        { name: "👤 Unbanned By", value: unbannedByTag, inline: true },
        { name: "📝 Previous Reason", value: previousReason, inline: true },
        {
          name: "⏰ Time",
          value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
          inline: true,
        },
      )
      .setFooter({ text: "Voice Tracker" })
      .setTimestamp();

    const unbannedButton = new ButtonBuilder()
      .setCustomId(`server_unban:${guildId}:${userId}:done`)
      .setLabel("Unbanned")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);

    const doneRow = new ActionRowBuilder().addComponents(unbannedButton);

    try {
      await interaction.update({ embeds: [unbanEmbed], components: [doneRow] });
    } catch (error) {
      // Unban สำเร็จไปแล้ว แค่ตอบ interaction ไม่ได้ (เช่น token หมดอายุ) ไม่ต้อง throw ต่อ
      console.error("⚠️ Error updating message after unban:", error.message);
    }
  } finally {
    unbanInFlight.delete(lockKey);
  }
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
