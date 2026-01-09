const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },   // Cloudinary URL
  publicId: { type: String, required: true },   // Cloudinary public_id
  link: { type: String, default: "" },           // Click URL
  startDate: Date,
  endDate: Date,
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Banner", bannerSchema);
