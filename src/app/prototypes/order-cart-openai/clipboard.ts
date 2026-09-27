/** Clipboard access can fail in insecure contexts or when permission is denied. */
export async function tryCopySummary(
  summary: string,
  write: (text: string) => Promise<void> = (text) =>
    navigator.clipboard.writeText(text),
): Promise<boolean> {
  try {
    await write(summary);
    return true;
  } catch {
    return false;
  }
}
