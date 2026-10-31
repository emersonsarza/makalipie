const separators = /[\s().-]/g;

/** Why a contact number cannot be saved, or null when it is usable. */
export function phoneNumberError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Add a contact number.";
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return "Use digits, spaces, or a leading + for the country code.";

  const compact = trimmed.replace(separators, "");
  if (compact.startsWith("+") || compact.startsWith("00")) {
    const digits = compact.replace(/^\+|00/, "");
    if (!/^[1-9]\d{7,14}$/.test(digits)) return "Add the country code and the full number, such as +63 917 123 4567.";
    return null;
  }
  if (/^0\d{9,10}$/.test(compact)) return null;
  if (/^9\d{9}$/.test(compact)) return null;
  return "Start with 0 or 9, or add a country code such as +63.";
}
