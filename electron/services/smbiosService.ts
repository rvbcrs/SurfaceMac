/**
 * SMBIOS Generation Service
 * 
 * Generates Apple-compatible serial numbers, MLB, and UUID for Hackintosh.
 * Implements the same algorithm as GenSMBIOS/macserial.
 */

// Base34 character set (excludes O and I to avoid confusion with 0 and 1)
const BASE34_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

// Manufacturing location codes (common Apple factory codes)
const LOCATION_CODES = [
  'C02', 'C07', 'C17', 'C1M', 'C2V', 'CK2', 'D25', 'DQG', 'DYJ',
  'F5K', 'F5V', 'F17', 'FC2', 'FVF', 'G8W', 'GQ6', 'H2W', 'J9G'
];

// Model codes for supported Mac models
const MODEL_CODES: Record<string, string> = {
  'MacBookAir9,1': 'GQ6Y',      // 2020 MacBook Air (Ice Lake)
  'MacBookPro16,2': 'JWQ6',     // 2020 MacBook Pro 13" (Ice Lake)
  'MacBookPro16,1': 'HDWP',     // 2019 MacBook Pro 16"
  'iMac20,1': 'PN5Y',           // 2020 iMac 27"
  'iMac20,2': 'PN5Y',           // 2020 iMac 27" (high-end)
};

export interface SMBIOSData {
  model: string;
  serial: string;
  mlb: string;
  uuid: string;
}

/**
 * Generate a random character from the Base34 set
 */
function randomBase34(): string {
  return BASE34_CHARS[Math.floor(Math.random() * BASE34_CHARS.length)];
}

/**
 * Generate a random alphanumeric string
 */
function randomAlphanumeric(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += randomBase34();
  }
  return result;
}

/**
 * Generate a random manufacturing location code
 */
function randomLocation(): string {
  return LOCATION_CODES[Math.floor(Math.random() * LOCATION_CODES.length)];
}

/**
 * Generate an Apple-format 12-character serial number
 * 
 * Format: LLLYWSSSCCCC
 * - LLL: Manufacturing location (3 chars)
 * - Y: Year code (1 char, Base34)
 * - W: Week code (1 char, Base34)
 * - SSS: Unique device identifier (3 chars)
 * - CCCC: Model code (4 chars)
 */
export function generateSerial(model: string): string {
  const modelCode = MODEL_CODES[model];
  if (!modelCode) {
    throw new Error(`Unknown model: ${model}. Supported: ${Object.keys(MODEL_CODES).join(', ')}`);
  }

  const location = randomLocation();
  const yearCode = randomBase34();
  const weekCode = randomBase34();
  const deviceId = randomAlphanumeric(3);

  return `${location}${yearCode}${weekCode}${deviceId}${modelCode}`;
}

/**
 * Generate an Apple-format 17-character MLB (Board Serial)
 * 
 * Format: LLLYYWWSSSSSCCCC + checksum
 * Similar to serial but longer with additional chars
 */
export function generateMLB(model: string): string {
  const modelCode = MODEL_CODES[model];
  if (!modelCode) {
    throw new Error(`Unknown model: ${model}`);
  }

  const location = randomLocation();
  const yearWeek = randomAlphanumeric(4);
  const deviceId = randomAlphanumeric(5);
  const checksum = randomBase34();

  return `${location}${yearWeek}${deviceId}${modelCode}${checksum}`;
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  // Standard UUID v4 format
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Generate complete SMBIOS data for a given Mac model
 */
export function generateSMBIOS(model: string = 'MacBookAir9,1'): SMBIOSData {
  return {
    model,
    serial: generateSerial(model),
    mlb: generateMLB(model),
    uuid: generateUUID(),
  };
}

/**
 * Validate serial number format
 */
export function validateSerial(serial: string): boolean {
  // Must be exactly 12 characters
  if (serial.length !== 12) return false;
  
  // Must only contain Base34 characters
  for (const char of serial) {
    if (!BASE34_CHARS.includes(char)) return false;
  }
  
  return true;
}

/**
 * Validate MLB format
 */
export function validateMLB(mlb: string): boolean {
  // Must be exactly 17 characters
  if (mlb.length !== 17) return false;
  
  // Must only contain Base34 characters
  for (const char of mlb) {
    if (!BASE34_CHARS.includes(char)) return false;
  }
  
  return true;
}

export default {
  generateSMBIOS,
  generateSerial,
  generateMLB,
  generateUUID,
  validateSerial,
  validateMLB,
};
