const statsCommand = require("../commands/stats");
const userinfoCommand = require("../commands/userinfo");
const {
  command: pokeCommand,
  managementCommand: pokeManagementCommand,
} = require("../commands/poke");
const { initVoiceKickBaseline } = require("../services/voiceKickDetector");
const testPUBG = require("../services/pubgTracker");

// คำสั่งทั้งหมดของบอท — เพิ่มคำสั่งใหม่ที่นี่
const ALL_COMMANDS = [
  statsCommand.data,
  userinfoCommand.data,
  pokeCommand,
  pokeManagementCommand,
];

module.exports = (client) => {
  client.once("clientReady", async () => {
    console.log("✅ Bot is online");

    const guilds = client.guilds.cache;

    console.log("Guilds connected:");
    guilds.forEach((guild) => {
      console.log(`- ${guild.name} (${guild.id})`);
    });

    // ลงทะเบียนคำสั่งแบบแทนที่ทั้งชุด: คำสั่งที่ไม่อยู่ในรายการ (เช่น dice, leaderboard เดิม) จะถูกลบออกจาก Discord ด้วย
    const commandData = ALL_COMMANDS.map((command) => command.toJSON());

    guilds.forEach(async (guild) => {
      try {
        await guild.commands.set(commandData);
        console.log(`✅ Commands registered in ${guild.name}`);
      } catch (error) {
        console.error(
          `❌ Failed to register commands in ${guild.name}:`,
          error.message,
        );
      }
    });

    // 🔊 ตั้ง baseline ของ MEMBER_DISCONNECT audit log ก่อนเริ่มตรวจจับ Voice Kick
    guilds.forEach((guild) => {
      initVoiceKickBaseline(guild);
    });

    // 🔥 PUBG Tracker
    setInterval(() => {
      testPUBG(client);
    }, 60000);

    testPUBG(client);
  });
};
