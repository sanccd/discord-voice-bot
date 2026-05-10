const { EmbedBuilder } = require("discord.js");

module.exports = (client, CONFIG) => {
  client.on("messageUpdate", async (oldMessage, newMessage) => {
    try {
      // ❌ กัน bot
      if (oldMessage.author?.bot) return;

      // ❌ กัน DM
      if (!oldMessage.guild) return;

      // ❌ ข้อความเหมือนเดิม
      if (oldMessage.content === newMessage.content) return;

      // ❌ กันข้อความว่าง
      if (!oldMessage.content || !newMessage.content) return;

      // 📢 หา log channel
      const logChannel = await client.channels
        .fetch(CONFIG.LOG_EDIT_CHANNEL_ID)
        .catch(() => null);

      if (!logChannel) {
        console.log("⚠️ Edit log channel not found");
        return;
      }

      // 🔗 jump link
      const link = `https://discord.com/channels/${oldMessage.guild.id}/${oldMessage.channel.id}/${oldMessage.id}`;

      // 🎨 embed
      const embed = new EmbedBuilder()
        .setTitle("✏️ Message Edited")
        .setColor(0xffcc00)
        .setThumbnail(oldMessage.author.displayAvatarURL())
        .addFields(
          {
            name: "👤 User",
            value: oldMessage.author.tag,
            inline: true,
          },
          {
            name: "📢 Channel",
            value: `<#${oldMessage.channel.id}>`,
            inline: true,
          },

          {
            name: "📨 Sent At",
            value: `<t:${Math.floor(oldMessage.createdTimestamp / 1000)}:F>`,
            inline: true,
          },
          {
            name: "✏️ Edited At",
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: true,
          },

          {
            name: "⏱️ Edited",
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true,
          },

          {
            name: "📝 Before",
            value: oldMessage.content.slice(0, 1000),
          },
          {
            name: "📝 After",
            value: newMessage.content.slice(0, 1000),
          },
          {
            name: "🔗 Jump",
            value: `[คลิกดูข้อความ](${link})`,
          },
        )
        .setFooter({
          text: `User ID: ${oldMessage.author.id}`,
        })
        .setTimestamp();

      await logChannel.send({
        content: `🔍 ${oldMessage.author.tag}`,
        embeds: [embed],
      });
    } catch (err) {
      console.log("❌ messageUpdate error:", err);
    }
  });
};
