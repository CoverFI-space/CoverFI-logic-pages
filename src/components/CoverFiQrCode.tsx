import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CoverFiQrCodeProps = {
  value: string;
  label?: string;
  caption?: string;
  filename?: string;
  size?: number;
  showDownloads?: boolean;
};

const qrColors = {
  dark: "#E1E0CC",
  light: "#050505",
};

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

export function CoverFiQrCode({
  value,
  label = "CoverFi QR",
  caption,
  filename = "coverfi-qr",
  size = 236,
  showDownloads = false,
}: CoverFiQrCodeProps) {
  const [pngUrl, setPngUrl] = useState("");
  const [svgText, setSvgText] = useState("");
  const cleanValue = value.trim();
  const safeFilename = useMemo(
    () => filename.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "coverfi-qr",
    [filename],
  );

  useEffect(() => {
    let cancelled = false;
    setPngUrl("");
    setSvgText("");

    if (!cleanValue) return;

    const options = {
      errorCorrectionLevel: "H" as const,
      margin: 3,
      color: qrColors,
      width: size,
    };

    void Promise.all([
      QRCode.toDataURL(cleanValue, options),
      QRCode.toString(cleanValue, { ...options, type: "svg" as const }),
    ])
      .then(([nextPng, nextSvg]) => {
        if (cancelled) return;
        setPngUrl(nextPng);
        setSvgText(nextSvg);
      })
      .catch(() => {
        if (cancelled) return;
        setPngUrl("");
        setSvgText("");
      });

    return () => {
      cancelled = true;
    };
  }, [cleanValue, size]);

  return (
    <div className="grid gap-3">
      <div className="relative mx-auto grid place-items-center rounded-2xl border border-[#E1E0CC]/15 bg-black p-4 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        {pngUrl ? (
          <img
            src={pngUrl}
            width={size}
            height={size}
            alt={label}
            className="h-auto max-w-full rounded-xl"
          />
        ) : (
          <div
            className="grid place-items-center rounded-xl border border-dashed border-[#E1E0CC]/15 text-[#E1E0CC]/35"
            style={{ width: size, height: size }}>
            <QrCode className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-sm text-[#E1E0CC]">{label}</p>
        {caption && <p className="mt-1 text-xs leading-relaxed text-[#E1E0CC]/48">{caption}</p>}
      </div>
      {showDownloads && pngUrl && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => downloadDataUrl(pngUrl, `${safeFilename}.png`)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-3 text-xs uppercase tracking-widest text-[#E1E0CC]/75 transition-colors hover:bg-[#E1E0CC]/10">
            <Download className="h-3.5 w-3.5" />
            PNG
          </button>
          <button
            type="button"
            onClick={() => downloadText(svgText, `${safeFilename}.svg`, "image/svg+xml")}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E1E0CC]/20 px-3 text-xs uppercase tracking-widest text-[#E1E0CC]/75 transition-colors hover:bg-[#E1E0CC]/10">
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
        </div>
      )}
    </div>
  );
}
