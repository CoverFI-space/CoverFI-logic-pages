import { useRef } from "react";

export function CodeBoxes({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || "");

  function setDigit(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6);
      onChange(next);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = clean;
    const next = nextDigits.join("").slice(0, 6);
    onChange(next);
    if (clean && index < 5) refs.current[index + 1]?.focus();
  }

  return (
    <label className="grid gap-3 text-sm text-[#E1E0CC]/60">
      {label}
      <div className="grid grid-cols-6 gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            value={digit}
            disabled={disabled}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !digits[index] && index > 0) {
                refs.current[index - 1]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              setDigit(index, event.clipboardData.getData("text"));
            }}
            className="h-12 rounded-xl border border-[#E1E0CC]/12 bg-black/35 text-center text-lg text-[#E1E0CC] outline-none transition-colors focus:border-[#E1E0CC]/45 disabled:cursor-not-allowed disabled:opacity-60"
          />
        ))}
      </div>
    </label>
  );
}
