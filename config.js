require("dotenv").config();

// กำหนดค่า config ทั้งหมดจาก .env
const CONFIG = {
  TOKEN: process.env.TOKEN,
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
  LOG_JOIN_CHANNEL_ID: process.env.LOG_JOIN_CHANNEL_ID,
  LOG_DELETE_CHANNEL_ID: process.env.LOG_DELETE_CHANNEL_ID,
  LOG_EDIT_CHANNEL_ID: process.env.LOG_EDIT_CHANNEL_ID,
  LOG_MOVE_CHANNEL_ID: process.env.LOG_MOVE_CHANNEL_ID,
  LOG_VOICE_KICK_CHANNEL_ID: process.env.LOG_VOICE_KICK_CHANNEL_ID,
  LOG_KICK_SERVER_CHANNEL_ID: process.env.LOG_KICK_SERVER_CHANNEL_ID,
  LOG_BAN_SERVER_CHANNEL_ID: process.env.LOG_BAN_SERVER_CHANNEL_ID,
};

module.exports = CONFIG;
