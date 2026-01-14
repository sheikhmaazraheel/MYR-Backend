import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  contact: { type: String, required: true },
  city: { type: String, required: true },
  houseNo: { type: String, required: true },
  Block: { type: String, required: true },
  Area: { type: String, required: true },
  landmark: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  cartItems: [
    {
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true },
      selectedColor: { type: String, default: null },
      selectedSize: { type: String, default: null },
      image: { type: String, default: null },
    },
  ],
  totalAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Order", orderSchema);