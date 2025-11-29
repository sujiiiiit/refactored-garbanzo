/**
 * Razorpay Integration Utilities
 *
 * Setup instructions:
 * 1. npm install razorpay @types/razorpay
 * 2. Add to .env.local:
 *    RAZORPAY_KEY_ID=rzp_test_...
 *    RAZORPAY_KEY_SECRET=...
 * 3. Add Razorpay checkout script to app/layout.tsx:
 *    <Script src="https://checkout.razorpay.com/v1/checkout.js" />
 */

export interface RazorpayPaymentOptions {
  amount: number; // in rupees (will be converted to paise)
  currency?: string;
  name: string;
  description?: string;
  order_id?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Initialize Razorpay payment
 */
export function initiateRazorpayPayment(
  options: RazorpayPaymentOptions,
  onSuccess: (response: RazorpaySuccessResponse) => void,
  onFailure?: (error: any) => void
): RazorpayInstance | null {
  if (typeof window === 'undefined' || !window.Razorpay) {
    console.error('Razorpay SDK not loaded');
    return null;
  }

  const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!key) {
    console.error('Razorpay key not configured');
    return null;
  }

  const razorpayOptions = {
    key,
    amount: Math.round(options.amount * 100), // Convert to paise
    currency: options.currency || 'INR',
    name: options.name,
    description: options.description || '',
    order_id: options.order_id,
    prefill: options.prefill || {},
    notes: options.notes || {},
    theme: {
      color: options.theme?.color || '#6366f1',
    },
    handler: function (response: RazorpaySuccessResponse) {
      onSuccess(response);
    },
    modal: {
      ondismiss: function () {
        onFailure?.({ code: 'payment_cancelled', message: 'Payment cancelled by user' });
      },
    },
  };

  const razorpayInstance = new window.Razorpay(razorpayOptions);

  razorpayInstance.on('payment.failed', function (response: any) {
    onFailure?.(response.error);
  });

  return razorpayInstance;
}

/**
 * Create Razorpay order (server-side)
 * This should be called from an API route
 */
export async function createRazorpayOrder(
  amount: number,
  currency: string = 'INR',
  notes?: Record<string, string>
): Promise<{ id: string; amount: number; currency: string }> {
  const response = await fetch('/api/payments/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency, notes })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create order');
  }

  return response.json();
}

/**
 * Verify Razorpay payment signature (server-side)
 * This should be called from an API route
 */
export async function verifyRazorpayPayment(
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string
): Promise<boolean> {
  const response = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    })
  });

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return result.verified === true;
}

/**
 * Settlement payment flow helper
 */
export async function initiateSettlementPayment(
  settlementId: string,
  amount: number,
  payerName: string,
  payeeName: string,
  payerEmail?: string,
  payerPhone?: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // Create Razorpay order
      const order = await createRazorpayOrder(amount, 'INR', {
        settlement_id: settlementId,
        type: 'group_settlement'
      });

      // Initiate payment
      const razorpay = initiateRazorpayPayment(
        {
          amount,
          name: 'SmartSplit Settlement',
          description: `Pay ${payeeName}`,
          order_id: order.id,
          prefill: {
            name: payerName,
            email: payerEmail,
            contact: payerPhone
          },
          notes: {
            settlement_id: settlementId
          }
        },
        async (response) => {
          // Verify payment
          const verified = await verifyRazorpayPayment(
            response.razorpay_order_id || '',
            response.razorpay_payment_id,
            response.razorpay_signature || ''
          );

          if (verified) {
            // Mark settlement as paid
            await fetch(`/api/settlements/${settlementId}/pay`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                payment_id: response.razorpay_payment_id,
                payment_method: 'razorpay'
              })
            });

            resolve();
          } else {
            reject(new Error('Payment verification failed'));
          }
        },
        (error) => {
          reject(error);
        }
      );

      if (razorpay) {
        razorpay.open();
      } else {
        reject(new Error('Failed to initialize Razorpay'));
      }
    } catch (error) {
      reject(error);
    }
  });
}
