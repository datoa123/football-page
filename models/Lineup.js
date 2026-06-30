const mongoose = require("mongoose");

const lineupPlayerSchema = new mongoose.Schema({
    pos: {type: String, required: true},
    id: {type: Number, default: null},
    name: {type: String, default: null},
    team: {type: String, default: null},
}, {_id: false});

const lineupSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    formation: {
        type: String,
        required: true,
    },
    lineup: {
        type: [lineupPlayerSchema],
        default: [],
    },
}, {
    timestamps: {createdAt: "createdAt", updatedAt: "updatedAt"},
});

module.exports = mongoose.model("Lineup", lineupSchema);
