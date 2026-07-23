const configuredStatusUrl = String(
  import.meta.env.VITE_COVERFI_STATUS_URL || "",
).trim();

export const publicStatusUrl = configuredStatusUrl
  ? configuredStatusUrl.startsWith("/")
    ? `https://coverfi.space${configuredStatusUrl}`
    : configuredStatusUrl
  : "https://coverfi.space/status";
