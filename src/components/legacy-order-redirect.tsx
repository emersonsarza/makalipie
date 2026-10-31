"use client";
import { useEffect } from "react";

/** A browser redirect retains private edit/reorder fragments, which the server cannot read. */
export function LegacyOrderRedirect() {
  useEffect(()=>{
    const query = new URLSearchParams(window.location.search);
    query.set("legacyDraft","preorder");
    window.location.replace(`/order?${query.toString()}${window.location.hash}`);
  },[]);
  return <p role="status">Opening your order… <a href="/order">Continue to ordering</a></p>;
}
