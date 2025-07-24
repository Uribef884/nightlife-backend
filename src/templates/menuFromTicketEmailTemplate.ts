export function generateMenuFromTicketEmailHTML({
  ticketName,
  date,
  email,
  qrImageDataUrl,
  clubName,
  items,
  index,
  total,
}: {
  ticketName: string;
  date: string;
  email: string;
  qrImageDataUrl: string;
  clubName: string;
  items: Array<{
    name: string;
    variant: string | null;
    quantity: number;
  }>;
  index?: number;
  total?: number;
}): string {
  const rows = items.map(
    (item) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ccc;">${item.name}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${item.variant || "-"}</td>
        <td style="padding: 8px; border: 1px solid #ccc; text-align: center;">${item.quantity}</td>
      </tr>
    `
  ).join("");

  return `
  <div style="font-family: Arial, sans-serif; background: #111; color: white; padding: 20px; border-radius: 12px; max-width: 500px; margin: auto;">
    <h1 style="text-align: center; font-size: 28px;">🍹 Your Included Menu Items</h1>
    <p><strong>Ticket:</strong> ${ticketName}</p>
    <p><strong>Club:</strong> ${clubName}</p>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Email:</strong> ${email}</p>
    ${
      index != null && total != null
        ? `<p><strong>Bundle:</strong> ${index + 1} of ${total}</p>`
        : ""
    }

    <div style="text-align: center; margin: 30px 0;">
      <img src="${qrImageDataUrl}" alt="Menu QR Code" style="width: 200px;" />
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 20px 0;">
      <thead>
        <tr style="background-color: #333;">
          <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Item</th>
          <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Variant</th>
          <th style="padding: 8px; border: 1px solid #ccc; text-align: center;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="font-size: 12px; color: #aaa;">🍹 Present this QR code to your waiter to redeem your included items. This code is valid only for the specified date and club.</p>
    <p style="font-size: 12px; color: #777;">© 2025 NightLife Inc. | All rights reserved</p>
  </div>
  `;
} 