const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

// /stats — ดูข้อมูล server
const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("ดูข้อมูล server");

async function execute(interaction) {
  const guild = interaction.guild;

  await guild.members.fetch();

  const totalMembers = guild.memberCount;
  const voiceUsers = guild.members.cache.filter((m) => m.voice.channel).size;

  const embed = new EmbedBuilder()
    .setTitle("📊 Server Stats")
    .setThumbnail(guild.iconURL())
    .setColor(0x5865f2)
    .addFields(
      { name: "👥 Members", value: `${totalMembers}`, inline: true },
      { name: "🎧 In Voice", value: `${voiceUsers}`, inline: true },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute };
