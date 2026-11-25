const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// เตือนเรื่องไม่มีสิทธิ์ View Audit Log แค่ครั้งเดียวตลอดการทำงานของบอท
let auditLogPermissionWarned = false;

function warnMissingAuditLogPermission(message) {
  if (auditLogPermissionWarned) return;
  console.log(message);
  auditLogPermissionWarned = true;
}

// หา Audit Log entry ของ action type ที่ target ตรงกับ userId และเกิดขึ้นเมื่อไม่นานมานี้
// (MEMBER_KICK / MEMBER_BAN_ADD มี target_id ที่เชื่อถือได้ ต่างจาก MEMBER_DISCONNECT/MOVE)
// retryDelaysMs default เดิม [0, 1200] ใช้กับ Kick อยู่ (ห้ามแตะ) — Ban ส่ง schedule ของตัวเองแยกมา
async function findMatchingAuditEntry(
  guild,
  actionType,
  targetId,
  windowMs = 8000,
  retryDelaysMs = [0, 1200],
) {
  if (!guild || !targetId) return null;

  for (const delay of retryDelaysMs) {
    if (delay) await sleep(delay);

    try {
      const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });

      const entry = logs.entries.find(
        (e) =>
          e.target?.id === targetId &&
          Date.now() - e.createdTimestamp <= windowMs,
      );

      if (entry) return entry;
    } catch (error) {
      if (error.code === 50013) {
        warnMissingAuditLogPermission(
          "⚠️ Bot ไม่มีสิทธิ์ View Audit Log — ข้ามการตรวจจับ Kick/Ban",
        );
        return null;
      }

      console.error("⚠️ Error fetching audit logs:", error.message);
    }
  }

  return null;
}

module.exports = { sleep, warnMissingAuditLogPermission, findMatchingAuditEntry };
