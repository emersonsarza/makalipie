export function formatCebuAddress(address: string) {
  return address.trim() === "2nd Floor, Streetscape, Banilad, Cebu City"
    ? "2nd Floor, Streetscape\nBanilad, Cebu City"
    : address;
}

export function AddressLines({ address, cebu }: { address: string; cebu?: boolean }) {
  const lines = (cebu ? formatCebuAddress(address) : address).split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean);
  return <span className="flex flex-col gap-0.5">{lines.map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</span>;
}
