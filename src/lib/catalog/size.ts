/** Customer-facing size. Stored labels stay strings such as `4"` so packing can still recognize them. */
export function storedSizeLabel(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d{1,2})?)\s*(?:(?:-| )?\s*inch(?:es)?|[″"])?$/i);
  if (!match) return null;
  const number = match[1].replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const inches = Number(number);
  if (!Number.isFinite(inches) || inches <= 0 || inches > 30) return null;
  return `${number}"`;
}

export function inchesInputValue(label: string): string {
  const trimmed = label.trim();
  if (/^\d*(?:\.\d{0,2})?$/.test(trimmed)) return trimmed;
  const stored = storedSizeLabel(trimmed);
  return stored ? stored.slice(0, -1) : "";
}

export function customerSizeLabel(label: string): string | null {
  return storedSizeLabel(label);
}

export function flavorSizeName(name: string, label: string): string {
  const size = customerSizeLabel(label);
  return size ? `${name} · ${size}` : name;
}
