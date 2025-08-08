import crypto from 'crypto';
import { Request, Response } from 'express';
import { getEventKey } from '../config/wompi';
import { getValueByPath } from '../utils/wompiUtils';

/**
 * Securely handle Wompi webhook by verifying checksum
 */
export const handleWompiWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const eventIntegrity = getEventKey();
    const signature = req.body.signature;

    if (!signature?.checksum || !Array.isArray(signature.properties)) {
      res.status(400).json({ success: false, message: 'Invalid signature format' });
      return;
    }

    // Extract values relative to req.body.data
    const valuesToHash = signature.properties.map((prop: string) =>
      getValueByPath(req.body.data, prop)
    );

    const rawString = valuesToHash.join('') + req.body.timestamp + eventIntegrity;
    const computedChecksum = crypto.createHash('sha256').update(rawString).digest('hex').toLocaleLowerCase();
    const received = signature.checksum.toLowerCase();

    console.log('[WOMPI WEBHOOK] Processing transaction:', req.body.data.transaction.id);
    console.log('🧩 Fields:', signature.properties);
    console.log('🧩 Values:', valuesToHash);
    console.log('⏱️ Timestamp:', req.body.timestamp);
    console.log('🔐 Integrity key:', eventIntegrity);
    console.log('🔗 Raw string:', rawString);
    console.log('✅ Computed checksum:', computedChecksum);
    console.log('📬 Received checksum:', received);

    if (computedChecksum != received) {
      console.warn('[WOMPI WEBHOOK] ❌ Invalid checksum');
      res.status(403).json({ success: false, message: 'Invalid checksum' });
      return;
    }

    console.log('✅ Valid Wompi webhook');
    console.log('🎟️ Transaction:', req.body.data.transaction);

    // TODO: Save or update transaction in DB

    res.status(200).json({ success: true });
    return;
  } catch (err) {
    console.error('❌ Error in Wompi webhook:', err);
    res.status(500).json({ success: false });
    return;
  }
};
