const express = require("express");
const {
  createImage,
  createImageWithFiles,
  addFilesToImage,
  getImages,
  getImageById,
  updateImage,
} = require("../controller/imagesController");

const router = express.Router();

// Standard CRUD routes
router.post("/", createImage);
router.get("/", getImages);
router.get("/:id", getImageById);
router.put("/:id", updateImage);

// Special routes for file handling
router.post("/with-files", createImageWithFiles);
router.post("/:id/add-files", addFilesToImage);

module.exports = router;
