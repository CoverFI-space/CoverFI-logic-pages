import React from 'react';

interface PaymentReceiptProps {
  receiptId?: string;
  senderName?: string;
  receiverName?: string;
  amount?: string;
  tax?: string;
  total?: string;
  date?: string;
  txHash?: string;
}

export const PaymentReceipt = React.forwardRef<HTMLDivElement, PaymentReceiptProps>(({
  receiptId = "0237-7746-8981-9028-5626",
  senderName = "Victor Shoaga",
  receiverName = "Ade",
  amount = "950 XLM",
  tax = "0 XLM",
  total = "950 XLM",
  date,
  txHash,
}, ref) => {
  const displayDate = date ?? new Date().toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  });
  const displayTx = txHash ?? receiptId;

  return (
    <div
      ref={ref}
      style={{ backgroundColor: '#F9A8A8', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 20px', fontFamily: '"Courier New", Courier, monospace' }}
    >
      {/* Outer wrapper provides the zigzag mask */}
      <div style={{ position: 'relative', width: '340px' }}>

        {/* Top zigzag */}
        <svg width="340" height="16" viewBox="0 0 340 16" style={{ display: 'block' }}>
          <polyline
            points={Array.from({ length: 34 }, (_, i) => {
              const x1 = i * 10;
              const x2 = i * 10 + 5;
              const x3 = i * 10 + 10;
              return `${x1},16 ${x2},0 ${x3},16`;
            }).join(' ')}
            fill="white"
            stroke="none"
          />
        </svg>

        {/* Main Receipt Body */}
        <div style={{
          backgroundColor: 'white',
          padding: '8px 32px 24px',
          fontSize: '12px',
          color: '#111',
          lineHeight: '1.6',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
              ▲XIS
            </div>
            <div style={{ fontSize: '9px', letterSpacing: '4px', fontWeight: 700 }}>INDUSTRIES</div>
            <div style={{ fontSize: '11px', marginTop: '10px', opacity: 0.7 }}>{displayDate}</div>
          </div>

          {/* Token box */}
          <div style={{
            border: '2px dashed #222',
            borderRadius: '8px',
            padding: '12px',
            textAlign: 'center',
            position: 'relative',
            margin: '12px 0 20px',
          }}>
            <span style={{
              position: 'absolute',
              top: '-9px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'white',
              padding: '0 8px',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '3px',
            }}>Token</span>
            <div style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '2px' }}>
              {displayTx}
            </div>
          </div>

          {/* Row helper */}
          {[
            { label: 'Token Type', value: 'Credit', divider: true },
            { label: 'Customer Name', value: senderName },
            { label: 'Customer Type', value: 'R3' },
            { label: 'Address', value: '7953 Oakland St.\nHonolulu, HI 96815', divider: true },
            { label: 'Meter Number', value: '04172997324', divider: true },
            { label: 'Amount', value: amount },
            { label: 'Tax', value: tax },
            { label: 'Total', value: total, divider: true },
            { label: 'Operator', value: receiverName },
          ].map(({ label, value, divider }) => (
            <React.Fragment key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 0' }}>
                <span style={{ opacity: 0.6 }}>{label}</span>
                <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'pre-line', maxWidth: '170px' }}>{value}</span>
              </div>
              {divider && <div style={{ borderBottom: '1px dashed #aaa', margin: '4px 0 8px' }} />}
            </React.Fragment>
          ))}

          {/* Footer: CoverFi branding */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <div style={{ fontWeight: 900, fontSize: '32px', letterSpacing: '-2px', fontStyle: 'italic' }}>
              CoverFi
            </div>
            <div style={{ fontSize: '9px', letterSpacing: '3px', opacity: 0.5, marginTop: '2px' }}>PAYMENT RECEIPT</div>
          </div>
        </div>

        {/* Bottom zigzag */}
        <svg width="340" height="16" viewBox="0 0 340 16" style={{ display: 'block', transform: 'scaleY(-1)' }}>
          <polyline
            points={Array.from({ length: 34 }, (_, i) => {
              const x1 = i * 10;
              const x2 = i * 10 + 5;
              const x3 = i * 10 + 10;
              return `${x1},16 ${x2},0 ${x3},16`;
            }).join(' ')}
            fill="white"
            stroke="none"
          />
        </svg>
      </div>
    </div>
  );
});

PaymentReceipt.displayName = 'PaymentReceipt';
