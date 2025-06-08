const Image = require("../model/images");
const imageService = require("../service/imageService");

const createImage = async (req, res) => {
  try {
    const image = await imageService.createImage(req.body);
    res.status(201).json(image);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const createImageWithFiles = async (req, res) => {
  try {
    const { customer, folder } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const image = await imageService.createImageWithFiles(
      req.files,
      customer,
      folder || "general"
    );

    res.status(201).json({
      message: `Added ${req.files.length} images to customer ${customer}`,
      image,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const addFilesToImage = async (req, res) => {
  try {
    const { id } = req.params;
    const filenames = req.body.filenames;

    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res
        .status(400)
        .json({ message: "Filenames must be a non-empty array" });
    }

    const updatedImage = await imageService.addFilesToImage(id, filenames);
    res.status(200).json(updatedImage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getImages = async (req, res) => {
  try {
    const { customer, folder } = req.query;
    const query = {};

    if (customer) query.customer = customer;
    if (folder) query.folder = folder;

    const images = await Image.find(query).populate("customer");
    res.status(200).json(images);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getImageById = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id).populate("customer");
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }
    res.status(200).json(image);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateImage = async (req, res) => {
  try {
    // Handle name field if it's provided as a string
    if (req.body.name && !Array.isArray(req.body.name)) {
      req.body.name = [req.body.name];
    }

    const image = await Image.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.status(200).json(image);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createImage,
  createImageWithFiles,
  addFilesToImage,
  getImages,
  getImageById,
  updateImage,
};
