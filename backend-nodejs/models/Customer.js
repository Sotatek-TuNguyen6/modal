const mongoose = require("mongoose");

// Create a counter schema for auto-incrementing customer codes
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    trim: true,
    unique: true,
  },
  //   email: {
  //     type: String,
  //     trim: true,
  //     lowercase: true,
  //     match: [/^\S+@\S+\.\S+$/, "Please use a valid email address."],
  //   },
  //   phone: {
  //     type: String,
  //     trim: true,
  //   },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Function to get the next sequence value
async function getNextSequence(name) {
  try {
    const counter = await Counter.findByIdAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return counter.seq;
  } catch (error) {
    console.error("Error getting next sequence:", error);
    throw error;
  }
}

// Pre-save middleware to auto-generate customer code
customerSchema.pre("save", async function (next) {
  try {
    // Only generate code for new documents
    if (this.isNew) {
      const seq = await getNextSequence("customerId");
      this.code = `KH${seq.toString().padStart(4, "0")}`;
      console.log("Generated customer code:", this.code);
    }
    next();
  } catch (error) {
    console.error("Error in pre-save hook:", error);
    next(error);
  }
});

module.exports = mongoose.model("Customer", customerSchema);
