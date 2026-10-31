export function addressLines(address: string) {
  return address.split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
}

export function AddressLines({ address }: { address: string }) {
  return <span className="flex flex-col gap-0.5">{addressLines(address).map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</span>;
}
