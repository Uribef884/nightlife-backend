import nodemailer from "nodemailer";
import { generateTicketEmailHTML } from "../templates/ticketEmailTemplate";

// Define a reusable type for the ticket email payload
type TicketEmailPayload = {
  to: string;
  ticketName: string;
  date: string;
  qrImageDataUrl: string;
  clubName: string;
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends a styled ticket email with QR code to the user.
 * @param payload - TicketEmailPayload including recipient and ticket details
 */
export async function sendTicketEmail(payload: TicketEmailPayload) {
  const html = generateTicketEmailHTML({
    ...payload,
    email: payload.to, // Used inside the HTML template
  });

  await transporter.sendMail({
    from: `"NightLife Tickets" <${process.env.SMTP_USER}>`,
    to: payload.to,
    subject: `🎟️ Your Ticket for ${payload.ticketName}`,
    html,
  });
}
