function forwarded(request: Request, name: string) {
  return request.headers.get(name)?.split(",")[0]?.trim() ?? "";
}

export function publicUrl(request: Request) {
  const incoming = new URL(request.url);
  const host = forwarded(request, "x-forwarded-host") || request.headers.get("host") || incoming.host;
  const proto = forwarded(request, "x-forwarded-proto") || incoming.protocol.replace(":", "");
  return new URL(`${proto}://${host}`);
}

export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = publicUrl(request);
    return source.protocol === target.protocol && source.host === target.host;
  } catch {
    return false;
  }
}
