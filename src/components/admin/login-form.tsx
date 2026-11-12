"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function messageFor(status: number, error: string) {
  if (status === 401) return "That email and password combination wasn’t recognized.";
  if (status === 429) return "Too many sign-in attempts. Please wait a little and try again.";
  if (status === 400) return "Enter a valid email address and password.";
  if (status >= 500 || error === "temporary_failure") return "Sign-in is temporarily unavailable. Please try again.";
  return "We couldn’t sign you in. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(messageFor(response.status, result.error ?? ""));
        return;
      }
      router.replace("/admin/orders");
      router.refresh();
    } catch {
      setError("We couldn’t reach sign-in. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="admin-login-card gap-8 overflow-visible border-0 shadow-none ring-0">
      <CardHeader className="gap-0 px-0">
        <Image src="/brand/seal.png" alt="Makalipie" width={72} height={72} className="mb-7 size-[72px]" />
        <h1 className="admin-login-title">Sign in</h1>
        <CardDescription className="mt-2 text-base">Manage your Makalipie shop.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form className="space-y-6" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <Alert role="alert" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button type="submit" className="h-12 w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
