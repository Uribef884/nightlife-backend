// src/services/emailService.ts
import nodemailer from "nodemailer";
import { generateTicketEmailHTML } from "../templates/ticketEmailTemplate";

type TicketEmailPayload = {
  to: string;
  ticketName: string;
  date: string;
  qrImageDataUrl: string;
  clubName: string;
  index?: number;
  total?: number;
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
