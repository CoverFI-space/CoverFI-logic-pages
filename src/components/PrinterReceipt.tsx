import React, { useEffect, useRef, useState } from 'react';

export interface ReceiptData {
  status: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  txHash: string;
  receiptHash?: string;
  date: string;
}

interface PrinterReceiptProps {
  receiptData: ReceiptData;
  onClose: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '36px',
    background: 'rgba(11, 15, 23, 0.96)',
    backdropFilter: 'blur(12px)',
    zIndex: 9999,
    animation: 'overlayFadeIn 0.3s ease-out',
  },
  closeBtn: {
    padding: '10px 28px',
    border: 'none',
    borderRadius: '999px',
    background: '#22c55e',
    color: '#052e16',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 10px 30px rgba(34, 197, 94, 0.4)',
  },
  printer: {
    position: 'relative',
    width: '320px',
    height: '150px',
    background: '#1f2937',
    borderRadius: '18px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
  },
  printerTop: {
    position: 'absolute',
    top: '-48px',
    left: '55px',
    width: '210px',
    height: '65px',
    background: '#111827',
    borderRadius: '14px 14px 4px 4px',
  },
  slot: {
    position: 'absolute',
    top: '38px',
    left: '36px',
    width: '248px',
    height: '14px',
    background: '#020617',
    borderRadius: '999px',
    zIndex: 5,
  },
  buttonLight: {
    position: 'absolute',
    top: '88px',
    right: '38px',
    width: '18px',
    height: '18px',
    background: '#22c55e',
    borderRadius: '50%',
    boxShadow: '0 0 16px #22c55e',
  },
  paper: {
    position: 'absolute',
    top: '45px',
    left: '48px',
    width: '224px',
    height: 0,
    background: 'white',
    color: '#111827',
    borderRadius: '4px',
    overflow: 'hidden',
    zIndex: 1,
    transformOrigin: 'top',
    transition: 'none',
  },
  paperPrinting: {
    animation: 'printPaper 3.2s ease-in-out forwards',
  },
  receipt: {
    padding: '16px',
    fontSize: '11px',
    fontFamily: 'Arial, sans-serif',
    color: '#111827',
  },
  receiptH3: {
    margin: '0 0 12px',
    textAlign: 'center',
    fontSize: '15px',
    fontWeight: 700,
    color: '#111827',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '7px 0',
    borderBottom: '1px dashed #d1d5db',
    fontSize: '11px',
  },
  label: { color: '#6b7280' },
  value: {
    maxWidth: '120px',
    textAlign: 'right',
    fontWeight: 700,
    overflowWrap: 'break-word',
  },
  success: {
    marginTop: '14px',
    padding: '8px',
    textAlign: 'center',
    background: '#dcfce7',
    color: '#166534',
    borderRadius: '8px',
    fontWeight: 800,
    fontSize: '11px',
    boxSizing: 'border-box',
  },
  // Preview modal
  modal: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'rgba(2, 6, 23, 0.82)',
    backdropFilter: 'blur(8px)',
    zIndex: 99999,
  },
  previewCard: {
    position: 'relative',
    width: 'min(360px, 90vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: 'white',
    color: '#111827',
    borderRadius: '16px',
    boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
    animation: 'popIn 0.25s ease-out',
    fontFamily: 'Arial, sans-serif',
  },
  previewClose: {
    position: 'sticky',
    top: '10px',
    marginLeft: 'auto',
    marginRight: '10px',
    display: 'block',
    width: '34px',
    height: '34px',
    border: 'none',
    borderRadius: '50%',
    background: '#111827',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
    zIndex: 2,
  },
  previewReceipt: {
    padding: '4px 22px 24px',
    fontSize: '13px',
  },
};

const ReceiptContent: React.FC<{ data: ReceiptData; isPreview?: boolean }> = ({ data, isPreview }) => {
  const baseStyle = isPreview ? styles.previewReceipt : styles.receipt;
  const h3Style = isPreview
    ? { ...styles.receiptH3, fontSize: '18px' }
    : styles.receiptH3;
  const valueStyle = isPreview
    ? { ...styles.value, maxWidth: '170px' }
    : styles.value;

  const rows: { label: string; value: string }[] = [
    { label: 'Status', value: data.status },
    { label: 'From', value: data.from },
    { label: 'To', value: data.to },
    { label: 'Amount', value: data.amount },
    { label: 'Fee', value: data.fee },
    { label: 'Tx Hash', value: data.txHash.length > 22 ? data.txHash.slice(0, 12) + '...' + data.txHash.slice(-8) : data.txHash },
    ...(data.receiptHash
      ? [{ label: 'Receipt Hash', value: data.receiptHash.length > 22 ? data.receiptHash.slice(0, 12) + '...' + data.receiptHash.slice(-8) : data.receiptHash }]
      : []),
    { label: 'Date', value: data.date },
  ];

  return (
    <div style={baseStyle}>
      <h3 style={h3Style}>Wallet Receipt</h3>
      {rows.map(({ label, value }) => (
        <div key={label} style={styles.row}>
          <span style={styles.label}>{label}</span>
          <span style={valueStyle}>{value}</span>
        </div>
      ))}
      <div style={styles.success}>Payment Confirmed</div>
    </div>
  );
};

export const ReceiptPaper: React.FC<{ receiptData: ReceiptData }> = ({ receiptData }) => (
  <div
    style={{
      ...styles.previewCard,
      width: '100%',
      maxHeight: 'none',
      overflowY: 'visible',
      boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
      animation: 'none',
    }}
  >
    <ReceiptContent data={receiptData} isPreview />
  </div>
);

export const PrinterReceipt: React.FC<PrinterReceiptProps> = ({ receiptData, onClose }) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-start printing animation after mount
    const timer = setTimeout(() => setIsPrinting(true), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !isPrinting) return;

    const handleEnd = () => setShowPreview(true);
    paper.addEventListener('animationend', handleEnd);
    return () => paper.removeEventListener('animationend', handleEnd);
  }, [isPrinting]);

  return (
    <>
      <style>{`
        @keyframes printPaper {
          from { height: 0; }
          to   { height: 380px; }
        }
        @keyframes popIn {
          from { transform: scale(0.92); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Main overlay with dark bg + printer */}
      {!showPreview && (
        <div style={styles.overlay}>
          {/* Printer */}
          <div style={styles.printer}>
            <div style={styles.printerTop} />

            <div
              ref={paperRef}
              style={{
                ...styles.paper,
                ...(isPrinting ? styles.paperPrinting : {}),
              }}
            >
              <ReceiptContent data={receiptData} />
            </div>

            <div style={styles.slot} />
            <div style={styles.buttonLight} />
          </div>
        </div>
      )}

      {/* Preview modal opens after the print animation ends. */}
      {showPreview && (
        <div style={styles.modal}>
          <div style={styles.previewCard}>
            <button style={styles.previewClose} onClick={onClose} aria-label="Close receipt preview">
              X
            </button>
            <ReceiptContent data={receiptData} isPreview />
          </div>
        </div>
      )}
    </>
  );
};
