const Database = require("better-sqlite3");
const db = new Database("voice_time.db");

// สร้างตาราง
function initDatabase() {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      join_time INTEGER NOT NULL,
      leave_time INTEGER,
      duration INTEGER DEFAULT 0
    )
  `,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS voice_stats (
      user_id TEXT PRIMARY KEY,
      total_time INTEGER DEFAULT 0
    )
  `,
  ).run();

  console.log("✅ Database tables initialized");
}

// เข้า voice
function saveJoinSession(userId, guildId, joinTime) {
  const result = db
    .prepare(
      `
    INSERT INTO voice_sessions (user_id, guild_id, join_time)
    VALUES (?, ?, ?)
  `,
    )
    .run(userId, guildId, joinTime);

  return result.lastInsertRowid;
}

// ออกจาก voice
function saveLeaveSession(userId, leaveTime) {
  const session = db
    .prepare(
      `
    SELECT * FROM voice_sessions
    WHERE user_id = ? AND leave_time IS NULL
    ORDER BY id DESC LIMIT 1
  `,
    )
    .get(userId);

  if (!session) return null;

  const duration = Math.floor((leaveTime - session.join_time) / 1000);

  db.prepare(
    `
    UPDATE voice_sessions
    SET leave_time = ?, duration = ?
    WHERE id = ?
  `,
  ).run(leaveTime, duration, session.id);

  db.prepare(
    `
    INSERT INTO voice_stats (user_id, total_time)
    VALUES (?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET total_time = total_time + ?
  `,
  ).run(userId, duration, duration);

  return duration;
}

// leaderboard
function getLeaderboard(limit = 10) {
  return db
    .prepare(
      `
    SELECT user_id, total_time
    FROM voice_stats
    ORDER BY total_time DESC
    LIMIT ?
  `,
    )
    .all(limit);
}

// user time
function getUserTime(userId) {
  const row = db
    .prepare(
      `
    SELECT total_time FROM voice_stats WHERE user_id = ?
  `,
    )
    .get(userId);

  return row ? row.total_time : 0;
}

module.exports = {
  db,
  initDatabase,
  saveJoinSession,
  saveLeaveSession,
  getLeaderboard,
  getUserTime,
};
