const User = require("./models/User");

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

async function findUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    return User.findOne({email: normalizedEmail}).lean();
}

async function createUser({email, passwordHash}) {
    const normalizedEmail = normalizeEmail(email);

    const user = await User.create({
        email: normalizedEmail,
        passwordHash,
    });

    return user.toObject();
}

module.exports = {
    findUserByEmail,
    createUser,
    normalizeEmail,
};