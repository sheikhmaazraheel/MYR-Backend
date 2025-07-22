require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const session = require("express-session");

const Product = require("./models/Product");
const Order = require("./models/Orders");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..")));

// ✅ Session Config
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      maxAge: 1000 * 60 * 60,
    },
  })
);

// ✅ Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect("/login.html");
}

// ✅ Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// ✅ Routes
app.get("/", (req, res) => res.send("Server is running..."));

// ✅ Admin Login/Logout
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER) {
    const match = await bcrypt.compare(password, process.env.ADMIN_HASH);
    if (match) {
      req.session.loggedIn = true;
      return res.json({ success: true });
    }
  }
  res.json({ success: false, message: "Invalid credentials" });
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.get("/check-auth", (req, res) => {
  res.json({ authenticated: !!req.session.loggedIn });
});

// ✅ Serve protected admin panel
app.get("/admin.html", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../protected/admin.html"));
});

// ✅ Upload Product
app.post("/upload", isAuthenticated, upload.single("image"), async (req, res) => {
  try {
    const { id, name, price, discount, category, mostSell, available } = req.body;

    const colors = req.body.colors?.split(",").map(c => c.trim()).filter(Boolean) || [];
    const sizes = req.body.sizes?.split(",").map(s => s.trim()).filter(Boolean) || [];
    const image = req.file?.filename || null;

    if (!id || !name || !price || !category) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const product = new Product({
      id: id.trim(),
      name: name.trim(),
      price: parseFloat(price),
      discount: parseFloat(discount || 0),
      category,
      mostSell: mostSell === "true" || mostSell === true,
      available: available === "true" || available === true,
      image,
      colors,
      sizes,
    });

    await product.save();
    res.status(200).json({ message: "Product saved to MongoDB", product });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Failed to save product" });
  }
});

// ✅ Product Routes
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Error loading products" });
  }
});

app.put("/products/:id", upload.single("image"), async (req, res) => {
  const id = req.params.id;
  const updateFields = {
    ...req.body,
    colors: req.body.colors?.split(",").map(c => c.trim()).filter(Boolean) || [],
    sizes: req.body.sizes?.split(",").map(s => s.trim()).filter(Boolean) || [],
  };

  if (req.file) updateFields.image = req.file.filename;
  if (updateFields.available !== undefined) {
    updateFields.available = updateFields.available === "true" || updateFields.available === "on";
  }
  if (updateFields.mostSell !== undefined) {
    updateFields.mostSell = updateFields.mostSell === "true" || updateFields.mostSell === "on";
  }

  try {
    await Product.updateOne({ id }, { $set: updateFields });
    res.json({ message: "Product updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err });
  }
});

// ✅ Orders
app.post("/orders", async (req, res) => {
  try {
    const newOrder = new Order(req.body);
    await newOrder.save();
    res.status(201).json({ success: true, message: "Order placed successfully." });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ success: false, message: "Failed to save order." });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});