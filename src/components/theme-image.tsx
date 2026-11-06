import Image, { type ImageProps } from "next/image";
import type { CSSProperties } from "react";
import { seasonalPhoto } from "@/lib/seasonal-images";

/** CSS picks the correct image before hydration, including inside order-summary portals. */
export function ThemeImage({ seasonalKey, seasonal = true, ...props }: ImageProps & { seasonalKey?: string; seasonal?: boolean }) {
  const christmas = seasonalPhoto(props.src, seasonal, seasonalKey);
  if (!christmas) return <Image {...props} alt={props.alt} />;
  const style = {
    ...props.style,
    "--seasonal-photo-position": christmas.position,
    "--seasonal-photo-mobile-position": christmas.mobilePosition,
  } as CSSProperties;
  // Hidden lazy images do not compete with the visible theme's photo. The active
  // hero receives high fetch priority without preloading both variants.
  const { priority, preload, loading, fetchPriority, ...imageProps } = props;
  const importance = priority || preload || loading === "eager" ? "high" : fetchPriority;
  return <>
    <Image {...imageProps} alt={props.alt} loading="lazy" fetchPriority={importance} data-theme-photo="original" />
    <Image {...imageProps} loading="lazy" fetchPriority={importance} src={christmas.src} alt={props.alt === "" ? "" : christmas.alt} unoptimized={props.unoptimized} className={`${props.className ?? ""} seasonal-photo`} style={style} data-theme-photo="christmas" />
  </>;
}
