const legacyVerifiedSslModes = new Set(["prefer", "require", "verify-ca"]);

export function normalizePostgresTlsVerification(
  connectionString: string,
): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    return connectionString;
  }

  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (!sslMode || !legacyVerifiedSslModes.has(sslMode)) {
    return connectionString;
  }

  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
