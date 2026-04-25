const sqlite3 = require("sqlite3").verbose();

// เชื่อมต่อกับ SQLite database
const db = new sqlite3.Database("./voice_time.db", (err) => {
  if (err) {
    console.error("❌ Database connection error:", err.message);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

// สร้างตารางสำหรับเก็บข้อมูล
function initDatabase() {
  db.serialize(() => {
    // ตารางสำหรับ session ของการเข้า voice
    db.run(`
            CREATE TABLE IF NOT EXISTS voice_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                join_time INTEGER NOT NULL,
                leave_time INTEGER,
                duration INTEGER DEFAULT 0
            )
        `);

    // ตารางสำหรับเก็บ total voice time ของแต่ละ user
    db.run(`
            CREATE TABLE IF NOT EXISTS voice_stats (
                user_id TEXT PRIMARY KEY,
                total_time INTEGER DEFAULT 0
            )
        `);

    console.log("✅ Database tables initialized");
  });
}

// บันทึก session เมื่อ user เข้า voice
function saveJoinSession(userId, guildId, joinTime) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO voice_sessions (user_id, guild_id, join_time) VALUES (?, ?, ?)`,
      [userId, guildId, joinTime],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

// คำนวณและบันทึก duration เมื่อ user ออกจาก voice
function saveLeaveSession(userId, leaveTime) {
  return new Promise((resolve, reject) => {
    // หา session ล่าสุดที่ยังไม่มี leave_time
    db.get(
      `SELECT * FROM voice_sessions WHERE user_id = ? AND leave_time IS NULL ORDER BY id DESC LIMIT 1`,
      [userId],
      (err, session) => {
        if (err) {
          reject(err);
          return;
        }

        if (!session) {
          resolve(null);
          return;
        }

        // คำนวณ duration ในวินาที
        const duration = Math.floor((leaveTime - session.join_time) / 1000);

        // อัพเดท leave_time และ duration
        db.run(
          `UPDATE voice_sessions SET leave_time = ?, duration = ? WHERE id = ?`,
          [leaveTime, duration, session.id],
          function (err) {
            if (err) {
              reject(err);
              return;
            }

            // อัพเดท total voice time
            updateTotalTime(userId, duration, resolve, reject);
          },
        );
      },
    );
  });
}

// อัพเดท total voice time
function updateTotalTime(userId, duration, resolve, reject) {
  db.run(
    `INSERT INTO voice_stats (user_id, total_time) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET total_time = total_time + ?`,
    [userId, duration, duration],
    function (err) {
      if (err) reject(err);
      else resolve(duration);
    },
  );
}

// ดึง leaderboard
function getLeaderboard(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id, total_time FROM voice_stats ORDER BY total_time DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

// ดึง total time ของ user
function getUserTime(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT total_time FROM voice_stats WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.total_time : 0);
      },
    );
  });
}

module.exports = {
  db,
  initDatabase,
  saveJoinSession,
  saveLeaveSession,
  getLeaderboard,
  getUserTime,
};
