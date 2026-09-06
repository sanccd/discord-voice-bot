const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  isPokeOwner,
  isPokeAuthorized,
  addPokeUser,
  removePokeUser,
  getPokeUsers,
} = require("./pokePermissions");

const POKE_REPEAT_DELAY_MS = 1000;
const OWNER_COOLDOWN_MS = 1000;
const AUTHORIZED_COOLDOWN_MS = 5000;
const PENDING_POKE_TTL_MS = 5 * 60 * 1000;

const pokeCooldowns = new Map();
const pokeInFlight = new Set();
const pendingPokes = new Map();

function truncateEmbedField(value, maxLength = 1024) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function getPermission(interaction) {
  const isOwner = isPokeOwner(interaction.user.id);

  if (isOwner) {
    return { allowed: true, isOwner: true, cooldownMs: OWNER_COOLDOWN_MS };
  }

  if (isPokeAuthorized(interaction.user.id)) {
    return {
      allowed: true,
      isOwner: false,
      cooldownMs: AUTHORIZED_COOLDOWN_MS,
    };
  }

  return { allowed: false, isOwner: false, cooldownMs: 0 };
}

function permissionReply(interaction) {
  return interaction.reply({
    content: "❌ คุณไม่มีสิทธิ์ใช้ Poke",
    ephemeral: true,
  });
}

function buildCountButtons(targetId, isOwner) {
  const counts = isOwner ? [1, 5, 10] : [1];
  return new ActionRowBuilder().addComponents(
    counts.map((count) =>
      new ButtonBuilder()
        .setCustomId(`poke:send:${targetId}:${count}`)
        .setLabel(`Poke x${count}`)
        .setEmoji("🔔")
        .setStyle(ButtonStyle.Primary),
    ),
  );
}

