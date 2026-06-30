const mongoose = require("mongoose");

const DEFAULT_MONGO_URI = "mongodb://localhost:27017/pitchlive";

async function connectToDatabase() {
    const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

    mongoose.connection.on("connected", () => {
        console.log(`MongoDB connected: ${mongoUri}`);
    });

    mongoose.connection.on("error", (error) => {
        console.error("MongoDB connection error:", error);
    });

    await mongoose.connect(mongoUri);
}

module.exports = {connectToDatabase};
