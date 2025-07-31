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
const PDFDocument = require("pdfkit");
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
app.post("/upload", /*isAuthenticated,*/ upload.single("image"), async (req, res) => {
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
app.put("/products/:id",/*isAuthenticated,*/ upload.single("image"), async (req, res) => {
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
app.delete("/products/:id", /*isAuthenticated,*/ async (req, res) => {
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
    const orderData = req.body;
    console.log("Received order data:", orderData);

    // Validate required fields
    const requiredFields = [
      "orderId",
      "name",
      "contact",
      "city",
      "houseNo",
      "Block",
      "Area",
      "landmark",
      "paymentMethod",
      "cartItems",
      "totalAmount",
    ];
    for (const field of requiredFields) {
      if (!orderData[field]) {
        console.error("Validation Error: Missing", field);
        return res.status(400).json({ success: false, message: `Missing required field: ${field}` });
      }
    }

    // Validate cartItems
    if (!Array.isArray(orderData.cartItems) || orderData.cartItems.length === 0) {
      console.error("Validation Error: Invalid cartItems");
      return res.status(400).json({ success: false, message: "Cart items must be a non-empty array" });
    }

    for (const item of orderData.cartItems) {
      if (!item.name || !item.price || !item.quantity) {
        console.error("Validation Error: Invalid cart item", item);
        return res.status(400).json({ success: false, message: "Each cart item must have name, price, and quantity" });
      }
    }

    // Check for duplicate orderId
    const existingOrder = await Order.findOne({ orderId: orderData.orderId });
    if (existingOrder) {
      console.error("Validation Error: Duplicate orderId", orderData.orderId);
      return res.status(400).json({ success: false, message: "Order ID already exists" });
    }

    const newOrder = new Order(orderData);
    await newOrder.save();
    console.log("Order saved:", { id: newOrder._id, orderId: newOrder.orderId });
    res.status(201).json({ success: true, message: "Order placed", orderId: newOrder._id });
  } catch (err) {
    console.error("Order Error:", { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: `Order failed: ${err.message}` });
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
app.delete("/orders/:id", /*isAuthenticated,*/ async (req, res) => {
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

// Health Check Endpoint
app.get("/health", async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ status: "OK", mongodb: mongoose.connection.readyState });
  } catch (err) {
    console.error("Health Check Error:", err);
    res.status(503).json({ status: "ERROR", message: "MongoDB connection failed" });
  }
});

// Generate Receipt
app.get("/orders/:id/receipt", async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log("Generating receipt for order:", { orderId });

    // Validate ObjectId
    if (!mongoose.isValidObjectId(orderId)) {
      console.error("Invalid ObjectId:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.error("Order not found:", orderId);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const doc = new PDFDocument({
      size: "A5",
      layout: "landscape",
      margins: { top: 30, bottom: 30, left: 30, right: 30 },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=receipt-${orderId}.pdf`);

    doc.pipe(res);

    // Left Column (Order Details)
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#6366f1")
      .text("MYR SURGICAL", 30, 30);

    doc
      .fontSize(14)
      .fillColor("#9c1f2e")
      .text("Order Details:", 30, 60);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333")
      .text(`Order ID: ${orderId}`, 30, 80);

    // Items Table
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#6366f1")
      .text("S.No", 30, 100)
      .text("Item Name", 60, 100)
      .text("Quantity", 230, 100)
      .text("Amount", 280, 100);

    doc
      .moveTo(30, 115)
      .lineTo(330, 115)
      .strokeColor("#f43f5e")
      .stroke();

    let y = 125;
    order.cartItems.forEach((item, index) => {
      const total = item.price * item.quantity;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#333")
        .text(index + 1, 30, y)
        .text(
          `${item.name}${item.selectedSize ? ` (${item.selectedSize})` : ""}${item.selectedColor ? ` (${item.selectedColor})` : ""}`,
          60, y,
          { width: 160 }
        )
        .text(item.quantity, 230, y)
        .text(`Rs. ${total.toFixed(2)}`, 280, y);
      y += 15;
    });

    // Totals
    const subtotal = order.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryCharges = subtotal > 0 ? 150 : 0;
    const total = order.totalAmount;

    doc
      .moveTo(30, y)
      .lineTo(330, y)
      .strokeColor("#f43f5e")
      .stroke();

    y += 10;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333")
      .text("Sub Total:", 230, y)
      .text(`Rs. ${subtotal.toFixed(2)}`, 280, y);
    y += 15;
    doc
      .text("Delivery Charges:", 192, y)
      .text(`Rs. ${deliveryCharges.toFixed(2)}`, 280, y);
    y += 15;
    doc
      .font("Helvetica-Bold")
      .text("Total Amount:", 205, y)
      .text(`Rs. ${total.toFixed(2)}`, 280, y);

    // Right Column (Customer Details)
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#9c1f2e")
      .text("Customer Details:", 350, 60);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333")
      .text(`Name: ${order.name || "N/A"}`, 350, 80)
      .text(`Contact: ${order.contact || "N/A"}`, 350, 95)
      .text(`Shipping Address: ${order.houseNo || ""}, ${order.Block || ""}, ${order.Area || ""}`, 350, 110, { width: 200 })
      .text(`City: ${order.city || "N/A"}`, 350, 140)
      .text(`Date of Order: ${new Date(order.createdAt).toLocaleDateString()}`, 350, 155)
      .text(`Order ID: ${orderId}`, 350, 170)
      .text(`Payment Method: ${order.paymentMethod || "N/A"}`, 350, 185);

    // Footer
    doc
      .fontSize(8)
      .fillColor("#444")
      .text("Thank you for shopping with MYR Surgical!", 30, 280, { align: "center" })
      .text("© 2025 MYR Surgical. All rights reserved.", 30, 290, { align: "center" });

    doc.end();

    console.log("Generated receipt for order:", { id: orderId });
  } catch (err) {
    console.error("Receipt generation error:", { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: `Failed to generate receipt: ${err.message}` });
  }
});

// Preview Receipt PDF (Inline for browser)
app.get("/orders/:id/receipt/preview", async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log("Previewing receipt for order:", { orderId });

    // Validate ObjectId
    if (!mongoose.isValidObjectId(orderId)) {
      console.error("Invalid ObjectId:", orderId);
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.error("Order not found:", orderId);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const doc = new PDFDocument({
      size: "A5",
      layout: "landscape",
      margins: { top: 30, bottom: 30, left: 30, right: 30 },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=receipt-${orderId}.pdf`);

    doc.pipe(res);

    // Left Column (Order Details)
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#6366f1")
      .text("MYR SURGICAL", 30, 30);

    doc
      .fontSize(14)
      .fillColor("#9c1f2e")
      .text("Order Details:", 30, 60);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333")
      .text(`Order ID: ${orderId}`, 30, 80);

    // Items Table
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#6366f1")
      .text("S.No", 30, 100)
      .text("Item Name", 60, 100)
      .text("Quantity", 230, 100)
      .text("Amount", 280, 100);

    doc
      .moveTo(30, 115)
      .lineTo(330, 115)
      .strokeColor("#f43f5e")
      .stroke();

    let y = 125;
    order.cartItems.forEach((item, index) => {
      const total = item.price * item.quantity;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#333")
        .text(index + 1, 30, y)
        .text(
          `${item.name}${item.selectedSize ? ` (${item.selectedSize})` : ""}${item.selectedColor ? ` (${item.selectedColor})` : ""}`,
          60, y,
          { width: 160 }
        )
        .text(item.quantity, 230, y)
        .text(`Rs. ${total.toFixed(2)}`, 280, y);
      y += 15;
    });

    // Totals
    const subtotal = order.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryCharges = subtotal > 0 ? 150 : 0;
    const total = order.totalAmount;

    doc
      .moveTo(30, y)
      .lineTo(330, y)
      .strokeColor("#f43f5e")
      .stroke();

    y += 10;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333")
      .text("Sub Total:", 230, y)
      .text(`Rs. ${subtotal.toFixed(2)}`, 280, y);
    y += 15;
    doc
      .text("Delivery Charges:", 230, y)
      .text(`Rs. ${deliveryCharges.toFixed(2)}`, 280, y);
    y += 15;
    doc
      .font("Helvetica-Bold")
      .text("Total Amount:", 230, y)
      .text(`Rs. ${total.toFixed(2)}`, 280, y);

    // Right Column (Customer Details)
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#9c1f2e")
      .text("Customer Details:", 350, 60);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333")
      .text(`Name: ${order.name || "N/A"}`, 350, 80)
      .text(`Contact: ${order.contact || "N/A"}`, 350, 95)
      .text(`Shipping Address: ${order.houseNo || ""}, ${order.Block || ""}, ${order.Area || ""}`, 350, 110, { width: 200 })
      .text(`City: ${order.city || "N/A"}`, 350, 140)
      .text(`Date of Order: ${new Date(order.createdAt).toLocaleDateString()}`, 350, 155)
      .text(`Order ID: ${orderId}`, 350, 170)
      .text(`Payment Method: ${order.paymentMethod || "N/A"}`, 350, 185);

    // Footer
    doc
      .fontSize(8)
      .fillColor("#444")
      .text("Thank you for shopping with MYR Surgical!", 30, 280, { align: "center" })
      .text("© 2025 MYR Surgical. All rights reserved.", 30, 290, { align: "center" });

    doc.end();

    console.log("Previewed receipt for order:", { id: orderId });
  } catch (err) {
    console.error("Receipt preview error:", { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: `Failed to preview receipt: ${err.message}` });
  }
});

// Admin Panel
app.get("/admin.html", /*isAuthenticated,*/ (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin.html"));
});



// Default
app.get("/", (req, res) => res.send("Server is running ✅"));

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});