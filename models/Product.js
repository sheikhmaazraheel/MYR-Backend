const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  discount: { type: Number },
  description: { type: String },
  category: { type: String, required: true },
  mostSell: { type: Boolean, default: false },
  available: { type: Boolean, default: true },
  image: { type: String },
colors: {
  type: [String],
  default: []
},
sizes: {
  type: [String],
  default: []
},},
 { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
