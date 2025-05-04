import fs from 'fs';
import path from 'path';

// Load and parse the blocklist file
const disposableDomains: string[] = fs
  .readFileSync(path.join(__dirname, 'disposable_email_blocklist.conf'), 'utf-8')
  .split('\n')
  .map(domain => domain.trim().toLowerCase())
  .filter(domain => domain && !domain.startsWith('#'));

/**
 * Checks if an email belongs to a disposable domain
 * @param email - Email address to check
 * @returns true if disposable, false otherwise
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.includes(domain);
}
