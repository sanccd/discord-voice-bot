const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getStatus } = require("../utils/format");

// /userinfo — ดูข้อมูล user
const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("ดูข้อมูล user");

async function execute(interaction) {
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

module.exports = { data, execute };
