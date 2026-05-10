const { EmbedBuilder } = require("discord.js");

module.exports = (client, CONFIG) => {
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
            name: "👤 User",
            value: message.author?.tag || "Unknown",
            inline: true,
          },
          {
            name: "🗑️ Deleted By",
            value: deletedBy,
            inline: true,
          },
          {
            name: "📢 Channel",
            value: `<#${message.channel.id}>`,
            inline: true,
          },
          {
            name: "📝 Content",
            value: content.slice(0, 1000),
          },
          {
            name: "🔗 Jump",
            value: `[คลิกดูข้อความ](${link})`,
          },
        )
        .setTimestamp();

      if (attachments) {
        embed.addFields({
          name: "📎 Attachments",
          value: attachments,
        });
      }

      await logChannel.send({
        content: `🔍 ${message.author?.tag || "Unknown"}`,
        embeds: [embed],
      });
    } catch (err) {
      console.error("Delete log error:", err);
    }
  });
};
