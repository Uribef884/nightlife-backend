/**
 * Validates that an image URL is from our trusted S3 bucket
 * @param imageUrl - The image URL to validate
 * @returns true if valid, false otherwise
 */
export function validateImageUrl(imageUrl: string | null | undefined): boolean {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return false;
  }
  
  // Check if URL starts with our trusted S3 bucket (with or without region)
  return imageUrl.startsWith("https://nightlife-files.s3.amazonaws.com/") ||
         imageUrl.startsWith("https://nightlife-files.s3.us-east-1.amazonaws.com/");
}

/**
 * Validates image URL and returns error response if invalid
 * @param imageUrl - The image URL to validate
 * @param res - Express response object
 * @returns true if valid, false if invalid (response already sent)
 */
export function validateImageUrlWithResponse(imageUrl: string | null | undefined, res: any): boolean {
  if (!validateImageUrl(imageUrl)) {
    res.status(400).json({ error: "Invalid image URL" });
    return false;
  }
  return true;
} 