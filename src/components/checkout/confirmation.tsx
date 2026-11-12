"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CircleCheck, Copy } from "lucide-react";
import { BrandSeal } from "@/components/brand-seal";
import { usePublicShop } from "@/components/public-shop-provider";
import { ThemeLink as Link } from "@/components/site-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./checkout.module.css";
import { loadReceipt } from "./state";

export function OrderConfirmation() {
  const [receipt, setReceipt] = useState<ReturnType<typeof loadReceipt>>();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const { links } = usePublicShop();
  const instagram = links.instagramDm || links.instagram;

  useEffect(() => {
    void Promise.resolve().then(() => { setReceipt(loadReceipt()); setReady(true); });
  }, []);

  async function copy(href?: string) {
    if (!receipt) return;
    let copyResult: Promise<boolean>;
    try { copyResult = navigator.clipboard.writeText(receipt.number).then(() => true, () => false); }
    catch { copyResult = Promise.resolve(false); }

    let chat: Window | null = null;
    if (href) {
      try {
        chat = window.open("about:blank", "_blank");
        if (chat) chat.opener = null;
      } catch {}
    }
    const copied = await copyResult;
    if (!copied) setManual(true);
    if (chat && href) {
      try { chat.location.replace(href); } catch { chat.close(); chat = null; }
    }
    setMessage(copied ? href && chat ? "Number copied. Paste it into the chat."
      : href ? "Number copied. Use the chat link below if it didn’t open." : "Order number copied."
      : "Select and copy the number below, then paste it into the chat.");
    if (href && !chat) setManual(true);
  }

  return <section className={`wrap ${styles.checkout} ${styles.confirmation}`} aria-labelledby="confirmation-heading">
    <div className={`${styles.panel} space-y-5`}>
      <div className="mx-auto w-16"><BrandSeal alt="" width={64} height={64} /></div>
      {receipt && <CircleCheck size={48} strokeWidth={1.5} className={`mx-auto ${styles.accent}`} aria-hidden />}
      <div className="space-y-1">
        <h1 id="confirmation-heading" className="text-3xl font-bold tracking-tight">{receipt ? "Order received" : "Order confirmation"}</h1>
        {receipt && <p>Awaiting confirmation in chat.</p>}
      </div>
      {!ready ? <p role="status">Loading your confirmation…</p> : receipt ? <>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Your order number</p>
          <p className={styles.receiptNumber}>{receipt.number}</p>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void copy()}><Copy aria-hidden /> Copy number</Button>
        <p className="text-sm">Send this number to the shop to confirm your order and arrange payment. For delivery, we’ll confirm the fee in chat.</p>
        {receipt.afterHours && <p className={`${styles.scheduleStrip} text-sm`}>We received your order after hours. The shop will reply in chat the next morning.</p>}
        {(instagram || links.messenger) && <div className="grid gap-2">
          {instagram && <Button type="button" variant="ghost" className={styles.primary} onClick={() => void copy(instagram)}>Copy number &amp; open Instagram <ArrowUpRight aria-hidden /></Button>}
          {links.messenger && <Button type="button" variant={instagram ? "outline" : "ghost"}
            className={instagram ? "min-h-11 whitespace-normal" : styles.primary} onClick={() => void copy(links.messenger)}>Copy number &amp; open Messenger <ArrowUpRight aria-hidden /></Button>}
        </div>}
        <div role="status" className={message ? "text-sm" : "sr-only"}>{message}</div>
        {manual && <div className="space-y-2">
          <Input readOnly aria-label="Order number to copy" value={receipt.number} onFocus={event => event.currentTarget.select()} />
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="underline">Open Instagram</a>}
            {links.messenger && <a href={links.messenger} target="_blank" rel="noopener noreferrer" className="underline">Open Messenger</a>}
          </div>
        </div>}
        <p className="text-sm text-muted-foreground">To change or cancel your order, message the shop and quote this number.</p>
      </> : <p>There’s no saved confirmation in this browser.</p>}
      <Link href="/order" className="text-sm font-semibold underline underline-offset-4">{receipt ? "Start another order" : "Go to checkout"}</Link>
    </div>
  </section>;
}
