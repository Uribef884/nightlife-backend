export const trustedEmailDomains = [
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "eafit.edu.co",
    // Add more trusted domains here
  ];
  
  export function isTrustedEmail(email: string): boolean {
    const domain = email.split("@")[1];
    return trustedEmailDomains.includes(domain);
  }
