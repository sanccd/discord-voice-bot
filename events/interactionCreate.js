const statsCommand = require("../commands/stats");
const userinfoCommand = require("../commands/userinfo");
const {
  handlePokeInteraction,
  handlePokeSlashCommand,
  handlePokeManagementCommand,
} = require("../services/pokeService");
const { handleServerUnbanButton } = require("./serverModeration");

// slash command ทั่วไป: ชื่อ -> handler
const slashCommands = {
  [statsCommand.data.name]: statsCommand.execute,
  [userinfoCommand.data.name]: userinfoCommand.execute,
};

// ตัวกระจาย interaction ไปยังระบบที่รับผิดชอบ
module.exports = (client) => {
  client.on("interactionCreate", async (interaction) => {
    // 🔔 Poke: เมนูคลิกขวา / ฟอร์ม / ปุ่ม
    if (
      interaction.isUserContextMenuCommand() &&
      interaction.commandName === "🔔 Poke"
    ) {
      return handlePokeInteraction(interaction);
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("poke:modal:")
    ) {
      return handlePokeInteraction(interaction);
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("poke:send:")
    ) {
      return handlePokeInteraction(interaction);
    }

    // 🔓 ปุ่ม Unban ใน Ban log
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("server_unban:")
    ) {
      return handleServerUnbanButton(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "poke") {
      if (interaction.options.getSubcommand() === "send") {
        return handlePokeSlashCommand(interaction);
      }
      return handlePokeManagementCommand(interaction);
    }

    const handler = slashCommands[interaction.commandName];
    if (handler) return handler(interaction);
  });
};
