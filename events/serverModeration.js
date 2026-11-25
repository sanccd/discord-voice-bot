const {
  EmbedBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { findMatchingAuditEntry } = require("../utils/auditLog");
const { nowTimestamp } = require("../utils/format");

// ระบบ Log Kick / Ban ออกจาก Server + ปุ่ม Unban
module.exports = (client, CONFIG) => {
  // สมาชิกออกจาก Server (อาจเป็นออกเอง หรือถูก Kick — ถูก Ban จะแยกไปที่ guildBanAdd)
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
        await sendServerKickLog(client, CONFIG, member, kickEntry);
      }
      // ไม่พบ MEMBER_KICK entry ที่ตรง = ออกเอง (หรือเป็น Ban ซึ่งจัดการแยกที่ guildBanAdd) → ไม่ส่ง log
    } catch (error) {
      console.error(
        "⚠️ Error handling guildMemberRemove for server kick:",
        error.message,
      );
    }
  });

  // สมาชิกถูก Ban ออกจาก Server
  client.on("guildBanAdd", async (ban) => {
    if (!CONFIG.LOG_BAN_SERVER_CHANNEL_ID) return;

    try {
      const banEntry = await findServerBanAuditEntry(ban.guild, ban.user?.id);

      console.log("🔨 SERVER BAN");
      await sendServerBanLog(client, CONFIG, ban, banEntry);
    } catch (error) {
      console.error("⚠️ Error handling guildBanAdd:", error.message);
    }
  });
};

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

async function sendServerKickLog(client, CONFIG, member, kickEntry) {
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
      { name: "🌐 Server", value: guildName },
      { name: "👤 User", value: targetTag, inline: true },
      { name: "🔨 Kicked By", value: executorTag, inline: true },
      { name: "📝 Reason", value: reason, inline: true },
      { name: "⏰ Time", value: nowTimestamp(), inline: true },
    )
    .setFooter({ text: "Voice Tracker" })
    .setTimestamp();

  try {
    await logChannel.send({ content: `🔍 ${targetTag}`, embeds: [embed] });
    console.log("SERVER KICK | SENT"); // 🐛 DEBUG (ชั่วคราว)
  } catch (error) {
    console.error("SERVER KICK | SEND ERROR:", error.message); // 🐛 DEBUG (ชั่วคราว)
  }
}

async function sendServerBanLog(client, CONFIG, ban, banEntry) {
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
      { name: "🌐 Server", value: guildName },
      { name: "👤 User", value: targetTag, inline: true },
      { name: "🔨 Banned By", value: executorTag, inline: true },
      { name: "📝 Reason", value: reason, inline: true },
      { name: "⏰ Time", value: nowTimestamp(), inline: true },
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
      .reply({
        content: "⏳ กำลังดำเนินการอยู่ กรุณารอสักครู่",
        ephemeral: true,
      })
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
        .reply({
          content: "❌ เกิดข้อผิดพลาดขณะตรวจสอบสถานะ Ban",
          ephemeral: true,
        })
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
        { name: "🌐 Server", value: guildName },
        { name: "👤 User", value: targetTag, inline: true },
        { name: "👤 Unbanned By", value: unbannedByTag, inline: true },
        { name: "📝 Previous Reason", value: previousReason, inline: true },
        { name: "⏰ Time", value: nowTimestamp(), inline: true },
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

module.exports.handleServerUnbanButton = handleServerUnbanButton;
