// src/services/emailService.ts
import nodemailer from "nodemailer";
import { generateTicketEmailHTML } from "../templates/ticketEmailTemplate";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendTicketEmail({
  to,
  ticketName,
  date,
  qrImageDataUrl,
  clubName,
}: {
  to: string;
  ticketName: string;
  date: string;
  qrImageDataUrl: string;
  clubName: string;
}) {
  const html = generateTicketEmailHTML({
    ticketName,
    date,
    email: to,
    qrImageDataUrl,
    clubName,
  });

  await transporter.sendMail({
    from: `"NightLife Tickets" <${process.env.SMTP_USER}>`,
    to,
    subject: `🎟️ Your Ticket for ${ticketName}`,
    html,
  });
}
