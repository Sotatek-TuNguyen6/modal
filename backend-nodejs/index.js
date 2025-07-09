const express = require("express");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
const connectDB = require("./config/db");
const imageService = require("./service/imageService");
const mongoose = require("mongoose");
const cors = require("cors");
// Import routes
const imageRoutes = require("./routes/imageRoute");
const customerRoutes = require("./routes/customerRoutes");
const userRoutes = require("./routes/userRouter");

// Custom function to format date in Vietnamese format (UTC+7)
function formatDateVN(date) {
  // Add 7 hours for UTC+7
  const vnDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
  
  // Format as dd/MM/yyyy HH:mm:ss
  const day = String(vnDate.getUTCDate()).padStart(2, '0');
  const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const year = vnDate.getUTCFullYear();
  const hours = String(vnDate.getUTCHours()).padStart(2, '0');
  const minutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(vnDate.getUTCSeconds()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// Set default value for environment variables
const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL || "http://localhost:5000";
const PORT = process.env.PORT || 4000;

connectDB();

const app = express();

app.use(cors());

// Add middleware to parse JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer to filter for JPG files
const fileFilter = (req, file, cb) => {
  // Accept all image types but rename to jpg
  if (file.mimetype.startsWith("image/")) {
    // Rename file extension to .jpg
    const originalName = file.originalname;
    const nameWithoutExt = originalName.split(".").slice(0, -1).join(".");
    file.originalname = `${nameWithoutExt}.jpg`;

    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file ảnh"), false);
  }
};

// Directory for storing uploaded images
const UPLOADS_DIR = path.join(__dirname, "uploads");
// Make sure the directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure storage to ensure files are saved with .jpg extension
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // Keep original filename but ensure .jpg extension
    const originalName =
      path.basename(file.originalname, path.extname(file.originalname)) +
      ".jpg";
    cb(null, originalName);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

// Serve static files
app.use(express.static("public"));

// Middleware to handle Next.js image optimization parameters
app.use("/uploads", (req, res, next) => {
  // Check if the URL contains image optimization parameters
  if (req.url.includes("&w=") || req.url.includes("?w=")) {
    // Extract the actual image path by removing the query parameters
    const imagePath = req.url.split(/[?&]/)[0];
    // Set the new URL for the request
    req.url = imagePath;
  }
  next();
});

// Serve files from uploads directory
app.use("/uploads", express.static(UPLOADS_DIR));
// Also serve files from CLIP storage for backward compatibility
app.use(
  "/images",
  express.static(path.join(__dirname, "../clip-service/image_storage"))
);

// Use routes
app.use("/api/images", imageRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/users", userRoutes);

// Serve the main HTML pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/upload", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "upload.html"));
});

app.get("/customer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "customer.html"));
});

// Tìm kiếm: chỉ 1 ảnh
app.post("/search", upload.single("image"), async (req, res) => {
  try {
    const form = new FormData();
    form.append("image", fs.createReadStream(req.file.path));

    const response = await axios.post(`${CLIP_SERVICE_URL}/search`, form, {
      headers: form.getHeaders(),
    });

    const images = response.data;

    console.log("images", images);
    // Kiểm tra nếu không có ảnh nào được tìm thấy
    if (!images || images.length === 0) {
      return res.json({
        success: true,
        message: "Không tìm thấy ảnh tương tự",
        results: [],
        total: 0,
      });
    }

    // Get image metadata from database for each image
    const imageResults = [];

    for (const img of images) {
      // Extract just the filename from the full path returned by CLIP service
      const imgFilename = path.basename(img);

      console.log("imgFilename", imgFilename);
      // Find image info in the database
      try {
        const imageInfo = await imageService.findImageByFilename(imgFilename);

        console.log("imageInfo", imageInfo);
        // Get customer name if customer ID exists
        let customerName = "N/A";
        let customerId = null;
        if (imageInfo && imageInfo.customer) {
          const Customer = mongoose.model("Customer");
          const customer = await Customer.findById(imageInfo.customer);
          if (customer) {
            customerName = `${customer.name} (${customer.code})`;
            customerId = customer._id;
          }
        }

        imageResults.push({
          id: new mongoose.Types.ObjectId().toString(),
          filename: imgFilename,
          path: `/uploads/${imgFilename}`,
          url: `/uploads/${imgFilename}`,
          name: imgFilename,
          customer: customerName,
          customerId: customerId,
          folder: imageInfo ? imageInfo.folder || "general" : "general",
          date: imageInfo
            ? imageInfo.createdAt
              ? formatDateVN(new Date(imageInfo.createdAt))
              : formatDateVN(new Date())
            : formatDateVN(new Date()),
          similarity: 100 - imageResults.length * 5, // Giả lập độ tương đồng giảm dần
        });
      } catch (error) {
        console.error(`Error fetching metadata for ${imgFilename}:`, error);
      }
    }

    // Nếu không có kết quả sau khi xử lý, trả về thông báo không tìm thấy
    if (imageResults.length === 0) {
      return res.json({
        success: true,
        message: "Không tìm thấy ảnh tương tự",
        results: [],
        total: 0,
      });
    }

    // Trả về kết quả dưới dạng JSON
    res.json({
      success: true,
      message: "Tìm kiếm thành công",
      results: imageResults,
      total: imageResults.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Lỗi xử lý ảnh. Chỉ chấp nhận file JPG/JPEG.",
      error: err.message,
    });
  }
  // Keep the uploaded file
});

