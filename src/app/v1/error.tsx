"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="admin-state"><p className="admin-eyebrow">MAKALIPIE</p><h1>We couldn’t open your workspace.</h1><p>Your account or connection may be temporarily unavailable. Please try again.</p><Button onClick={reset}>Try again</Button><Link href="/admin/login">Return to sign-in</Link></main>;
}
