'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Mic,
  MicOff,
  Square,
  Play,
  Pause,
  Send,
  Trash2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface VoiceRecorderProps {
  onExpenseCreated?: (expense: any) => void;
  onClose?: () => void;
}

export function VoiceRecorder({ onExpenseCreated, onClose }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [extractedData, setExtractedData] = useState<any>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [audioURL, isRecording]);

  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioURL(URL.createObjectURL(blob));

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          // Auto-stop at 60 seconds
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

      toast.success('Recording started');
    } catch (error: any) {
      toast.error('Microphone access denied: ' + error.message);
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      toast.success('Recording stopped');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  const deleteRecording = () => {
    setAudioBlob(null);
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      setAudioURL(null);
    }
    setRecordingTime(0);
    setTranscript('');
    setExtractedData(null);
    audioChunksRef.current = [];
    toast.success('Recording deleted');
  };

  const submitRecording = async () => {
    if (!audioBlob) {
      toast.error('No recording available');
      return;
    }

    try {
      setIsProcessing(true);

      // Create form data
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      // Send to API
      const response = await fetch('/api/expenses/from-voice', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process voice recording');
      }

      const result = await response.json();
      setTranscript(result.transcript || '');
      setExtractedData(result.extracted_data || null);

      toast.success('Expense created from voice recording!');

      // Call callback if provided
      if (onExpenseCreated) {
        onExpenseCreated(result);
      }

      // Close after a delay
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 2000);
    } catch (error: any) {
      toast.error('Failed to process recording: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Voice Expense Entry</h3>
          <p className="text-sm text-muted-foreground">
            Record your expense details (max 60 seconds)
          </p>
        </div>
        {isRecording && (
          <Badge variant="destructive" className="animate-pulse">
            <Mic className="h-3 w-3 mr-1" />
            Recording
          </Badge>
        )}
      </div>

      {/* Recording Visualization */}
      <div className="flex flex-col items-center justify-center py-8">
        {/* Microphone Button */}
        <div className="relative mb-6">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing || (audioBlob !== null)}
            className={`h-24 w-24 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : audioBlob
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600'
            } ${isPaused ? 'opacity-50' : ''}`}
          >
            {isRecording ? (
              <Square className="h-10 w-10 text-white" fill="white" />
            ) : (
              <Mic className="h-10 w-10 text-white" />
            )}
          </button>

          {/* Pulse rings when recording */}
          {isRecording && !isPaused && (
            <>
              <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-20" />
              <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-10 animation-delay-150" />
            </>
          )}
        </div>

        {/* Timer */}
        <div className="text-center mb-4">
          <p className="text-3xl font-mono font-bold">{formatTime(recordingTime)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isRecording ? (isPaused ? 'Paused' : 'Recording...') : audioBlob ? 'Ready to submit' : 'Click to start'}
          </p>
        </div>

        {/* Progress Bar (60 seconds max) */}
        {(isRecording || audioBlob) && (
          <div className="w-full mb-6">
            <Progress value={(recordingTime / 60) * 100} className="h-2" />
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {isRecording && (
            <Button
              onClick={pauseRecording}
              variant="outline"
              size="sm"
            >
              {isPaused ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              )}
            </Button>
          )}

          {audioBlob && !isRecording && (
            <>
              <Button
                onClick={deleteRecording}
                variant="outline"
                size="sm"
                disabled={isProcessing}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>

              <Button
                onClick={submitRecording}
                variant="default"
                size="sm"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create Expense
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Audio Player */}
      {audioURL && (
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-2">Preview</p>
          <audio ref={audioPlayerRef} src={audioURL} controls className="w-full" />
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <p className="text-sm font-medium mb-2">Transcript</p>
          <p className="text-sm text-muted-foreground">{transcript}</p>
        </div>
      )}

      {/* Extracted Data */}
      {extractedData && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
          <p className="text-sm font-medium mb-2">Extracted Expense</p>
          <div className="space-y-1 text-sm">
            {extractedData.title && <p><strong>Title:</strong> {extractedData.title}</p>}
            {extractedData.amount && <p><strong>Amount:</strong> ₹{extractedData.amount}</p>}
            {extractedData.category && <p><strong>Category:</strong> {extractedData.category}</p>}
            {extractedData.merchant_name && <p><strong>Merchant:</strong> {extractedData.merchant_name}</p>}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 border rounded-lg">
        <p className="text-xs font-medium mb-2">Usage Tips:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Speak clearly: "Paid fifty rupees for coffee at CCD"</li>
          <li>• Mention: amount, item/category, merchant (optional)</li>
          <li>• You can pause/resume recording</li>
          <li>• Maximum recording time: 60 seconds</li>
        </ul>
      </div>
    </Card>
  );
}