// Thêm nhiều ảnh
app.post("/addImage", upload.array("images", 20), async (req, res) => {
  const start = Date.now();
  const addedPaths = [];
  try {
    // Extract customer and folder from request body
    const { customer, folder } = req.body;
    const folderName = folder || "general";
    
    // Tạo danh sách các đường dẫn file đã lưu
    const savedFiles = req.files.map(file => ({
      path: file.path,
      filename: file.filename
    }));
    
    // Trả về response ngay lập tức để client không phải đợi
    const responsePromise = res.json({
      success: true,
      message: `Đang xử lý ${savedFiles.length} ảnh...`,
      added: savedFiles.map(file => `/uploads/${file.filename}`),
    });
    
    // Đảm bảo response đã được gửi trước khi xử lý
    await responsePromise;
    
    // Xử lý ảnh trong background
    const processImages = async () => {
      console.time('image-processing');
      
      // Luôn sử dụng batch API để tăng tốc
      const form = new FormData();
      
      // Thêm tất cả các file vào form
      for (let file of savedFiles) {
        form.append("images", fs.createReadStream(file.path), file.filename);
        addedPaths.push(`/uploads/${file.filename}`);
      }
      
      try {
        // Gọi API batch upload
        await axios.post(`${CLIP_SERVICE_URL}/add-batch`, form, {
          headers: form.getHeaders(),
          timeout: 60000, // 60 giây timeout
        });
        
        // Save to database if customer is provided (sau khi đã trả response)
        if (customer) {
          await imageService.createImageWithFiles(req.files, customer, folderName);
        }
        
        console.timeEnd('image-processing');
        console.log(`✅ Đã xử lý xong ${savedFiles.length} ảnh trong ${(Date.now() - start)/1000}s`);
      } catch (err) {
        console.error("❌ Lỗi khi xử lý ảnh:", err.message);
      }
    };
    
    // Chạy xử lý ảnh sau khi response đã được gửi
    setImmediate(processImages);
    
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ 
        success: false,
        message: "Lỗi khi thêm ảnh. Chỉ chấp nhận file JPG/JPEG.",
        error: err.message
      });
  }
});

// Debug endpoint for customer update
app.get("/api/debug/update-customer/:id", (req, res) => {
  console.log("Debug route - Customer ID:", req.params.id);
  console.log("Debug route - Customer ID type:", typeof req.params.id);

  if (!req.params.id || req.params.id === "undefined") {
    return res.status(400).json({ error: "Missing or invalid customer ID" });
  }

  res.json({ message: "Debug info logged", id: req.params.id });
});

// Debug endpoint for Counter collection
app.get("/api/debug/counter", async (req, res) => {
  try {
    // Get the Counter model
    const Counter = mongoose.model("Counter");

    // Find all counters
    const counters = await Counter.find();

    // If customerId counter doesn't exist, create it
    if (!counters.some((counter) => counter._id === "customerId")) {
      const newCounter = new Counter({
        _id: "customerId",
        seq: 0,
      });
      await newCounter.save();
      counters.push(newCounter);
    }

    res.json({ counters });
  } catch (error) {
    console.error("Error getting counters:", error);
    res.status(500).json({ error: "Failed to get counters" });
  }
});

// Reload CLIP index manually
app.post("/api/reload-index", async (req, res) => {
  try {
    const response = await axios.post(`${CLIP_SERVICE_URL}/reload`);
    console.log("✅ CLIP index reloaded manually");
    res.json({
      message: "Index CLIP đã được tải lại thành công",
      details: response.data,
    });
  } catch (error) {
    console.error("❌ Error reloading CLIP index:", error.message);
    res.status(500).json({
      message: "Lỗi khi tải lại index CLIP",
      error: error.message,
    });
  }
});

// Thêm route để xóa ảnh
app.delete("/api/images/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    console.log(`Xóa ảnh: ${filename}`);

    // Gọi CLIP service để xóa ảnh khỏi index
    await axios.post(`${CLIP_SERVICE_URL}/delete`, { filename });

    // Xóa thông tin ảnh từ cơ sở dữ liệu
    const deletedImage = await imageService.deleteImageByFilename(filename);

    res.json({
      success: true,
      message: `Đã xóa ảnh ${filename}`,
      deletedImage,
    });
  } catch (err) {
    console.error("Lỗi khi xóa ảnh:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa ảnh",
      error: err.message,
    });
  }
});

app.post("/api/reset-index", async (req, res) => {
  try {
    const response = await axios.post(`${CLIP_SERVICE_URL}/reset`);
    console.log("✅ CLIP index reset successfully");
    res.json({ message: "Index CLIP đã được reset thành công" });
  } catch (error) {
    console.error("❌ Error resetting CLIP index:", error.message);
    res.status(500).json({
      message: "Lỗi khi reset index CLIP",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ NodeJS server đang chạy tại http://localhost:${PORT}`);
  console.log(`✅ CLIP service URL: ${CLIP_SERVICE_URL}`);
});
