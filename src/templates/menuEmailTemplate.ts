export function generateMenuEmailHTML({
  clubName,
  qrImageDataUrl,
  items,
  total,
}: {
  clubName: string;
  qrImageDataUrl: string;
  items: Array<{
    name: string;
    variant: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
}): string {
  const rows = items.map(
    (item) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ccc;">${item.name}</td>
        <td style="padding: 8px; border: 1px solid #ccc;">${item.variant || "-"}</td>
        <td style="padding: 8px; border: 1px solid #ccc; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #ccc; text-align: right;">$${Number(item.unitPrice).toFixed(2)}</td>
      </tr>
    `
  ).join("");

  return `
    <div style="font-family: Arial, sans-serif; padding: 1.5rem; max-width: 600px; margin: auto;">
      <h2 style="color: #111">🍹 Your NightLife Menu Purchase</h2>
      <p>Thank you for your order at <strong>${clubName}</strong>. Show the QR below to your waiter:</p>

      <div style="text-align: center; margin: 20px 0;">
        <img src="${qrImageDataUrl}" alt="Menu QR" width="180" height="180" />
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Item</th>
            <th style="padding: 8px; border: 1px solid #ccc; text-align: left;">Variant</th>
            <th style="padding: 8px; border: 1px solid #ccc; text-align: center;">Qty</th>
            <th style="padding: 8px; border: 1px solid #ccc; text-align: right;">Unit Price</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding: 8px; text-align: right;"><strong>Total:</strong></td>
            <td style="padding: 8px; text-align: right;"><strong>$${total.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <p style="margin-top: 1rem; font-size: 13px; color: #666;">
        This QR is valid for one-time use only. Please show it at your table. Thank you for choosing NightLife.
      </p>
    </div>
  `;
}
