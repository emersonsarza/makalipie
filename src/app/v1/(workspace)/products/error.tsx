"use client";
import { Button } from "@/components/ui/button";

export default function ProductLoadError({ reset }: { reset: () => void }) {
  return <div className="product-empty"><h1>We couldn’t load your products.</h1><p>Your saved menu hasn’t changed. Check your connection and try again.</p><Button onClick={reset}>Try again</Button></div>;
}
