const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  SlashCommandBuilder,
} = require("discord.js");

const pokeCommand = new ContextMenuCommandBuilder()
  .setName("🔔 Poke")
  .setType(ApplicationCommandType.User);

const pokeManagementCommand = new SlashCommandBuilder()
  .setName("poke")
  .setDescription("จัดการ Poke Access List")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("allow")
      .setDescription("เพิ่ม User เข้า Poke Access List")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User ที่จะอนุญาต")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("revoke")
      .setDescription("ลบ User ออกจาก Poke Access List")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User ที่จะยกเลิกสิทธิ์")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("แสดง Poke Access List"),
  );

module.exports = {
  command: pokeCommand,
  managementCommand: pokeManagementCommand,
};
