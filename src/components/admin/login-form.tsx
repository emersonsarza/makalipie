"use client";

import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserAuth } from "@/lib/firebase/client";

function signInError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a little before trying again.";
  if (code === "auth/network-request-failed") return "Could not connect. Check your internet connection and try again.";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/user-disabled", "auth/invalid-email"].includes(String(code))) {
    return "We couldn’t sign you in. Check your email and password and try again.";
  }
  return "Sign-in is temporarily unavailable. Please try again shortly.";
}

export function LoginForm({ configured, notice }: { configured: boolean; notice?: string }) {
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !configured) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    let completed = false;
    try {
      const auth = await getBrowserAuth();
      try {
        const result = await signInWithEmailAndPassword(auth, String(data.get("email")).trim(), String(data.get("password")));
        const response = await fetch("/api/admin/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: await result.user.getIdToken() }),
        });
        if (!response.ok) {
          const body = await response.json();
          setError(body.error || "We couldn’t finish signing you in. Please try again.");
          return;
        }
        completed = true;
      } finally {
        await signOut(auth);
      }
      // A full navigation discards any stale protected-page router cache.
      window.location.replace("/admin");
    } catch (error) {
      setError(signInError(error));
      completed = false;
    } finally {
      if (!completed) setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="admin-login-form" aria-busy={pending}>
      {!configured && <div className="admin-notice" role="status">Sign-in is being set up. Please check back shortly.</div>}
      {notice && <div className="admin-notice" role="status">{notice}</div>}
      <div className="admin-field">
        <Label htmlFor="admin-email">Email address</Label>
        <Input id="admin-email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required maxLength={254} disabled={pending || !configured} aria-describedby={error ? "login-error" : undefined} />
      </div>
      <div className="admin-field">
        <Label htmlFor="admin-password">Password</Label>
        <div className="admin-password">
          <Input id="admin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={4096} disabled={pending || !configured} aria-describedby={error ? "login-error" : undefined} />
          <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} disabled={pending || !configured}>
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
      </div>
      {error && <p id="login-error" className="admin-error-message" role="alert">{error}</p>}
      <Button type="submit" className="admin-primary" disabled={pending || !configured}>
        {pending ? <><LoaderCircle className="admin-spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <ArrowRight aria-hidden="true" /></>}
      </Button>
      <p className="admin-form-note">Owners and assigned branch staff. Need help signing in? Contact the person who manages your account.</p>
    </form>
  );
}
