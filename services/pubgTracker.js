require("dotenv").config();

const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

const API_KEY = process.env.PUBG_API_KEY;
const PLAYER_NAME = process.env.PUBG_PLAYER_NAME;
const CHANNEL_ID = process.env.PUBG_LOG_CHANNEL_ID;

const mapNames = {
  Baltic_Main: "Erangel",
  Desert_Main: "Miramar",
  Savage_Main: "Sanhok",
  DihorOtok_Main: "Vikendi",
  Summerland_Main: "Karakin",
  Chimera_Main: "Paramo",
  Tiger_Main: "Taego",
  Kiki_Main: "Deston",
  Neon_Main: "Rondo",
};

const mapImages = {
  Erangel:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970783759208529/Erangelpubg.png?ex=6a01a61e&is=6a00549e&hm=2823e9e82754a192afeb680245517403a498962bf86ca1757c16c35589f329af&=&format=webp&quality=lossless&width=1521&height=856",

  Miramar:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970783188914326/Miramarpubg.png?ex=6a01a61e&is=6a00549e&hm=d6701672deb563845eb1d4cc6e63a294c65207896320fa0d5760c56db2879b4a&=&format=webp&quality=lossless&width=1521&height=856",

  Sanhok:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970782391734282/Sanhokpubg.png?ex=6a01a61e&is=6a00549e&hm=20bd67e2df330d286faaf6dadb874ab11a97c0e70f7eaf9410d6acec0c5e47ec&=&format=webp&quality=lossless&width=1521&height=856",

  Vikendi:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970781892874381/Vikendipubg.png?ex=6a01a61e&is=6a00549e&hm=9c88c0942b5e3a9165142875285cb107d71826ab5a4468fa1accffb8929d2928&=&format=webp&quality=lossless&width=1521&height=856",

  Karakin:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970781431365632/Karakinpubg.png?ex=6a01a61e&is=6a00549e&hm=045d18b08dc44eb48c6e4577bc7933f8e7a1f7d8e9c6cbe6b532b0ec29fd5c5a&=&format=webp&quality=lossless&width=1521&height=856",

  Paramo:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970780978385076/Paramopubg.png?ex=6a01a61e&is=6a00549e&hm=0c8753d5119572a37a3575125061a6a3ea80d3aa03116555b041f4e9b2123f03&=&format=webp&quality=lossless&width=1521&height=856",

  Taego:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970780449898506/Taegopubg.png?ex=6a01a61d&is=6a00549d&hm=9cc183c01aacf939e28a23b273cc4e48bc44e4213c7e2173efd17a4f0e593f40&=&format=webp&quality=lossless&width=1521&height=856",

  Deston:
    "https://cdn.discordapp.com/attachments/1502958353716875305/1502971878334267562/Deston.png?ex=6a01a723&is=6a0055a3&hm=e43abb88a32f7f2466d70b50a4ed6d1694f9b9b5a21f1564bfc5287df039763a&",

  Rondo:
    "https://media.discordapp.net/attachments/1502958353716875305/1502970779866763395/Rondopubg.png?ex=6a01a61d&is=6a00549d&hm=c6e38352a9fa80f6e07378cd6b3aee4e030ae5cfc173c8fad9dd04ff9c7e8749&=&format=webp&quality=lossless&width=1521&height=856",
};

let lastMatchId = null;

