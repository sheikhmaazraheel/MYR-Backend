import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true, // MUST be true for 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
});


transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP connection failed:", error.message);
  } else {
    console.log("SMTP server is ready to send emails");
  }
});


/**
 * Sends order notification email to admin
 */
export async function sendOrderEmail(order) {
  const itemsHtml = order.cartItems
    .map(
      (item) => `
        <li>
          ${item.name} × ${item.quantity} — Rs ${item.price}
        </li>`
    )
    .join("");

  await transporter.sendMail({
    from: `"MYR Surgical Orders" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `New Order Received — ${order.orderId}`,
    html: `
      <h2>New Order Received</h2>

      <p><strong>Order ID:</strong> ${order.orderId}</p>
      <p><strong>Name:</strong> ${order.name}</p>
      <p><strong>Contact:</strong> ${order.contact}</p>
      <p><strong>City:</strong> ${order.city}</p>
      <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>

      <h3>Order Items</h3>
      <ul>
        ${itemsHtml}
      </ul>

      <h3>Total Amount: Rs ${order.totalAmount}</h3>
    `,
  });
}
