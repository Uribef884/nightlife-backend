import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

const storage = multer.memoryStorage();

// General file filter for all uploads
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedImageTypes = process.env.ALLOWED_IMAGE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];
  
  const allowedPdfTypes = process.env.ALLOWED_PDF_TYPES?.split(',') || [
    'application/pdf'
  ];

  const allAllowedTypes = [...allowedImageTypes, ...allowedPdfTypes];

  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type '${file.mimetype}'. Allowed types: ${allAllowedTypes.join(', ')}`));
  }
};

// Base multer configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_PDF_SIZE_MB || '10') * 1024 * 1024, // Convert MB to bytes
  },
});

// Custom error handler for Multer errors
export const handleMulterError = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ 
        error: `File too large. Maximum size is ${process.env.MAX_PDF_SIZE_MB || '10'}MB.` 
      });
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ 
        error: `Unexpected field name "${error.field}". For PDF uploads use field name "pdf", for images use field name "image".` 
      });
    } else {
      res.status(400).json({ 
        error: `Upload error: ${error.message}` 
      });
    }
  } else {
    next(error);
  }
};

// Specific validation middleware for PDF files only
export const validatePdfUpload = (req: Request, res: Response, next: NextFunction): void => {
  // Check if file exists
  if (!req.file) {
    res.status(400).json({ 
      error: 'No file uploaded. Please select a PDF file to upload. Make sure the field name is "pdf".' 
    });
    return;
  }

  // Check if it's a PDF
  if (req.file.mimetype !== 'application/pdf') {
    res.status(400).json({ 
      error: `Invalid file type '${req.file.mimetype}'. Only PDF files are allowed for menu uploads.` 
    });
    return;
  }

  // Check file size (additional check for PDFs)
  const maxPdfSize = parseInt(process.env.MAX_PDF_SIZE_MB || '10') * 1024 * 1024;
  if (req.file.size > maxPdfSize) {
    res.status(400).json({ 
      error: `File too large. Maximum size for PDF files is ${process.env.MAX_PDF_SIZE_MB || '10'}MB.` 
    });
    return;
  }

  next();
};

// Specific validation middleware for image files only
export const validateImageUpload = (req: Request, res: Response, next: NextFunction): void => {
  // Check if file exists
  if (!req.file) {
    res.status(400).json({ 
      error: 'No file uploaded. Please select an image file to upload. Make sure the field name is "image".' 
    });
    return;
  }

  const allowedImageTypes = process.env.ALLOWED_IMAGE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  // Check if it's an allowed image type
  if (!allowedImageTypes.includes(req.file.mimetype)) {
    res.status(400).json({ 
      error: `Invalid file type '${req.file.mimetype}'. Allowed image types: ${allowedImageTypes.join(', ')}.` 
    });
    return;
  }

  // Check file size (additional check for images)
  const maxImageSize = parseInt(process.env.MAX_IMAGE_SIZE_MB || '5') * 1024 * 1024;
  if (req.file.size > maxImageSize) {
    res.status(400).json({ 
      error: `File too large. Maximum size for image files is ${process.env.MAX_IMAGE_SIZE_MB || '5'}MB.` 
    });
    return;
  }

  next();
};

// General empty request validator
export const validateFileUpload = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.file) {
    res.status(400).json({ 
      error: 'No file uploaded. Please select a file to upload. Check that you are using the correct field name for your upload type.' 
    });
    return;
  }
  next();
}; 