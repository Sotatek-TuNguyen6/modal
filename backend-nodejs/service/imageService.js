const Image = require("../model/images");

/**
 * Creates a new image record in the database
 * @param {Object} imageData - Image data
 * @param {Array|String} imageData.name - Image name(s)
 * @param {String} imageData.folder - Folder name
 * @param {String} imageData.customer - Customer ID
 * @returns {Promise<Object>} The created image record
 */
const createImage = async (imageData) => {
  // Handle case where name is provided as a single string
  if (imageData.name && !Array.isArray(imageData.name)) {
    imageData.name = [imageData.name];
  }

  // Ensure name is always an array even if empty
  if (!imageData.name) {
    imageData.name = [];
  }

  const newImage = await Image.create(imageData);
  return newImage;
};

/**
 * Creates an image with files uploaded to CLIP service
 * @param {Array} files - Uploaded files
 * @param {String} customerId - Customer ID
 * @param {String} folder - Folder name
 * @returns {Promise<Object>} The created image record
 */
const createImageWithFiles = async (files, customerId, folder = "general") => {
  // Extract filenames from the files
  const filenames = files.map((file) => file.filename);

  const imageData = {
    name: filenames,
    folder: folder,
    customer: customerId,
  };

  const newImage = await Image.create(imageData);
  return newImage;
};

/**
 * Adds filenames to an existing image record
 * @param {String} imageId - Image ID
 * @param {Array} filenames - Array of filenames to add
 * @returns {Promise<Object>} The updated image record
 */
const addFilesToImage = async (imageId, filenames) => {
  const image = await Image.findById(imageId);

  if (!image) {
    throw new Error("Image not found");
  }

  // Add new filenames to the existing array
  image.name = [...image.name, ...filenames];

  await image.save();
  return image;
};

/**
 * Find an image by its filename
 * @param {string} filename - The filename to search for
 * @returns {Promise<Object|null>} - The image document or null if not found
 */
const findImageByFilename = async function (filename) {
  try {
    // Search for the image where the filename is in the names array
    const image = await Image.findOne({ name: { $in: [filename] } });
    return image;
  } catch (error) {
    console.error("Error finding image by filename:", error);
    return null;
  }
};

/**
 * Delete an image document by filename or remove the filename from the document
 * @param {string} filename - The filename to delete
 * @returns {Promise<Object|null>} - The deleted or updated image document
 */
const deleteImageByFilename = async function (filename) {
  try {
    // Tìm document chứa filename này
    const image = await Image.findOne({ name: { $in: [filename] } });

    if (!image) {
      return null;
    }

    // Nếu document chỉ chứa 1 filename và trùng với filename cần xóa, xóa cả document
    if (image.name.length === 1 && image.name[0] === filename) {
      const deletedImage = await Image.findByIdAndDelete(image._id);
      return deletedImage;
    }
    // Nếu document chứa nhiều filename, chỉ xóa filename đó khỏi mảng
    else {
      image.name = image.name.filter((name) => name !== filename);
      await image.save();
      return image;
    }
  } catch (error) {
    console.error("Error deleting image by filename:", error);
    throw error;
  }
};

module.exports = {
  createImage,
  createImageWithFiles,
  addFilesToImage,
  findImageByFilename,
  deleteImageByFilename,
};
