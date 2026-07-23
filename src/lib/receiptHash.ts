export type CanonicalReceiptValue =
  | string
  | number
  | boolean
  | null
  | CanonicalReceiptValue[]
  | { [key: string]: CanonicalReceiptValue };

export function canonicalJson(value: CanonicalReceiptValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256CanonicalReceipt(value: CanonicalReceiptValue) {
  const encoded = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  return {
    bytes,
    hex: bytesToHex(bytes),
  };
}
