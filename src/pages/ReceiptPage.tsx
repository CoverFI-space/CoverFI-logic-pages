import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { PaymentReceipt } from '../components/PaymentReceipt';
import { uploadReceiptToImageKit } from '../lib/imagekit';

export default function ReceiptPage() {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCaptureAndSave = async () => {
    if (!receiptRef.current) return;
    setIsLoading(true);
    setSavedUrl(null);
    try {
      setStatus('Capturing receipt...');
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#F9A8A8',
        scale: 2, // high DPI for crisp image
      });
      const base64Image = canvas.toDataURL('image/png');

      setStatus('Uploading to ImageKit...');
      const imageUrl = await uploadReceiptToImageKit(base64Image);

      setStatus('Saving to Firebase...');
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8890';
      const response = await fetch(`${apiBase}/api/receipts/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'victor_shoaga',
          receiptUrl: imageUrl,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save to backend');
      }

      setSavedUrl(imageUrl);
      setStatus('✅ Receipt saved successfully!');
    } catch (error: any) {
      console.error(error);
      setStatus(`❌ Error: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
        Payment Receipt
      </h1>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>
        Preview your receipt below, then capture and save it.
      </p>

      {/* Action Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <button
          onClick={handleCaptureAndSave}
          disabled={isLoading}
          style={{
            padding: '12px 32px',
            background: isLoading ? '#555' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {isLoading ? 'Processing...' : '📸 Capture & Save Receipt'}
        </button>

        {status && (
          <p style={{ color: '#a0a0a0', fontSize: '13px' }}>{status}</p>
        )}
        {savedUrl && (
          <a href={savedUrl} target="_blank" rel="noreferrer" style={{ color: '#6366f1', fontSize: '13px', textDecoration: 'underline' }}>
            View Uploaded Receipt →
          </a>
        )}
      </div>

      {/* Receipt Preview */}
      <PaymentReceipt ref={receiptRef} />
    </div>
  );
}
