const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(
    process.env.MONGO_URI || "mongodb://localhost:27017/clip_image_search"
  );
  console.log("Connected to MongoDB");
};

module.exports = connectDB;
