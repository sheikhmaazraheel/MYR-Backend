import axios from "axios";

export async function sendWhatsAppTemplate({
  to,
  templateName,
  language = "en_US",
  components
}) {
  // Basic validation
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set in env");
  if (!token) throw new Error("WHATSAPP_TOKEN is not set in env");
  if (!to) throw new Error("'to' phone number is required");
  if (!templateName) throw new Error("templateName is required");

  // Normalize 'to' - remove non-digit characters
  const normalizedTo = String(to).replace(/[^0-9]/g, "");

  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: normalizedTo,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components
    }
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });
    return res.data;
  } catch (err) {
    // Attach request info for easier debugging
    const safeErr = err?.response?.data || err.message || err;
    console.error("sendWhatsAppTemplate error:", {
      url,
      to: normalizedTo,
      templateName,
      components,
      error: safeErr
    });
    throw err;
  }
}