async function testPUBG(client) {
  try {
    // 🔍 ดึงข้อมูล player
    const response = await axios.get(
      `https://api.pubg.com/shards/steam/players?filter[playerNames]=${PLAYER_NAME}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/vnd.api+json",
        },
      },
    );

    const player = response.data.data[0];

    console.log("✅ PUBG Connected");
    console.log("👤 Player:", player.attributes.name);
    console.log("🆔 Player ID:", player.id);

    // 🎮 แมตช์ล่าสุด
    const latestMatch = player.relationships.matches.data[0];

    console.log("🎮 Latest Match ID:", latestMatch.id);
    if (lastMatchId === latestMatch.id) {
      console.log("⚠️ Match already sent");
      return;
    }

    // 📦 ดึงรายละเอียด match
    const matchResponse = await axios.get(
      `https://api.pubg.com/shards/steam/matches/${latestMatch.id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/vnd.api+json",
        },
      },
    );

    const matchData = matchResponse.data.data.attributes;
    const matchDate = new Date(matchData.createdAt);

    const thaiDate = matchDate.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const thaiTime = matchDate.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });

    console.log("\n========== MATCH INFO ==========");
    const mapName = mapNames[matchData.mapName] || matchData.mapName;
    console.log("🗺️ Map:", mapName);

    console.log("🎮 Mode:", matchData.gameMode);
    console.log(`📅 ${thaiDate} • 🕒 ${thaiTime}`);
    console.log("================================");

    const included = matchResponse.data.included;

    // 👤 หา participant ของเรา
    const me = included.find(
      (item) =>
        item.type === "participant" &&
        item.attributes.stats.name.toLowerCase() === PLAYER_NAME.toLowerCase(),
    );

    if (!me) {
      console.log("❌ Player stats not found");
      return;
    }

    const stats = me.attributes.stats;
    if (stats.winPlace > 3) {
      console.log("❌ Not Top 3");
      return;
    }

    console.log("\n========== YOUR STATS ==========");
    console.log("🏅 Rank:", stats.winPlace);
    console.log("🎯 Kills:", stats.kills);
    console.log("🤝 Assists:", stats.assists);
    console.log("💥 Damage:", Math.round(stats.damageDealt));
    console.log("⏱ Survival:", Math.floor(stats.timeSurvived / 60), "minutes");
    console.log("================================");

    // 👥 หา roster/team ของเรา
    const roster = included.find(
      (item) =>
        item.type === "roster" &&
        item.relationships.participants.data.some((p) => p.id === me.id),
    );

    if (!roster) {
      console.log("❌ Team not found");
      return;
    }

    // 👥 สมาชิกในทีม
    const teamPlayers = roster.relationships.participants.data.map((p) => {
      return included.find(
        (item) => item.type === "participant" && item.id === p.id,
      );
    });

    console.log("\n========== TEAM ==========");

    teamPlayers.forEach((player) => {
      const s = player.attributes.stats;

      console.log(
        `👤 ${s.name} | 🎯 ${s.kills} K | 🤝 ${s.assists} A | 💥 ${Math.round(
          s.damageDealt,
        )} DMG`,
      );
    });

    console.log("================================");

    console.log("\n========== MODE INFO ==========");

    const mode = matchData.gameMode;
    const teamSize = teamPlayers.length;

    if (mode.includes("duo") && teamSize === 1) {
      console.log("🎮 Solo Duo");
    } else if (mode.includes("squad") && teamSize === 1) {
      console.log("🎮 Solo Squad");
    } else {
      console.log(`🎮 Team Size: ${teamSize}`);
    }

    console.log("================================");

    console.log("\n========== MVP ==========");

    // 🔥 หา damage สูงสุดในทีม
    const mvp = teamPlayers.reduce((best, current) => {
      const currentDamage = current.attributes.stats.damageDealt;
      const bestDamage = best.attributes.stats.damageDealt;

      return currentDamage > bestDamage ? current : best;
    });

    const mvpStats = mvp.attributes.stats;

    console.log(
      `🔥 MVP: ${mvpStats.name} | 💥 ${Math.round(
        mvpStats.damageDealt,
      )} DMG | 🎯 ${mvpStats.kills} K`,
    );

    console.log("================================");

    // 👥 team text
    const teamText = teamPlayers
      .map((player) => {
        const s = player.attributes.stats;

        return `• ${s.name} — ${s.kills}K / ${Math.round(s.damageDealt)} DMG`;
      })
      .join("\n");

    // 🎨 embed
    const embed = new EmbedBuilder()
      .setTitle("🏆 PUBG MATCH RESULT")
      .setColor(
        stats.winPlace === 1
          ? 0xffd700
          : stats.winPlace === 2
            ? 0xc0c0c0
            : 0xcd7f32,
      )
      .setThumbnail(mapImages[mapName])
      .setDescription(
        stats.winPlace === 1
          ? `🐔 **WINNER WINNER CHICKEN DINNER!**\n\n🗺️ ${mapName}\n🎮 ${mode}\n🥇 Rank #1`
          : `🗺️ ${mapName}\n🎮 ${mode}\n🏅 Rank #${stats.winPlace}`,
      )
      .addFields(
        {
          name: "🎯 Combat",
          value:
            `Kills: ${stats.kills}\n` +
            `Assists: ${stats.assists}\n` +
            `Damage: ${Math.round(stats.damageDealt)}\n` +
            `Survival: ${Math.floor(stats.timeSurvived / 60)}m`,
          inline: true,
        },
        {
          name: "👥 Team",
          value: teamText || "No Team",
        },
        {
          name: "🔥 MVP",
          value:
            `${mvpStats.name}\n` + `${Math.round(mvpStats.damageDealt)} DMG`,
          inline: true,
        },
      )
      .setFooter({
        text: `${thaiDate} • ${thaiTime}`,
      })
      .setTimestamp();

    // 📢 send discord
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

    if (!channel) {
      console.log("❌ PUBG channel not found");
      return;
    }

    await channel.send({
      embeds: [embed],
    });

    lastMatchId = latestMatch.id;
    console.log("✅ PUBG SENT TO DISCORD");

  } catch (err) {
    console.log("❌ PUBG API Error");

    if (err.response) {
      console.log(err.response.data);
    } else {
      console.log(err.message);
    }
  }
}

module.exports = testPUBG;
