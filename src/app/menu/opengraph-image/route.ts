import type { NextRequest } from "next/server";
import { createSocialImage } from "@/lib/social-image";
import { resolveSiteTheme } from "@/lib/site-theme";

export function GET(request: NextRequest) {
  return createSocialImage("menu", resolveSiteTheme(request.nextUrl.searchParams.get("theme")));
}
