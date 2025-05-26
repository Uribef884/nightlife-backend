// src/templates/ticketEmailTemplate.ts
export function generateTicketEmailHTML({
  ticketName,
  date,
  email,
  qrImageDataUrl,
  clubName,
}: {
  ticketName: string;
  date: string;
  email: string;
  qrImageDataUrl: string;
  clubName: string;
}): string {
  return `
  <div style="font-family: Arial, sans-serif; background: #111; color: white; padding: 20px; border-radius: 12px; max-width: 500px; margin: auto;">
    <h1 style="text-align: center; font-size: 28px;">🎟️ Your NightLife Ticket</h1>
    <p><strong>Event:</strong> ${ticketName}</p>
    <p><strong>Club:</strong> ${clubName}</p>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Email:</strong> ${email}</p>

    <div style="text-align: center; margin: 30px 0;">
      <img src="${qrImageDataUrl}" alt="QR Code" style="width: 200px;" />
    </div>

    <p style="font-size: 12px; color: #aaa;">📌 Present this QR code at the entrance. This code is valid only for the specified date and club.</p>
    <p style="font-size: 12px; color: #777;">© 2025 NightLife Inc. | All rights reserved</p>
  </div>
  `;
}
