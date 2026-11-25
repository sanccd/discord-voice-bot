const { EmbedBuilder } = require("discord.js");
const { saveJoinSession, saveLeaveSession } = require("../database");
const { findVoiceKickAuditEntry } = require("../services/voiceKickDetector");
const {
  formatDuration,
  formatMemberName,
  nowTimestamp,
} = require("../utils/format");

// ระบบ Log ห้อง Voice: เข้า / ออก / ย้ายห้อง / ถูกเตะ
module.exports = (client, CONFIG) => {
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

      await saveJoinSession(userId, guildId, Date.now());
      await sendJoinLog(client, CONFIG, newState);
    }

    // 🔴 ออก voice (อาจเป็นออกเอง หรือถูกเตะ)
    else if (oldState.channelId && !newState.channelId) {
      console.log("🔴 LEAVE");

      const durationSeconds = await saveLeaveSession(userId, Date.now());

      const kickEntry = CONFIG.LOG_VOICE_KICK_CHANNEL_ID
        ? await findVoiceKickAuditEntry(oldState.guild)
        : null;

      if (kickEntry) {
        console.log("🔊 VOICE KICK");
        await sendVoiceKickLog(client, CONFIG, oldState, kickEntry);
      } else if (durationSeconds) {
        await sendLeaveLog(client, CONFIG, oldState, durationSeconds);
      }
    }

    // 🔁 ย้ายห้อง
    else if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      console.log("🔁 MOVE");

      await saveLeaveSession(userId, Date.now());
      await saveJoinSession(userId, guildId, Date.now());
      await sendMoveLog(client, CONFIG, oldState, newState);
    }
  });
};

async function sendLeaveLog(client, CONFIG, state, durationSeconds) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Log channel not found");
    return;
  }

  const username = formatMemberName(state.member);
  const channelName = state.channel?.name || "Unknown";
  const guildName = state.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔴 Voice Channel Leave")
    .setColor(0xef4444) // 🔥 แดง soft
    .setThumbnail(state.guild.iconURL()) // 🔥 รูป server
    .addFields(
      { name: "🌐 Server", value: guildName },
      { name: "👤 User", value: username, inline: true },
      { name: "📢 Channel", value: channelName, inline: true },
      {
        name: "⏱ Duration",
        value: formatDuration(durationSeconds),
        inline: true,
      },
      {
        name: "⏰ Left At",
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({ content: `🔍 ${username}`, embeds: [embed] });
}

async function sendJoinLog(client, CONFIG, state) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_JOIN_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Join log channel not found");
    return;
  }

  const username = formatMemberName(state.member);
  const channelName = state.channel?.name || "Unknown";
  const guildName = state.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🟢 Voice Channel Join")
    .setColor(0x22c55e) // 🔥 เขียว soft ดูแพง
    .setThumbnail(state.guild.iconURL()) // 🔥 รูป server
    .addFields(
      { name: "🌐 Server", value: guildName },
      { name: "👤 User", value: username, inline: true },
      { name: "📢 Channel", value: channelName, inline: true },
      { name: "⏰ Time", value: nowTimestamp(), inline: true },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({ content: `🔍 ${username}`, embeds: [embed] });
}

async function sendMoveLog(client, CONFIG, oldState, newState) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_MOVE_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Move log channel not found");
    return;
  }

  const username = formatMemberName(newState.member);
  const fromChannelName = oldState.channel?.name || "Unknown";
  const toChannelName = newState.channel?.name || "Unknown";
  const guildName = newState.guild?.name || "Unknown Server";

  const embed = new EmbedBuilder()
    .setTitle("🔄 Voice Channel Move")
    .setColor(0xfacc15) // 🔥 เหลือง soft
    .setThumbnail(newState.guild.iconURL())
    .addFields(
      { name: "🌐 Server", value: guildName },
      { name: "👤 User", value: username, inline: true },
      { name: "📤 From", value: fromChannelName, inline: true },
      { name: "📥 To", value: toChannelName, inline: true },
      { name: "⏰ Time", value: nowTimestamp(), inline: true },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({ content: `🔍 ${username}`, embeds: [embed] });
}

async function sendVoiceKickLog(client, CONFIG, oldState, kickEntry) {
  const logChannel = await client.channels
    .fetch(CONFIG.LOG_VOICE_KICK_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) {
    console.log("⚠️ Voice kick log channel not found");
    return;
  }

  const targetName = formatMemberName(oldState.member, "ไม่ทราบ");

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
      { name: "🌐 Server", value: guildName },
      { name: "👤 ผู้ถูกเตะ", value: targetName, inline: true },
      { name: "🛡️ ผู้ดำเนินการ", value: executorName, inline: true },
      { name: "📢 ห้อง", value: channelName, inline: true },
      { name: "📝 Reason", value: reason, inline: true },
      { name: "⏰ Time", value: nowTimestamp(), inline: true },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  await logChannel.send({ content: `🔍 ${targetName}`, embeds: [embed] });
}
