const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    name: { type: [String], required: true },
    folder: { type: String, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    // originalPath: { type: String, required: true }, // Path to the original image
    // clipPath: { type: String, required: true }, // Path in CLIP storage
  },
  { timestamps: true }
);

// Add index for faster search
imageSchema.index({ customer: 1, folder: 1 });

const Image = mongoose.model("Image", imageSchema);

module.exports = Image;
