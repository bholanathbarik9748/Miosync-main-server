/**
 * Phone Number Utility Functions
 * 
 * Provides validation and normalization for phone numbers
 * to ensure compatibility with WhatsApp Business API (E.164 format)
 */

export interface PhoneNumberValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates and normalizes a phone number to E.164 format
 * 
 * @param phoneNumber - Raw phone number input
 * @param defaultCountryCode - Default country code to use if none provided (default: '91' for India)
 * @returns Validation result with normalized number
 */
export function validateAndNormalizePhoneNumber(
  phoneNumber: string | null | undefined,
  defaultCountryCode = '91',
): PhoneNumberValidationResult {
  // Check for null/undefined
  if (!phoneNumber) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number is required',
    };
  }

  // Convert to string and trim
  let normalized = String(phoneNumber).trim();

  // Remove all non-digit characters except +
  normalized = normalized.replace(/[^\d+]/g, '');

  // Check if empty after cleaning
  if (!normalized) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number is empty after cleaning',
    };
  }

  // Remove leading zeros (common input error)
  if (normalized.startsWith('0') && !normalized.startsWith('+')) {
    normalized = normalized.substring(1);
  }

  // Add + prefix if missing
  if (!normalized.startsWith('+')) {
    normalized = `+${defaultCountryCode}${normalized}`;
  }

  // Validate E.164 format: + followed by 10-15 digits
  const e164Regex = /^\+\d{10,15}$/;
  if (!e164Regex.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: `Invalid E.164 format. Must be +{country_code}{number} (10-15 digits). Got: ${normalized}`,
    };
  }

  // Additional validation: Check minimum length for Indian numbers
  if (normalized.startsWith('+91') && normalized.length !== 13) {
    return {
      isValid: false,
      normalized,
      error: `Invalid Indian phone number length. Expected 13 characters (+91XXXXXXXXXX), got ${normalized.length}`,
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

/**
 * Batch validates multiple phone numbers
 * 
 * @param phoneNumbers - Array of phone numbers to validate
 * @param defaultCountryCode - Default country code
 * @returns Object with valid and invalid phone numbers
 */
export function batchValidatePhoneNumbers(
  phoneNumbers: Array<string | null | undefined>,
  defaultCountryCode = '91',
): {
  valid: Array<{ original: string; normalized: string }>;
  invalid: Array<{ original: string; error: string }>;
} {
  const valid: Array<{ original: string; normalized: string }> = [];
  const invalid: Array<{ original: string; error: string }> = [];

  for (const phoneNumber of phoneNumbers) {
    if (!phoneNumber) {
      invalid.push({
        original: String(phoneNumber),
        error: 'Phone number is null or undefined',
      });
      continue;
    }

    const result = validateAndNormalizePhoneNumber(
      phoneNumber,
      defaultCountryCode,
    );

    if (result.isValid) {
      valid.push({
        original: String(phoneNumber),
        normalized: result.normalized,
      });
    } else {
      invalid.push({
        original: String(phoneNumber),
        error: result.error || 'Unknown error',
      });
    }
  }

  return { valid, invalid };
}

/**
 * Formats a phone number for display (e.g., +91 9123456789)
 * 
 * @param phoneNumber - Phone number in E.164 format
 * @returns Formatted phone number for display
 */
export function formatPhoneNumberForDisplay(phoneNumber: string): string {
  if (!phoneNumber) return '';

  // Already in E.164 format
  if (phoneNumber.startsWith('+')) {
    // Add space after country code for Indian numbers
    if (phoneNumber.startsWith('+91') && phoneNumber.length === 13) {
      return `${phoneNumber.substring(0, 3)} ${phoneNumber.substring(3)}`;
    }
    return phoneNumber;
  }

  return phoneNumber;
}

/**
 * Extracts country code from E.164 phone number
 * 
 * @param phoneNumber - Phone number in E.164 format
 * @returns Country code or null if invalid
 */
export function extractCountryCode(phoneNumber: string): string | null {
  if (!phoneNumber || !phoneNumber.startsWith('+')) {
    return null;
  }

  // Common country codes
  const commonCodes = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98'];

  // Try to match known country codes
  for (const code of commonCodes) {
    if (phoneNumber.startsWith(`+${code}`)) {
      return code;
    }
  }

  // Fallback: assume first 1-3 digits after + are country code
  const match = phoneNumber.match(/^\+(\d{1,3})/);
  return match ? match[1] : null;
}

