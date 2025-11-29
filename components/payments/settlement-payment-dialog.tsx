'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CreditCard,
  Smartphone,
  QrCode,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { initiateSettlementPayment } from '@/lib/payments/razorpay';
import {
  generateUPIDeepLink,
  openUPIPayment,
  isUPISupported,
  UPIApps,
  createSettlementUPILink
} from '@/lib/payments/upi';
import QRCode from 'qrcode';

interface SettlementPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlement: {
    id: string;
    from_user_id: string;
    to_user_id: string;
    amount: number;
    currency: string;
    from_user_name: string;
    to_user_name: string;
    to_user_upi?: string;
  };
  currentUserId: string;
  onPaymentComplete?: () => void;
}

export function SettlementPaymentDialog({
  open,
  onOpenChange,
  settlement,
  currentUserId,
  onPaymentComplete
}: SettlementPaymentDialogProps) {
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'upi' | 'manual'>('upi');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [showQR, setShowQR] = useState(false);
  const [manualConfirmation, setManualConfirmation] = useState('');

  const isPayee = currentUserId === settlement.to_user_id;
  const isPayer = currentUserId === settlement.from_user_id;

  // Generate QR code for UPI
  const generateQRCode = async (upiLink: string) => {
    try {
      const qr = await QRCode.toDataURL(upiLink, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      setQrCodeData(qr);
      setShowQR(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast.error('Failed to generate QR code');
    }
  };

  // Handle Razorpay payment
  const handleRazorpayPayment = async () => {
    try {
      setProcessing(true);

      await initiateSettlementPayment(
        settlement.id,
        settlement.amount,
        settlement.from_user_name,
        settlement.to_user_name
      );

      toast.success('Payment successful!');
      onPaymentComplete?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Payment failed: ' + (error.message || 'Unknown error'));
    } finally {
      setProcessing(false);
    }
  };

  // Handle UPI payment
  const handleUPIPayment = (app?: typeof UPIApps[keyof typeof UPIApps]) => {
    if (!settlement.to_user_upi) {
      toast.error('Payee UPI ID not available');
      return;
    }

    try {
      const upiLink = createSettlementUPILink(
        settlement.to_user_upi,
        settlement.to_user_name,
        settlement.amount,
        settlement.id
      );

      if (app) {
        openUPIPayment({
          payeeVPA: settlement.to_user_upi,
          payeeName: settlement.to_user_name,
          amount: settlement.amount,
          transactionNote: 'Settlement - SmartSplit',
          transactionRefId: settlement.id
        }, app);
      } else {
        // Show QR code
        generateQRCode(upiLink);
      }
    } catch (error: any) {
      toast.error('Failed to initiate UPI payment: ' + error.message);
    }
  };

  // Copy UPI ID to clipboard
  const copyUPIId = () => {
    if (settlement.to_user_upi) {
      navigator.clipboard.writeText(settlement.to_user_upi);
      toast.success('UPI ID copied to clipboard');
    }
  };

  // Mark as paid manually
  const handleManualConfirmation = async () => {
    if (manualConfirmation.toLowerCase() !== 'paid') {
      toast.error('Please type "PAID" to confirm');
      return;
    }

    try {
      setProcessing(true);

      const response = await fetch(`/api/groups/${settlement.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: 'manual',
          payment_note: 'Marked as paid manually'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to mark as paid');
      }

      toast.success('Settlement marked as paid');
      onPaymentComplete?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Failed to confirm payment: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Pay Settlement</DialogTitle>
          <DialogDescription>
            Choose your preferred payment method
          </DialogDescription>
        </DialogHeader>

        {/* Settlement Details */}
        <Card className="p-4 bg-muted">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">From:</span>
              <span className="font-medium">{settlement.from_user_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">To:</span>
              <span className="font-medium">{settlement.to_user_name}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Amount:</span>
              <span className="text-2xl font-bold">
                {settlement.currency === 'INR' ? '₹' : '$'}
                {settlement.amount.toLocaleString()}
              </span>
            </div>
          </div>
        </Card>

        {/* Payment Methods */}
        <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upi">
              <Smartphone className="h-4 w-4 mr-2" />
              UPI
            </TabsTrigger>
            <TabsTrigger value="razorpay">
              <CreditCard className="h-4 w-4 mr-2" />
              Card/UPI
            </TabsTrigger>
            <TabsTrigger value="manual">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Manual
            </TabsTrigger>
          </TabsList>

          {/* UPI Payment */}
          <TabsContent value="upi" className="space-y-4">
            {settlement.to_user_upi ? (
              <>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <Label>Payee UPI ID</Label>
                    <Button variant="ghost" size="sm" onClick={copyUPIId}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="p-3 bg-muted rounded font-mono text-sm">
                    {settlement.to_user_upi}
                  </div>
                </div>

                {isUPISupported() && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleUPIPayment(UPIApps.GPAY)}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <img src="/icons/gpay.svg" alt="GPay" className="h-5 w-5" />
                      Google Pay
                    </Button>
                    <Button
                      onClick={() => handleUPIPayment(UPIApps.PHONEPE)}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <img src="/icons/phonepe.svg" alt="PhonePe" className="h-5 w-5" />
                      PhonePe
                    </Button>
                    <Button
                      onClick={() => handleUPIPayment(UPIApps.PAYTM)}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <img src="/icons/paytm.svg" alt="Paytm" className="h-5 w-5" />
                      Paytm
                    </Button>
                    <Button
                      onClick={() => handleUPIPayment()}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Smartphone className="h-5 w-5" />
                      Other UPI
                    </Button>
                  </div>
                )}

                <Button
                  onClick={() => handleUPIPayment()}
                  variant="secondary"
                  className="w-full"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Show QR Code
                </Button>

                {showQR && qrCodeData && (
                  <div className="flex flex-col items-center p-4 border rounded-lg">
                    <img src={qrCodeData} alt="UPI QR Code" className="w-64 h-64" />
                    <p className="text-sm text-muted-foreground mt-2">
                      Scan with any UPI app to pay
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm">Payee UPI ID not available. Use another payment method.</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Razorpay Payment (Card/UPI/Netbanking) */}
          <TabsContent value="razorpay" className="space-y-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-4">
                Pay securely using Credit/Debit Card, UPI, Net Banking, or Wallets
              </p>
              <Button
                onClick={handleRazorpayPayment}
                disabled={processing}
                className="w-full"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay ₹{settlement.amount} via Razorpay
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
                <img src="/icons/razorpay.svg" alt="Razorpay" className="h-4" />
                Secured by Razorpay
              </div>
            </div>
          </TabsContent>

          {/* Manual Payment */}
          <TabsContent value="manual" className="space-y-4">
            <div className="p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100 mb-3">
                If you've paid outside the app (cash, bank transfer, etc.), mark this settlement as paid.
              </p>
              <Label htmlFor="confirmation">Type "PAID" to confirm</Label>
              <Input
                id="confirmation"
                value={manualConfirmation}
                onChange={(e) => setManualConfirmation(e.target.value)}
                placeholder="Type PAID"
                className="mt-2"
              />
            </div>
            <Button
              onClick={handleManualConfirmation}
              disabled={processing || manualConfirmation.toLowerCase() !== 'paid'}
              className="w-full"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Paid
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
