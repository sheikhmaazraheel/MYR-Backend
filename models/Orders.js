const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: String,
  name: String,
  contact: String,
  city: String,
  houseNo: String,
  Block: String,
  Area: String,
  landmark: String,
  paymentMethod: String,
  cartItems: [
    {
      name: String,
      price: Number,
      quantity: Number,
      selectedColor: String,
      selectedSize: String,
      image: String, // Added for thank you page
    },
  ],
  totalAmount: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Order", orderSchema);