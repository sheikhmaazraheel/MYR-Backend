require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const session = require("express-session");
const cloudinary = require("cloudinary").v2;
const MongoStore = require("connect-mongo");
const fs = require("fs");
const Product = require("./models/Product");
const Order = require("./models/Orders");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy
app.set("trust proxy", 1);

// MongoDB Connect
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected, State:", mongoose.connection.readyState))
  .catch(err => console.error("❌ MongoDB Error:", err));
// Cloudinary Config
  cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// CORS Setup
app.use(cors({
  origin: "https://sheikhmaazraheel.github.io",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"],
  exposedHeaders: ["Set-Cookie"],
}));

// Log all requests
app.use((req, res, next) => {
  console.log("Request:", {
    method: req.method,
    url: req.url,
    origin: req.get("origin"),
    cookies: req.headers.cookie || "No cookies",
    withCredentials: req.get("withCredentials"),
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
      maxAge: 1000 * 60 * 60,
      path: "/",
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
  });
  if (req.session.loggedIn) return next();
  res.status(401).json({ authenticated: false });
}

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log("Login attempt:", { username, sessionID: req.sessionID });
  if (username === ADMIN.username) {
    const match = await bcrypt.compare(password, ADMIN.password);
    if (match) {
      req.session.loggedIn = true;
      console.log("Session set:", {
        sessionID: req.sessionID,
        session: req.session,
        setCookie: `connect.sid=${req.sessionID}; HttpOnly; Secure; SameSite=None; Path=/`,
      });
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

// Check-auth Route
app.get("/check-auth", (req, res) => {
  console.log("Check-auth:", {
    sessionID: req.sessionID,
    loggedIn: req.session.loggedIn,
    cookies: req.headers.cookie || "No cookies",
  });
  if (req.session.loggedIn) {
    return res.json({ authenticated: true });
  } else {
    return res.status(401).json({ authenticated: false });
  }
});

// Multer Config and other routes (unchanged)
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
    const { id, name, price, discount, category, mostSell, available, colors, sizes } = req.body;

    // Validate required fields
    if (!id || !name || !price || !category) {
      console.error("Validation Error: Missing required fields", { id, name, price, category });
      return res.status(400).json({ message: "Missing required fields: id, name, price, category" });
    }

    // Process form data
    const colorsArray = colors ? colors.split(",").map(c => c.trim()).filter(Boolean) : [];
    const sizesArray = sizes ? sizes.split(",").map(s => s.trim()).filter(Boolean) : [];
    const image = req.file?.filename || null;
    // Upload image to Cloudinary if provided
    
    let imageUrl = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "myr-surgical",
      });
      imageUrl = result.secure_url;
      console.log("Image uploaded to Cloudinary:", imageUrl);
      // Delete local file
      fs.unlink(req.file.path, err => {
        if (err) console.error("Failed to delete local file:", err);
      });
    }
    // Create product
    const product = new Product({
      id : id.trim(),
      name : name.trim(),
      price: parseFloat(price),
      discount: discount ? parseFloat(discount) : 0,
      category,
      mostSell: mostSell === "true",
      available: available === "true",
      image:imageUrl,
      colors: colorsArray,
      sizes: sizesArray,
    });

    // Save to MongoDB
    await product.save();
    console.log("Product saved:", { id, name });
    res.json({ message: "Product saved", product });
  } catch (err) {
    console.error("Upload Error:", {
      message: err.message,
      stack: err.stack,
      body: req.body,
      file: req.file,
    });
    res.status(500).json({ message: "Failed to upload product", error: err.message });
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
app.put("/products/:id", isAuthenticated, upload.single("image"), async (req, res) => {
  try {
    const { id, name, price, discount, category, mostSell, available, colors, sizes } = req.body;

    // Upload new image to Cloudinary if provided
    let imageUrl = req.body.image; // Keep existing image if no new file
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "myr-surgical",
      });
      imageUrl = result.secure_url;
      console.log("Image uploaded to Cloudinary:", imageUrl);
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

// Get All Orders
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
  res.sendFile(path.join(__dirname, "..", "admin.html"));
});

// Default
app.get("/", (req, res) => res.send("Server is running ✅"));

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

