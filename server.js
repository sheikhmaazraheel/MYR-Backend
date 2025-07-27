require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const Product = require("./models/Product");
const Order = require("./models/Orders");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy
app.set("trust proxy", 1);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create temporary uploads directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✅ Created uploads directory");
}

// MongoDB Connect
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected, State:", mongoose.connection.readyState))
  .catch(err => console.error("❌ MongoDB Error:", err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..")));

// Prevent caching for API responses
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

// CORS Setup
app.use(cors({
  origin: "https://sheikhmaazraheel.github.io",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Cookie", "Cache-Control"],
  exposedHeaders: ["Set-Cookie"],
}));

// Log all requests
app.use((req, res, next) => {
  console.log("Request:", {
    method: req.method,
    url: req.url,
    origin: req.get("origin"),
    cookies: req.headers.cookie || "No cookies",
    userAgent: req.get("User-Agent"),
  });
  next();
});

// Session Config
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: "sessions",
});
sessionStore.on("error", (err) => console.error("Session Store Error:", err));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      path: "/",
      domain: null,
    },
  })
);

// Dummy Admin
const ADMIN = {
  username: process.env.ADMIN_USER,
  password: process.env.ADMIN_HASH,
};

// Authentication Middleware
function isAuthenticated(req, res, next) {
  console.log("isAuthenticated:", {
    sessionID: req.sessionID,
    loggedIn: req.session.loggedIn,
    cookies: req.headers.cookie || "No cookies",
    userAgent: req.get("User-Agent"),
  });
  if (req.session.loggedIn) return next();
  res.status(401).json({ authenticated: false });
}

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log("Login attempt:", {
    username,
    sessionID: req.sessionID,
    cookies: req.headers.cookie || "No cookies",
    userAgent: req.get("User-Agent"),
  });
  if (username === ADMIN.username) {
    const match = await bcrypt.compare(password, ADMIN.password);
    if (match) {
      req.session.loggedIn = true;
      console.log("Session set:", {
        sessionID: req.sessionID,
        session: req.session,
        setCookie: `connect.sid=${req.sessionID}; HttpOnly; Secure; SameSite=None; Path=/`,
      });
      res.set("Set-Cookie", `connect.sid=${req.sessionID}; HttpOnly; Secure; SameSite=None; Path=/`);
      return res.json({ success: true });
    }
  }
  res.json({ success: false, message: "Invalid credentials" });
});

// Logout Route
app.post("/logout", (req, res) => {
  console.log("Logout:", {
    sessionID: req.sessionID,
    cookies: req.headers.cookie || "No cookies",
    userAgent: req.get("User-Agent"),
  });
  req.session.destroy(err => {
    if (err) {
      console.error("Logout Error:", err);
      return res.status(500).json({ success: false });
    }
    res.clearCookie("connect.sid", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
    });
    res.json({ success: true });
  });
});

// Check-auth Route
app.get("/check-auth", (req, res) => {
  console.log("Check-auth:", {
    sessionID: req.sessionID,
    loggedIn: req.session.loggedIn,
    cookies: req.headers.cookie || "No cookies",
    userAgent: req.get("User-Agent"),
  });
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
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// Multer Error Handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer Error:", err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image exceeds 10MB limit" });
    }
    return res.status(400).json({ message: "File upload error" });
  }
  next(err);
});

// Upload Product
app.post("/upload", isAuthenticated, upload.single("image"), async (req, res) => {
  try {
    const { id, name, price, discount, category, mostSell, available, colors, sizes } = req.body;

    if (!id || !name || !price || !category) {
      console.error("Validation Error: Missing required fields", { id, name, price, category });
      return res.status(400).json({ message: "Missing required fields: id, name, price, category" });
    }

    if (req.file && req.file.size > 10 * 1024 * 1024) {
      console.error("File too large:", { size: req.file.size });
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
      return res.status(400).json({ message: "Image exceeds 10MB limit" });
    }

    let imageUrl = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "myr-surgical",
        transformation: [
          { width: 800, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "auto" },
        ],
      });
      imageUrl = result.secure_url;
      console.log("Image uploaded to Cloudinary:", { url: imageUrl, size: result.bytes });
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
    }

    const product = new Product({
      id,
      name,
      price: parseFloat(price),
      discount: discount ? parseFloat(discount) : 0,
      category,
      mostSell: mostSell === "true",
      available: available === "true",
      image: imageUrl,
      colors: colors ? colors.split(",").map(c => c.trim()).filter(Boolean) : [],
      sizes: sizes ? sizes.split(",").map(s => s.trim()).filter(Boolean) : [],
    });

    await product.save();
    console.log("Product saved:", { id, name, image: imageUrl });
    res.json({ message: "Product saved", product });
  } catch (err) {
    console.error("Upload Error:", {
      message: err.message,
      stack: err.stack,
      body: req.body,
      file: req.file,
    });
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
    }
    res.status(500).json({ message: "Failed to upload product", error: err.message });
  }
});

// Get All Products
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error("Products Error:", err);
    res.status(500).json({ message: "Error loading products" });
  }
});

// Update Product
app.put("/products/:id", isAuthenticated, upload.single("image"), async (req, res) => {
  try {
    const { id, name, price, discount, category, mostSell, available, colors, sizes } = req.body;

    if (req.file && req.file.size > 10 * 1024 * 1024) {
      console.error("File too large:", { size: req.file.size });
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
      return res.status(400).json({ message: "Image exceeds 10MB limit" });
    }

    let imageUrl = req.body.image;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "myr-surgical",
        transformation: [
          { width: 800, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "auto" },
        ],
      });
      imageUrl = result.secure_url;
      console.log("Image uploaded to Cloudinary:", { url: imageUrl, size: result.bytes });
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
    }

    const updateFields = {
      id,
      name,
      price: parseFloat(price),
      discount: discount ? parseFloat(discount) : 0,
      category,
      mostSell: mostSell === "true",
      available: available === "true",
      image: imageUrl,
      colors: colors ? colors.split(",").map(c => c.trim()).filter(Boolean) : [],
      sizes: sizes ? sizes.split(",").map(s => s.trim()).filter(Boolean) : [],
    };

    await Product.updateOne({ id: req.params.id }, { $set: updateFields });
    console.log("Product updated:", { id: req.params.id });
    res.json({ message: "Product updated" });
  } catch (err) {
    console.error("Update Error:", err);
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
    }
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// Delete Product
app.delete("/products/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ message: "Not found" });
    console.log("Product deleted:", { id: req.params.id });
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// Submit Order
app.post("/orders", async (req, res) => {
  try {
    const newOrder = new Order(req.body);
    await newOrder.save();
    res.status(201).json({ success: true, message: "Order placed", orderId: newOrder._id });
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json({ success: false, message: "Order failed" });
  }
});

// Get All Orders
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    console.error("Orders Error:", err);
    res.status(500).json({ message: "Fetch failed" });
  }
});

// Get Single Order
app.get("/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.json(order);
  } catch (err) {
    console.error("Order Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch order" });
  }
});

// Delete Order
app.delete("/orders/:id", isAuthenticated, async (req, res) => {
  try {
    const deleted = await Order.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Order not found" });
    console.log("Order deleted:", { id: req.params.id });
    res.json({ message: "Order deleted" });
  } catch (err) {
    console.error("Delete Order Error:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

// Admin Panel
app.get("/admin.html", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin.html"));
});

// Default
app.get("/", (req, res) => res.send("Server is running ✅"));

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});