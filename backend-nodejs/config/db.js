const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Sử dụng biến môi trường hoặc URL mặc định
    const mongoURI = "mongodb+srv://nguyendinhtu11022002:v0YGqRqtzoUw72Mp@inbe.htme7st.mongodb.net/";
    
    await mongoose.connect(mongoURI, {
      // Thêm các tùy chọn kết nối để xử lý vấn đề DNS
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Sử dụng IPv4, tránh vấn đề với IPv6
    });
    
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    // Nếu lỗi nghiêm trọng, thoát ứng dụng
    process.exit(1);
  }
};

module.exports = connectDB;
