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
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("send")
      .setDescription("ส่ง Poke ให้ User โดยตรง")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User ที่จะได้รับ Poke")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("ข้อความที่จะส่ง")
          .setRequired(true)
          .setMaxLength(1000),
      )
      .addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("จำนวนครั้งที่ส่ง")
          .setRequired(true)
          .addChoices(
            { name: "x1", value: 1 },
            { name: "x5", value: 5 },
            { name: "x10", value: 10 },
          ),
      ),
  );

module.exports = {
  command: pokeCommand,
  managementCommand: pokeManagementCommand,
};
