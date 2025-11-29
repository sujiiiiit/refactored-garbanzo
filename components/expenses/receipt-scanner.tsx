'use client';

import { useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload,
  Camera,
  FileImage,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

interface ReceiptScannerProps {
  onExpenseCreated?: (expense: any) => void;
  onClose?: () => void;
}

export function ReceiptScanner({ onExpenseCreated, onClose }: ReceiptScannerProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Accepted file types
  const acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = useCallback((file: File) => {
    setError(null);

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload JPEG, PNG, or PDF.');
      toast.error('Invalid file type');
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 10MB.');
      toast.error('File too large');
      return;
    }

    setSelectedFile(file);

    // Create preview URL for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewURL(url);
    } else {
      setPreviewURL(null);
    }

    toast.success('File selected: ' + file.name);
  }, []);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (previewURL) {
      URL.revokeObjectURL(previewURL);
      setPreviewURL(null);
    }
    setOcrResult(null);
    setError(null);
    setUploadProgress(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const processReceipt = async () => {
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }

    try {
      setIsProcessing(true);
      setUploadProgress(0);
      setError(null);

      // Create form data
      const formData = new FormData();
      formData.append('receipt', selectedFile);

      // Simulate upload progress (actual progress tracking would need XMLHttpRequest)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Send to API
      const response = await fetch('/api/expenses/from-image', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process receipt');
      }

      const result = await response.json();
      setOcrResult(result);

      toast.success('Receipt processed successfully!');

      // Call callback if provided
      if (onExpenseCreated && result.transaction_id) {
        onExpenseCreated(result);
      }

      // Close after a delay
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to process receipt');
      toast.error('Processing failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Receipt Scanner</h3>
          <p className="text-sm text-muted-foreground">
            Upload or capture a receipt for OCR processing
          </p>
        </div>
        {selectedFile && (
          <Button onClick={removeFile} variant="ghost" size="sm">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Upload Area */}
      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm font-medium mb-2">
            Drop receipt here or click to upload
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            JPEG, PNG, PDF (max 10MB)
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              variant="outline"
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose File
            </Button>

            <Button
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              variant="outline"
              size="sm"
            >
              <Camera className="h-4 w-4 mr-2" />
              Take Photo
            </Button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      ) : (
        <>
          {/* Preview */}
          <div className="space-y-4">
            {previewURL ? (
              <div className="relative rounded-lg overflow-hidden border bg-muted">
                <div className="relative h-96">
                  <Image
                    src={previewURL}
                    alt="Receipt preview"
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
            ) : (
              <div className="p-8 border rounded-lg bg-muted text-center">
                <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}

            {/* File Info */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileImage className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFile.type} • {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button onClick={removeFile} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Processing...</span>
                  <span className="font-medium">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* OCR Results */}
            {ocrResult && (
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <p className="font-medium">OCR Completed</p>
                </div>

                <ScrollArea className="h-48">
                  <div className="space-y-2 text-sm">
                    {ocrResult.merchant_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Merchant:</span>
                        <span className="font-medium">{ocrResult.merchant_name}</span>
                      </div>
                    )}
                    {ocrResult.total_amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-medium">₹{ocrResult.total_amount}</span>
                      </div>
                    )}
                    {ocrResult.date && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-medium">{ocrResult.date}</span>
                      </div>
                    )}
                    {ocrResult.gstin && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GSTIN:</span>
                        <span className="font-medium text-xs">{ocrResult.gstin}</span>
                      </div>
                    )}
                    {ocrResult.gst_amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GST:</span>
                        <span className="font-medium">₹{ocrResult.gst_amount}</span>
                      </div>
                    )}
                    {ocrResult.category && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Category:</span>
                        <Badge>{ocrResult.category}</Badge>
                      </div>
                    )}
                    {ocrResult.confidence && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence:</span>
                        <span className="font-medium">{(ocrResult.confidence * 100).toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {ocrResult.transaction_id && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Transaction created: {ocrResult.transaction_id}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <Button onClick={removeFile} variant="outline">
                Cancel
              </Button>
              <Button
                onClick={processReceipt}
                disabled={isProcessing || !!ocrResult}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : ocrResult ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Completed
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Scan Receipt
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 border rounded-lg">
        <p className="text-xs font-medium mb-2">Tips for best results:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Ensure receipt is well-lit and in focus</li>
          <li>• Capture the entire receipt including header and footer</li>
          <li>• Avoid shadows, glare, or folds</li>
          <li>• Supported: JPEG, PNG, PDF (max 10MB)</li>
        </ul>
      </div>
    </Card>
  );
}