async function showPokeModal(interaction) {
  const permission = getPermission(interaction);
  if (!permission.allowed) return permissionReply(interaction);

  const target = interaction.targetUser;
  if (!target) {
    return interaction.reply({
      content: "❌ ไม่พบ User เป้าหมาย",
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`poke:modal:${target.id}`)
    .setTitle(`🔔 Poke ${target.username}`.slice(0, 45));

  const messageInput = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("Message")
    .setPlaceholder("กรอกข้อความที่จะส่ง (เว้นว่างได้)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
  return interaction.showModal(modal);
}

async function handlePokeModal(interaction) {
  const permission = getPermission(interaction);
  if (!permission.allowed) return permissionReply(interaction);

  const [, , targetId] = interaction.customId.split(":");
  if (!/^\d{17,20}$/.test(targetId)) {
    return interaction.reply({
      content: "❌ Poke นี้ไม่ถูกต้อง",
      ephemeral: true,
    });
  }

  const message = interaction.fields.getTextInputValue("message").trim();
  pendingPokes.set(`${interaction.user.id}:${targetId}`, {
    message,
    createdAt: Date.now(),
  });

  return interaction.reply({
    content: `🔔 เลือกจำนวน Poke ให้ <@${targetId}>`,
    components: [buildCountButtons(targetId, permission.isOwner)],
    ephemeral: true,
  });
}

function getRemainingCooldown(userId, cooldownMs) {
  const lastPokeAt = pokeCooldowns.get(userId);
  if (!lastPokeAt) return 0;
  return Math.max(0, cooldownMs - (Date.now() - lastPokeAt));
}

async function handlePokeSend(interaction) {
  const permission = getPermission(interaction);
  if (!permission.allowed) return permissionReply(interaction);

  const [, , targetId, countText] = interaction.customId.split(":");
  const count = Number(countText);
  if (!/^\d{17,20}$/.test(targetId) || ![1, 5, 10].includes(count)) {
    return interaction.reply({
      content: "❌ Poke นี้ไม่ถูกต้อง",
      ephemeral: true,
    });
  }

  if (!permission.isOwner && count !== 1) {
    return interaction.reply({
      content: "❌ User ที่ได้รับอนุญาตใช้ได้เฉพาะ Poke x1",
      ephemeral: true,
    });
  }

  const pendingKey = `${interaction.user.id}:${targetId}`;
  const pending = pendingPokes.get(pendingKey);
  if (!pending || Date.now() - pending.createdAt > PENDING_POKE_TTL_MS) {
    pendingPokes.delete(pendingKey);
    return interaction.reply({
      content: "❌ Poke หมดอายุแล้ว กรุณาเปิด Poke ใหม่",
      ephemeral: true,
    });
  }

  const remainingCooldown = getRemainingCooldown(
    interaction.user.id,
    permission.cooldownMs,
  );
  if (remainingCooldown > 0) {
    return interaction.reply({
      content: `⏳ กรุณารอ ${Math.ceil(remainingCooldown / 1000)} วินาที`,
      ephemeral: true,
    });
  }

  if (pokeInFlight.has(interaction.user.id)) {
    return interaction.reply({
      content: "⏳ Poke กำลังทำงานอยู่ กรุณารอสักครู่",
      ephemeral: true,
    });
  }

  pokeInFlight.add(interaction.user.id);
  pokeCooldowns.set(interaction.user.id, Date.now());
  pendingPokes.delete(pendingKey);

  try {
    await interaction.deferReply({ ephemeral: true });
    const target = await interaction.client.users.fetch(targetId);
    const messageText = truncateEmbedField(pending.message || "ไม่มีข้อความ");

    for (let index = 0; index < count; index++) {
      const embed = new EmbedBuilder()
        .setTitle("🔔 Sentinel Poke")
        .setColor(0x5865f2)
        .addFields(
          {
            name: "👤 From",
            value: truncateEmbedField(interaction.user.username),
            inline: false,
          },
          {
            name: "💬 Message",
            value: messageText,
            inline: false,
          },
          {
            name: "🔔 Poke",
            value: `×${count}`,
            inline: true,
          },
        )
        .setFooter({ text: "Sentinel • Poke System" })
        .setTimestamp();

      await target.send({ embeds: [embed] });

      if (index < count - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, POKE_REPEAT_DELAY_MS),
        );
      }
    }

    return interaction.editReply(
      `✅ ส่ง Poke ให้ ${target.username} แล้ว ×${count}`,
    );
  } catch (error) {
    console.error("⚠️ Error sending Poke DM:", error.message);
    return interaction.editReply("❌ ไม่สามารถส่ง Poke ให้ User คนนี้ได้");
  } finally {
    pokeInFlight.delete(interaction.user.id);
  }
}

async function handlePokeInteraction(interaction) {
  if (interaction.isUserContextMenuCommand()) return showPokeModal(interaction);
  if (interaction.isModalSubmit()) return handlePokeModal(interaction);
  if (interaction.isButton()) return handlePokeSend(interaction);
}

async function handlePokeManagementCommand(interaction) {
  if (!isPokeOwner(interaction.user.id)) {
    return interaction.reply({
      content: "❌ เฉพาะ Poke Owner เท่านั้นที่จัดการ Access List ได้",
      ephemeral: true,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "allow" || subcommand === "revoke") {
    const user = interaction.options.getUser("user", true);
    const changed =
      subcommand === "allow" ? addPokeUser(user.id) : removePokeUser(user.id);

    if (!changed) {
      return interaction.reply({
        content:
          subcommand === "allow"
            ? `⚠️ ${user} ได้รับสิทธิ์อยู่แล้ว`
            : `⚠️ ${user} ไม่มีสิทธิ์อยู่ใน Access List`,
        ephemeral: true,
      });
    }

    return interaction.reply({
      content:
        subcommand === "allow"
          ? `✅ เพิ่ม ${user} เข้า Poke Access List แล้ว`
          : `✅ ลบ ${user} ออกจาก Poke Access List แล้ว`,
      ephemeral: true,
    });
  }

  const users = getPokeUsers();
  if (users.length === 0) {
    return interaction.reply({
      content: "📋 Poke Access List ว่าง",
      ephemeral: true,
    });
  }

  const header = `📋 Poke Access List (${users.length} คน)\n`;
  const lines = users.map(
    (userId, index) => `${index + 1}. <@${userId}> (${userId})`,
  );
  const chunks = [];
  let current = header;

  for (const line of lines) {
    if (current.length + line.length + 1 > 1900) {
      chunks.push(current);
      current = "";
    }
    current += `${line}\n`;
  }

  if (current) chunks.push(current);
  await interaction.reply({ content: chunks.shift(), ephemeral: true });
  for (const chunk of chunks) {
    await interaction.followUp({ content: chunk, ephemeral: true });
  }
}

module.exports = {
  handlePokeInteraction,
  handlePokeManagementCommand,
};
