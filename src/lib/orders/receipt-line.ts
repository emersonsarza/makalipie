/** Read the stored quote, never current catalog prices, for receipt presentation. */
export function receiptLine(line: string) {
  const [head, ...extras] = line.split("\n");
  const match = /^(\d+) × (.+) · (.+) \((?:₱([\d,]+(?:\.\d{1,2})?) each|(Price to confirm))\)$/.exec(head);
  if (!match) return null;
  const quantity = Number(match[1]);
  const unitCentavos = match[4] ? Math.round(Number(match[4].replaceAll(",", "")) * 100) : null;
  return {
    title: match[2],
    size: match[3],
    quantity,
    unitAmount: unitCentavos === null ? null : `₱${(unitCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amount: unitCentavos === null ? "To confirm" : `₱${(unitCentavos * quantity / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    extras: extras.join("\n").trim(),
  };
}

export function receiptAddon(line: string) {
  const match = /^(.*) \((₱[\d,]+(?:\.\d{1,2})?)\)$/.exec(line);
  return match ? { title: match[1], amount: match[2] } : null;
}
