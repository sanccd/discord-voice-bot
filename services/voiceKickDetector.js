const { AuditLogEvent } = require("discord.js");
const CONFIG = require("../config");
const { sleep, warnMissingAuditLogPermission } = require("../utils/auditLog");

// ตรวจสอบว่า user ถูกเตะออกจาก Voice หรือไม่ โดยติดตามการเปลี่ยนแปลงของ
// extra.count บน MEMBER_DISCONNECT audit log entry ล่าสุด (ไม่ใช้ createdTimestamp
// เพราะ Discord "stack" การ disconnect ซ้ำของ executor เดิมเข้า entry เดียวกัน
// โดยไม่ refresh เวลา — ยืนยันจากการทดสอบจริงและ discord-api-docs#2280)

// guildId -> { entryId: string|null, count: number }
const voiceDisconnectBaseline = new Map();

// guildId -> Promise ล่าสุดในคิว กันหลาย leave event ในกิลด์เดียวกันแย่งกันอ่าน/เขียน baseline พร้อมกัน
const voiceKickCheckQueue = new Map();

async function fetchLatestDisconnectEntry(guild) {
  const logs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberDisconnect,
    limit: 1,
  });

  return logs.entries.first() ?? null;
}

// เรียกตอน bot พร้อมใช้งาน เพื่อจำ count ปัจจุบันไว้เป็น baseline
// กัน count ที่มีอยู่ก่อน bot start ถูกตีความว่าเป็น kick ใหม่
async function initVoiceKickBaseline(guild) {
  if (!CONFIG.LOG_VOICE_KICK_CHANNEL_ID) return;

  try {
    const entry = await fetchLatestDisconnectEntry(guild);

    voiceDisconnectBaseline.set(guild.id, {
      entryId: entry?.id ?? null,
      count: entry ? Number(entry.extra?.count ?? 1) : 0,
    });
  } catch (error) {
    if (error.code === 50013) {
      warnMissingAuditLogPermission(
        "⚠️ Bot ไม่มีสิทธิ์ View Audit Log — ข้ามการตรวจจับ Voice Kick",
      );
    } else {
      console.error(
        "⚠️ Error initializing voice kick baseline:",
        error.message,
      );
    }
  }
}

// เทียบ count ล่าสุดกับ baseline คืน audit log entry (มี .executor / .reason) ถ้ามั่นใจว่าเป็น kick, ไม่งั้นคืน null
async function checkVoiceKickDelta(guild) {
  // ยังไม่มี baseline (เช่น bot เพิ่ง start ยัง init ไม่เสร็จ หรือไม่มีสิทธิ์อ่าน) → conservative ไม่ถือเป็น kick
  if (!voiceDisconnectBaseline.has(guild.id)) return null;

  const RETRY_DELAYS_MS = [0, 200]; // เผื่อ audit log เขียนไม่ทัน voiceStateUpdate

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);

    let entry;

    try {
      entry = await fetchLatestDisconnectEntry(guild);
    } catch (error) {
      console.error(
        "⚠️ Error fetching audit logs for voice kick:",
        error.message,
      );
      continue;
    }

    if (!entry) return null; // ไม่เคยมี MEMBER_DISCONNECT ใน guild นี้เลย

    const baseline = voiceDisconnectBaseline.get(guild.id);
    const currentCount = Number(entry.extra?.count ?? 1);

    // entry id เปลี่ยน = entry ใหม่ทั้งอัน ไม่เอาของเก่ามาลบเทียบ ถือว่า count ทั้งหมดคือของใหม่
    const delta =
      entry.id !== baseline.entryId
        ? currentCount
        : currentCount - baseline.count;

    // อัปเดต baseline ทุกครั้งที่เห็นการเปลี่ยนแปลง กันนับซ้ำในรอบถัดไป
    voiceDisconnectBaseline.set(guild.id, {
      entryId: entry.id,
      count: currentCount,
    });

    if (delta === 1) {
      return entry; // มี disconnect ใหม่เกิดขึ้นพอดี 1 ครั้ง ตรงกับ leave event ที่เพิ่งเกิด
    }

    if (delta > 1) {
      console.log(
        `⚠️ Voice kick ambiguous: entry ${entry.id} count เพิ่มขึ้น ${delta} พร้อมกัน — ไม่สามารถระบุ target ได้แน่นอน, fallback เป็น leave`,
      );
      return null;
    }

    // delta <= 0 → ยังไม่เห็นการเปลี่ยนแปลง ลอง retry รอบถัดไป
  }

  return null; // ไม่พบการเปลี่ยนแปลง = ถือว่าออกเอง
}

// serialize การเช็คต่อ guild ผ่านคิว กันสอง leave event พร้อมกันแย่งอ่าน/เขียน baseline
function findVoiceKickAuditEntry(guild) {
  if (!guild) return Promise.resolve(null);

  const guildId = guild.id;
  const prevInQueue = voiceKickCheckQueue.get(guildId) ?? Promise.resolve(null);

  const run = prevInQueue
    .catch(() => null)
    .then(() => checkVoiceKickDelta(guild));

  voiceKickCheckQueue.set(
    guildId,
    run.catch(() => null),
  );

  return run;
}

module.exports = { initVoiceKickBaseline, findVoiceKickAuditEntry };
