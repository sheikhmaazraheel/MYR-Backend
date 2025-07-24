require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const Product = require("./models/Product");
const Order = require("./models/Orders");

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connect
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ CORS Setup (replace with your frontend URL)
app.use(cors({
  origin: "https://sheikhmaazraheel.github.io", // update this
  credentials: true,
}));

// ✅ Session Config
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
      httpOnly: true,
      secure: true, // Must be true for HTTPS
      sameSite: "None", // Cross-origin cookies
      maxAge: 1000 * 60 * 60,
    },
  })
);

// Dummy Admin
const ADMIN = {
  username: process.env.ADMIN_USER,
  password: process.env.ADMIN_HASH,
};

// ✅ Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.loggedIn) return next();
  res.status(401).json({ authenticated: false });
}

// 🔐 Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN.username) {
    const match = await bcrypt.compare(password, ADMIN.password);
    if (match) {
      req.session.loggedIn = true;
      return res.json({ success: true });
    }
  }
  res.json({ success: false, message: "Invalid credentials" });
});

// Logout Route
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false });
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// ✅ Auth Check (used in /admin.html fetch)
app.get("/check-auth", (req, res) => {
  if (req.session.loggedIn) {
    return res.json({ authenticated: true });
  } else {
    return res.status(401).json({ authenticated: false });
  }
});

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// Upload Product (Admin only)
app.post("/upload", isAuthenticated, upload.single("image"), async (req, res) => {
  try {
    const { id, name, price, discount, category, mostSell, available } = req.body;
    const colors = req.body.colors?.split(",").map(c => c.trim()).filter(Boolean) || [];
    const sizes = req.body.sizes?.split(",").map(s => s.trim()).filter(Boolean) || [];
    const image = req.file?.filename || null;

    const product = new Product({
      id,
      name,
      price: parseFloat(price),
      discount: discount ? parseFloat(discount) : 0,
      category,
      mostSell: mostSell === "true",
      available: available === "true",
      image,
      colors,
      sizes,
    });

    await product.save();
    res.json({ message: "Product saved", product });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ message: "Failed to upload" });
  }
});

// Get All Products
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Error loading products" });
  }
});

// Update Product
app.put("/products/:id", upload.single("image"), async (req, res) => {
  const updateFields = {
    ...req.body,
    colors: req.body.colors?.split(",").map(c => c.trim()).filter(Boolean) || [],
    sizes: req.body.sizes?.split(",").map(s => s.trim()).filter(Boolean) || [],
  };

  if (typeof req.body.available !== "undefined") {
    updateFields.available = req.body.available === "true";
  }
  if (typeof req.body.mostSell !== "undefined") {
    updateFields.mostSell = req.body.mostSell === "true";
  }
  if (req.file) updateFields.image = req.file.filename;

  try {
    await Product.updateOne({ id: req.params.id }, { $set: updateFields });
    res.json({ message: "Product updated" });
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

// Delete Product
app.delete("/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});

// Submit Order
app.post("/orders", async (req, res) => {
  try {
    const newOrder = new Order(req.body);
    await newOrder.save();
    res.status(201).json({ success: true, message: "Order placed" });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ success: false, message: "Order failed" });
  }
});

// Get All Orders (optional: protect later)
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed" });
  }
});

// Admin Panel (protected)
app.get("/admin.html", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../protected/admin.html"));
});

// Default
app.get("/", (req, res) => res.send("Server is running ✅"));

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
