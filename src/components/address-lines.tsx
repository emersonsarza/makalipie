export function addressLines(address: string, pairCommaParts = false) {
  const lines = address.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (pairCommaParts && lines.length > 1) return lines;
  const parts = lines.flatMap(line => line.split(",").map(part => part.trim()).filter(Boolean));
  return pairCommaParts
    ? parts.flatMap((part, index) => index % 2 === 0 ? [parts.slice(index, index + 2).join(", ")] : [])
    : parts;
}

export function AddressLines({ address, pairCommaParts }: { address: string; pairCommaParts?: boolean }) {
  return <span className="flex flex-col gap-0.5">{addressLines(address, pairCommaParts).map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</span>;
}
