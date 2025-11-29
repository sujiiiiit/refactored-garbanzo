/**
 * UPI Deep Links Utility
 *
 * Generate UPI payment deep links for various UPI apps
 * Supports: Google Pay, PhonePe, Paytm, BHIM, etc.
 */

export interface UPIPaymentParams {
  payeeVPA: string; // UPI ID (e.g., merchant@upi)
  payeeName: string; // Merchant/Payee name
  amount: number; // Amount in rupees
  transactionNote?: string; // Transaction note/description
  transactionRefId?: string; // Unique transaction reference ID
  merchantCode?: string; // Merchant category code
  currency?: string; // Default: INR
}

/**
 * Generate UPI payment URL following UPI deep link specification
 * Spec: upi://pay?pa=<payee_vpa>&pn=<payee_name>&am=<amount>&tn=<note>&tr=<ref_id>&mc=<merchant_code>&cu=<currency>
 */
export function generateUPIDeepLink(params: UPIPaymentParams): string {
  const {
    payeeVPA,
    payeeName,
    amount,
    transactionNote,
    transactionRefId,
    merchantCode,
    currency = 'INR'
  } = params;

  // Validate UPI VPA format
  if (!isValidUPIVPA(payeeVPA)) {
    throw new Error('Invalid UPI VPA format');
  }

  const urlParams = new URLSearchParams();
  urlParams.append('pa', payeeVPA); // Payee address (UPI ID)
  urlParams.append('pn', payeeName); // Payee name
  urlParams.append('am', amount.toFixed(2)); // Amount
  urlParams.append('cu', currency); // Currency

  if (transactionNote) {
    urlParams.append('tn', transactionNote); // Transaction note
  }

  if (transactionRefId) {
    urlParams.append('tr', transactionRefId); // Transaction reference ID
  }

  if (merchantCode) {
    urlParams.append('mc', merchantCode); // Merchant category code
  }

  return `upi://pay?${urlParams.toString()}`;
}

/**
 * Validate UPI VPA format
 * Format: username@bankname (e.g., user@paytm, 9876543210@ybl)
 */
export function isValidUPIVPA(vpa: string): boolean {
  const upiRegex = /^[\w.-]+@[\w.-]+$/;
  return upiRegex.test(vpa);
}

/**
 * Generate UPI intent URL for Android apps
 */
export function generateUPIIntentURL(params: UPIPaymentParams): string {
  const deepLink = generateUPIDeepLink(params);
  // Remove upi:// prefix for intent
  const upiParams = deepLink.replace('upi://', '');
  return `intent://${upiParams}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
}

/**
 * App-specific UPI deep links
 */
export const UPIApps = {
  GPAY: 'gpay',
  PHONEPE: 'phonepe',
  PAYTM: 'paytm',
  BHIM: 'bhim',
  GENERIC: 'upi'
} as const;

export type UPIApp = typeof UPIApps[keyof typeof UPIApps];

/**
 * Generate app-specific UPI link
 */
export function generateAppSpecificUPILink(
  params: UPIPaymentParams,
  app: UPIApp
): string {
  const baseLink = generateUPIDeepLink(params);

  switch (app) {
    case UPIApps.GPAY:
      return `tez://${baseLink.replace('upi://', '')}`;
    case UPIApps.PHONEPE:
      return `phonepe://${baseLink.replace('upi://', '')}`;
    case UPIApps.PAYTM:
      return `paytmmp://${baseLink.replace('upi://', '')}`;
    case UPIApps.BHIM:
      return baseLink; // BHIM uses standard UPI link
    default:
      return baseLink;
  }
}

/**
 * Generate QR code data for UPI payment
 */
export function generateUPIQRData(params: UPIPaymentParams): string {
  return generateUPIDeepLink(params);
}

/**
 * Create settlement payment UPI link
 */
export function createSettlementUPILink(
  payeeUPI: string,
  payeeName: string,
  amount: number,
  settlementId: string
): string {
  return generateUPIDeepLink({
    payeeVPA: payeeUPI,
    payeeName,
    amount,
    transactionNote: `Settlement payment - SmartSplit`,
    transactionRefId: settlementId
  });
}

/**
 * Open UPI payment in native app
 */
export function openUPIPayment(params: UPIPaymentParams, app?: UPIApp) {
  if (typeof window === 'undefined') {
    throw new Error('This function can only be called in browser');
  }

  const link = app
    ? generateAppSpecificUPILink(params, app)
    : generateUPIDeepLink(params);

  // Try to open in native app
  window.location.href = link;

  // Fallback: Show QR code after 2 seconds if app doesn't open
  setTimeout(() => {
    // Check if page is still visible (app didn't open)
    if (!document.hidden) {
      console.log('UPI app not available. Show QR code fallback.');
      // Trigger QR code display event
      window.dispatchEvent(new CustomEvent('upi-fallback-qr', {
        detail: { qrData: link }
      }));
    }
  }, 2000);
}

/**
 * Check if UPI is supported on this device
 */
export function isUPISupported(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const isAndroid = userAgent.includes('android');
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isIndia = true; // Can be determined by IP geolocation

  // UPI is primarily supported on Android in India
  return (isAndroid || isIOS) && isIndia;
}

/**
 * Popular Indian bank UPI handles
 */
export const UPIBankHandles = {
  SBI: '@sbi',
  HDFC: '@hdfcbank',
  ICICI: '@icici',
  AXIS: '@axisbank',
  KOTAK: '@kotak',
  YES_BANK: '@ybl', // YBL (Yes Bank Limited) - used by Google Pay
  PAYTM: '@paytm',
  PHONEPE: '@ybl',
  AMAZON: '@apl',
  AIRTEL: '@airtel'
} as const;

/**
 * Extract UPI handle from VPA
 */
export function extractUPIHandle(vpa: string): string {
  const parts = vpa.split('@');
  return parts.length === 2 ? `@${parts[1]}` : '';
}

/**
 * Get bank name from UPI handle
 */
export function getBankNameFromHandle(handle: string): string {
  const bankMap: Record<string, string> = {
    '@sbi': 'State Bank of India',
    '@hdfcbank': 'HDFC Bank',
    '@icici': 'ICICI Bank',
    '@axisbank': 'Axis Bank',
    '@kotak': 'Kotak Mahindra Bank',
    '@ybl': 'Yes Bank / Google Pay / PhonePe',
    '@paytm': 'Paytm Payments Bank',
    '@apl': 'Amazon Pay',
    '@airtel': 'Airtel Payments Bank'
  };

  return bankMap[handle.toLowerCase()] || 'Unknown Bank';
}
