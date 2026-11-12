import type { NextRequest } from "next/server";
import { createSocialImage } from "@/lib/social-image";
import { socialImageTheme } from "@/lib/social-metadata";

export async function GET(request: NextRequest) {
  return createSocialImage("order", await socialImageTheme(request.nextUrl.searchParams.get("theme")));
}
