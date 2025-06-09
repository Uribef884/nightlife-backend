import nodemailer from "nodemailer";
import { generateTicketEmailHTML } from "../templates/ticketEmailTemplate";
import { generateMenuEmailHTML } from "../templates/menuEmailTemplate";

type TicketEmailPayload = {
  to: string;
  ticketName: string;
  date: string;
  qrImageDataUrl: string;
  clubName: string;
  index?: number;
  total?: number;
};

type MenuEmailPayload = {
  to: string;
  qrImageDataUrl: string;
  clubName: string;
  items: Array<{
    name: string;
    variant: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
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

export async function sendTicketEmail(payload: TicketEmailPayload) {
  const html = generateTicketEmailHTML({
    ...payload,
    email: payload.to,
  });

  await transporter.sendMail({
    from: `"NightLife Tickets" <${process.env.SMTP_USER}>`,
    to: payload.to,
    subject: `🎟️ Your Ticket for ${payload.ticketName}`,
    html,
  });
}

export async function sendMenuEmail(payload: MenuEmailPayload) {
  const html = generateMenuEmailHTML(payload);

  await transporter.sendMail({
    from: `"NightLife Menu" <${process.env.SMTP_USER}>`,
    to: payload.to,
    subject: `🍹 Your Menu QR from ${payload.clubName}`,
    html,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_BASE_URL}/reset-password?token=${token}`;

  const html = `
    <div style="font-family: sans-serif; padding: 1rem;">
      <h2>Reset your NightLife password</h2>
      <p>Click the link below to set a new password:</p>
      <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
      <p>This link will expire in 15 minutes. If you didn’t request this, you can ignore it.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"NightLife Support" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Reset Your NightLife Password",
    html,
  });
}
