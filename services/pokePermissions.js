const fs = require("fs");
const path = require("path");

const dataDirectory = path.join(__dirname, "..", "data");
const permissionsFile = path.join(dataDirectory, "pokePermissions.json");
const userIdPattern = /^\d{17,20}$/;

function ensurePermissionsFile() {
  try {
    fs.mkdirSync(dataDirectory, { recursive: true });

    if (!fs.existsSync(permissionsFile)) {
      writePermissions({ users: [] });
    }
  } catch (error) {
    console.error("⚠️ Cannot initialize Poke permissions file:", error.message);
  }
}

function readPermissions() {
  ensurePermissionsFile();

  try {
    const raw = fs.readFileSync(permissionsFile, "utf8");
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed.users)
      ? parsed.users.filter((userId) => userIdPattern.test(userId))
      : [];

    return { users: [...new Set(users)] };
  } catch (error) {
    console.error("⚠️ Cannot read Poke permissions file:", error.message);
    return { users: [] };
  }
}

function writePermissions(permissions) {
  try {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temporaryFile = `${permissionsFile}.tmp`;
    fs.writeFileSync(
      temporaryFile,
      `${JSON.stringify(permissions, null, 2)}\n`,
      "utf8",
    );
    fs.renameSync(temporaryFile, permissionsFile);
    return true;
  } catch (error) {
    console.error("⚠️ Cannot write Poke permissions file:", error.message);
    return false;
  }
}

function isPokeOwner(userId) {
  const ownerId = process.env.POKE_OWNER_ID?.trim();
  return Boolean(ownerId && userId === ownerId && userIdPattern.test(userId));
}

function isPokeAuthorized(userId) {
  return readPermissions().users.includes(userId);
}

function addPokeUser(userId) {
  if (!userIdPattern.test(userId)) return false;

  const permissions = readPermissions();
  if (permissions.users.includes(userId)) return false;

  permissions.users.push(userId);
  return writePermissions(permissions);
}

function removePokeUser(userId) {
  const permissions = readPermissions();
  if (!permissions.users.includes(userId)) return false;

  permissions.users = permissions.users.filter((id) => id !== userId);
  return writePermissions(permissions);
}

function getPokeUsers() {
  return readPermissions().users;
}

ensurePermissionsFile();

module.exports = {
  isPokeOwner,
  isPokeAuthorized,
  addPokeUser,
  removePokeUser,
  getPokeUsers,
};
