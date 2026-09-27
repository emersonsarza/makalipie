"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function SessionControls({
  appearance = "default",
}: {
  appearance?: "default" | "sidebar";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let checking = false;
    const controller = new AbortController();
    async function check() {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store", signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          window.location.replace(`/admin/login?reason=${response.status === 403 ? "access" : "session"}`);
        }
      } catch {
        // Network failure is not evidence that the user's session was revoked.
      } finally {
        checking = false;
      }
    }
    const onShow = () => {
      void check();
    };
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onShow);
    const interval = window.setInterval(onShow, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Sign-out failed");
      window.location.replace("/admin/login");
    } catch {
      setError("Couldn’t sign out. Please try again.");
      setPending(false);
    }
  }

  if (appearance === "sidebar") {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={pending ? "Signing out…" : "Sign out"}
          type="button"
          disabled={pending}
          onClick={() => void logout()}
        >
          <LogOut />
          <span>{pending ? "Signing out…" : "Sign out"}</span>
        </SidebarMenuButton>
        {error && (
          <p role="alert" className="admin-error-message px-2 pt-1">
            {error}
          </p>
        )}
      </SidebarMenuItem>
    );
  }

  return (
    <div className="admin-signout">
      <Button variant="ghost" onClick={() => void logout()} disabled={pending}>
        <LogOut aria-hidden="true" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && (
        <p role="alert" className="admin-error-message">
          {error}
        </p>
      )}
    </div>
  );
}
