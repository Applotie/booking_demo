import { isDateKey, isLocalDateTime } from './dates.js';

export const MAX_AMOUNT = 100000000; // ₹10 crore – guards against typos

export function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

export function cleanText(value, max = 500) {
  return isBlank(value) ? '' : String(value).trim().replace(/\s+/g, ' ').slice(0, max);
}

export function cleanMultiline(value, max = 2000) {
  return isBlank(value) ? '' : String(value).trim().slice(0, max);
}

// Returns an error string or null.
export function validateAmount(value, { required = true, allowZero = true, label = 'Amount' } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null;
  const str = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) return `${label} must be a number.`;
  const n = Number(str);
  if (!Number.isFinite(n)) return `${label} must be a valid number.`;
  if (n < 0) return `${label} cannot be negative.`;
  if (!allowZero && n === 0) return `${label} must be greater than zero.`;
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return `${label} can have at most 2 decimal places.`;
  if (n > MAX_AMOUNT) return `${label} looks too large.`;
  return null;
}

export function toAmount(value) {
  if (isBlank(value)) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function validateInteger(value, { required = true, min = 0, max = Number.MAX_SAFE_INTEGER, label = 'Value' } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return `${label} must be a whole number.`;
  const n = Number(str);
  if (n < min) return `${label} must be at least ${min}.`;
  if (n > max) return `${label} must be at most ${max}.`;
  return null;
}

export function toInteger(value, fallback = null) {
  if (isBlank(value)) return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export function validateDateKey(value, { required = true, label = 'Date' } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null;
  return isDateKey(value) ? null : `${label} is not a valid date.`;
}

export function validateLocalDateTime(value, { required = true, label = 'Date and time' } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null;
  return isLocalDateTime(value) ? null : `${label} is not valid.`;
}

// Indian mobile numbers: 10 digits starting 6–9, optionally prefixed with
// +91, 91 or 0. Returns null if invalid.
export function normalizeIndianMobile(value) {
  if (isBlank(value)) return null;
  let digits = String(value).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return { national: digits, e164: `+91${digits}`, whatsapp: `91${digits}` };
}

export function validateIndianMobile(value, { required = true, label = 'Mobile number' } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null;
  return normalizeIndianMobile(value) ? null : `Enter a valid 10-digit Indian mobile number (starting with 6–9).`;
}

export function normalizeRegistration(value) {
  return isBlank(value) ? '' : String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Accepts standard state series (e.g. MH12AB1234, KA01F9999) and Bharat
// series (e.g. 22BH1234AA).
export function validateRegistration(value) {
  const reg = normalizeRegistration(value);
  if (!reg) return 'Registration number is required.';
  const standard = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/;
  const bharat = /^\d{2}BH\d{4}[A-Z]{1,2}$/;
  if (!standard.test(reg) && !bharat.test(reg)) {
    return 'Use a valid Indian registration number, e.g. MH 12 AB 1234.';
  }
  return null;
}

export function formatRegistration(value) {
  const reg = normalizeRegistration(value);
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(reg);
  if (!m) return reg;
  return [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ');
}

export function validatePersonName(value, { required = true, label = 'Name' } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : null;
  const v = String(value).trim();
  if (v.length < 2) return `${label} is too short.`;
  if (v.length > 80) return `${label} is too long.`;
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(v)) return `${label} can only contain letters, spaces, dots, hyphens and apostrophes.`;
  return null;
}

export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}

export function fail(errors, message) {
  return { ok: false, errors: errors || {}, message: message || firstError(errors) || 'Please fix the highlighted fields.' };
}

export function firstError(errors) {
  if (!errors) return null;
  for (const v of Object.values(errors)) {
    if (typeof v === 'string' && v) return v;
    if (v && typeof v === 'object') {
      const nested = firstError(v);
      if (nested) return nested;
    }
  }
  return null;
}
