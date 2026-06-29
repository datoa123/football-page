const fs = require("fs");
const path = require("path");

const usersFilePath = path.join(__dirname, "data", "users.json");

function ensureUsersFile() {
    const dataDir = path.dirname(usersFilePath);

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, {recursive: true});
    }

    if (!fs.existsSync(usersFilePath)) {
        fs.writeFileSync(usersFilePath, JSON.stringify([], null, 2));
    }
}

function readUsers() {
    ensureUsersFile();

    try {
        const raw = fs.readFileSync(usersFilePath, "utf8");
        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read users file", error);
        return [];
    }
}

function writeUsers(users) {
    ensureUsersFile();
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function findUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    return readUsers().find((user) => user.email === normalizedEmail) || null;
}

function createUser({email, passwordHash}) {
    const users = readUsers();
    const normalizedEmail = normalizeEmail(email);

    const newUser = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        email: normalizedEmail,
        passwordHash,
        createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    writeUsers(users);

    return newUser;
}

module.exports = {
    findUserByEmail,
    createUser,
    normalizeEmail,
};
