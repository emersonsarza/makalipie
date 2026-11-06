import Image from "next/image";

/** Christmas and original seals stacked; the active theme picks one before paint. */
export function BrandSeal({
  alt,
  width,
  height,
  priority = false,
}: {
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <span className="brand-seal">
      <Image
        className="seal-christmas"
        src="/brand/seal-christmas.png"
        alt={alt}
        width={width}
        height={height}
        loading="lazy" fetchPriority={priority ? "high" : undefined}
      />
      <Image className="seal-original" src="/brand/seal.png" alt={alt} width={width} height={height} loading="lazy" fetchPriority={priority ? "high" : undefined} />
    </span>
  );
}
