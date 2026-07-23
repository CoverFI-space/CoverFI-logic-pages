import React, { useEffect, useState } from 'react';
import { ReceiptPaper } from '../components/PrinterReceipt';
import type { ReceiptData } from '../components/PrinterReceipt';
import { asReceiptData, loadLocalPaymentHistory } from '../lib/localRecords';
import { getStoredSession } from '../lib/usernameStore';

export default function ReceiptPage() {
  const [status, setStatus] = useState<string>('Loading local receipts...');
  const [isLoading, setIsLoading] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);

  useEffect(() => {
    async function loadReceipts() {
      const session = getStoredSession();
      if (!session?.username || !session?.walletAddress) {
        setStatus('Connect a wallet and claim a username before viewing receipts.');
        return;
      }

      setIsLoading(true);
      const nextReceipts = (await loadLocalPaymentHistory(session.walletAddress))
        .map(asReceiptData)
        .filter(Boolean) as ReceiptData[];

      setReceipts(nextReceipts);
      setStatus(nextReceipts.length ? '' : 'No local payment receipts found yet.');
      setIsLoading(false);
    }

    void loadReceipts();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
        Payment Receipt
      </h1>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>
        Payment receipts are stored locally in this browser after wallet-signed payments.
      </p>

      {isLoading && <p style={{ color: '#a0a0a0', fontSize: '13px' }}>Loading...</p>}
      {status && <p style={{ color: '#a0a0a0', fontSize: '13px' }}>{status}</p>}
      <div style={{ display: 'grid', gap: '20px', width: 'min(420px, 100%)', marginTop: '28px' }}>
        {receipts.map((receipt, index) => (
          <ReceiptPaper key={`${receipt.txHash || 'receipt'}-${index}`} receiptData={receipt} />
        ))}
      </div>
    </div>
  );
}
