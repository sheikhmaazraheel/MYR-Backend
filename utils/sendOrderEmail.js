import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
