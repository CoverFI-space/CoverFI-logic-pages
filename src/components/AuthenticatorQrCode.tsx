import QRCode from "qrcode";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AuthenticatorQrCodeProps = {
  value: string;
  secret?: string;
  label?: string;
  size?: number;
};

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export function AuthenticatorQrCode({
  value,
  secret = "",
  label = "Authenticator QR",
  size = 256,
}: AuthenticatorQrCodeProps) {
  const [pngUrl, setPngUrl] = useState("");
  const [copied, setCopied] = useState("");
  const cleanValue = value.trim();
  const cleanSecret = secret.trim();
  const validOtpAuth = /^otpauth:\/\/totp\//i.test(cleanValue);
  const qrSize = Math.max(220, size);
  const groupedSecret = useMemo(
    () => cleanSecret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim(),
    [cleanSecret],
  );

  useEffect(() => {
    let cancelled = false;
    setPngUrl("");

    if (!validOtpAuth) return;

    void QRCode.toDataURL(cleanValue, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: qrSize,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    })
      .then((nextPng) => {
        if (!cancelled) setPngUrl(nextPng);
      })
      .catch(() => {
        if (!cancelled) setPngUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [cleanValue, qrSize, validOtpAuth]);

  async function handleCopy(kind: "uri" | "secret") {
    const nextValue = kind === "uri" ? cleanValue : cleanSecret;
    if (!nextValue) return;
    await copyText(nextValue);
    setCopied(kind);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className="grid gap-4">
      <div className="mx-auto grid place-items-center rounded-2xl border border-white/70 bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        {pngUrl ? (
          <img
            src={pngUrl}
            width={qrSize}
            height={qrSize}
            alt={label}
            className="h-auto max-w-full rounded-lg"
          />
        ) : (
          <div
            className="grid place-items-center rounded-lg border border-dashed border-black/20 bg-white text-black/45"
            style={{ width: qrSize, height: qrSize }}>
            <QrCode className="h-10 w-10" />
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-sm text-[#E1E0CC]">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#E1E0CC]/50">
          Google Authenticator, Microsoft Authenticator, Authy, and 1Password compatible.
        </p>
      </div>

      {cleanSecret && (
        <div className="grid gap-2 text-xs leading-relaxed text-[#E1E0CC]/58">
          <p className="uppercase tracking-[0.24em] text-[#E1E0CC]/40">Manual setup key</p>
          <code className="break-all rounded-xl border border-[#E1E0CC]/10 bg-black/35 p-3 text-[#E1E0CC]/80">
            {groupedSecret}
          </code>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void handleCopy("secret")}
          disabled={!cleanSecret}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-3 text-xs uppercase tracking-widest text-[#E1E0CC]/75 transition-colors hover:bg-[#E1E0CC]/10 disabled:cursor-not-allowed disabled:opacity-45">
          <Copy className="h-3.5 w-3.5" />
          {copied === "secret" ? "Copied" : "Copy key"}
        </button>
        <a
          href={validOtpAuth ? cleanValue : undefined}
          onClick={(event) => {
            if (!validOtpAuth) event.preventDefault();
          }}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-3 text-xs uppercase tracking-widest transition-colors ${
            validOtpAuth
              ? "text-[#E1E0CC]/75 hover:bg-[#E1E0CC]/10"
              : "pointer-events-none text-[#E1E0CC]/30"
          }`}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open app
        </a>
      </div>
    </div>
  );
}
