// ฟังก์ชันจัดรูปแบบ duration
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function getStatus(status) {
  switch (status) {
    case "online":
      return "🟢 Online";
    case "idle":
      return "🌙 Idle";
    case "dnd":
      return "⛔ Do Not Disturb";
    default:
      return "⚫ Offline";
  }
}

// "ชื่อเล่น (username)" ถ้าชื่อเล่นต่างจาก username, ไม่งั้นใช้ username อย่างเดียว
function formatMemberName(member, fallback = "Unknown") {
  const nickname = member?.displayName;
  const usernameRaw = member?.user?.username;

  return nickname && nickname !== usernameRaw
    ? `${nickname} (${usernameRaw})`
    : usernameRaw || fallback;
}

// เวลาปัจจุบันแบบ Discord timestamp: วันที่เต็ม + (เมื่อกี้)
function nowTimestamp() {
  const now = Math.floor(Date.now() / 1000);
  return `<t:${now}:F> (<t:${now}:R>)`;
}

module.exports = { formatDuration, getStatus, formatMemberName, nowTimestamp };
