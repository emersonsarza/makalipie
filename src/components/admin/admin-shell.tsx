"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, ChefHat, ClipboardList, LayoutDashboard, MapPin, Menu, Package, Settings2, SlidersHorizontal, Store, Tags } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { SessionControls } from "@/components/admin/session-controls";
import styles from "./admin-shell.module.css";

type Branch = { id: string; name: string };
const BranchContext = createContext<string>("all");
export const useAdminBranch = () => useContext(BranchContext);
const WorkspaceContext = createContext<{ role: "owner" | "staff"; branches: Branch[]; selectBranch: (value: string, query?: string) => void }>({ role: "staff", branches: [], selectBranch: () => {} });
export const useAdminWorkspace = () => useContext(WorkspaceContext);
const groups = [
  { label: "Today", items: [{ slug: "", label: "Dashboard", icon: LayoutDashboard }, { slug: "orders", label: "Orders", icon: ClipboardList }, { slug: "kitchen", label: "Kitchen", icon: ChefHat }] },
  { label: "Selling", items: [{ slug: "catalog", label: "Catalog", icon: Tags }, { slug: "packages", label: "Packages", icon: Package }, { slug: "allocation", label: "Daily allocation", icon: SlidersHorizontal }] },
  { label: "Branches", items: [{ slug: "branches", label: "Branches", icon: Store }, { slug: "schedule", label: "Schedule", icon: CalendarDays }, { slug: "popups", label: "Pop-ups", icon: MapPin }] },
  { label: "Shop", items: [{ slug: "settings", label: "Settings", icon: Settings2 }] },
];
const shopWide = new Set(["catalog", "branches", "popups", "settings"]);
const flushPages = new Set(["catalog", "packages", "orders", "kitchen", "branches", "popups", "settings"]);
const HeaderSlotContext = createContext<HTMLElement | null>(null);
export function AdminHeaderTools({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  if (!slot) return null;
  return createPortal(children, slot);
}

export function AdminShell({ name, role, branches, children }: { name: string; role: "owner" | "staff"; branches: Branch[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [branch, setBranch] = useState(role === "owner" ? "all" : branches[0]?.id ?? "");
  const slug = pathname.split("/")[2] || "";
  const page = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))).find((item) => item.slug === slug);
  const title = page?.label || "Workspace";
  const branchName = branch === "all" ? "All branches" : branches.find((item) => item.id === branch)?.name || "No branch assigned";
  const initials = name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    const restore = () => {
      let saved = "";
      try { saved = sessionStorage.getItem("makalipie-admin-branch") || ""; } catch { /* URL remains available. */ }
      const value = new URLSearchParams(window.location.search).get("branch") || saved;
      if ((value === "all" && role === "owner") || branches.some((item) => item.id === value)) setBranch(value);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [branches, role]);

  function selectBranch(value: string, query?: string) {
    setBranch(value);
    try { sessionStorage.setItem("makalipie-admin-branch", value); } catch { /* Selection still carries in links. */ }
    const params = new URLSearchParams(query ?? window.location.search);
    params.set("branch", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const navigation = (mobile: boolean) => <>
    <Link href={`/admin?branch=${encodeURIComponent(branch)}`} className={styles.brand} onClick={() => setMobileOpen(false)} aria-label="Makalipie admin home">
      <Image src="/brand/seal.png" alt="" width={44} height={44} />
      <span><strong>makalipie</strong></span>
    </Link>
    <div className={styles.tools}>
      <label className={styles.branchLabel} htmlFor={mobile ? "mobile-admin-branch" : "admin-branch"}>Working branch</label>
      <div className={styles.branchControl}><Store size={17} aria-hidden /><select id={mobile ? "mobile-admin-branch" : "admin-branch"} value={branch} onChange={(event) => selectBranch(event.target.value)} disabled={!branches.length && role !== "owner"}>
        {role === "owner" && <option value="all">All branches</option>}
        {!branches.length && role !== "owner" && <option value="">No branch assigned</option>}
        {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></div>
    </div>
    <nav className={styles.navigation} aria-label="Admin navigation">
      {groups.map((group) => {
        const items = group.items.filter((item) => role === "owner" || item.slug === "orders");
        if (!items.length) return null;
        return <div className={styles.group} key={group.label}><p>{group.label}</p>{items.map((item) => <Link key={item.slug} href={`/admin${item.slug ? `/${item.slug}` : ""}?branch=${encodeURIComponent(branch)}`} className={styles.navLink} aria-current={slug === item.slug ? "page" : undefined} onClick={() => setMobileOpen(false)}><item.icon size={19} strokeWidth={1.7} aria-hidden /><span>{item.label}</span>{slug === item.slug && <span className={styles.activeDot} aria-hidden />}</Link>)}</div>;
      })}
    </nav>
    <div className={styles.sidebarBottom}>
      <Link href="/" target="_blank" rel="noreferrer" className={styles.website}>View website <ArrowUpRight size={16} aria-hidden /><span className="sr-only"> (opens in a new tab)</span></Link>
      <div className={styles.identity}><span className={styles.avatar} aria-hidden>{initials}</span><span className={styles.person}><strong title={name}>{name}</strong><small>{role === "owner" ? "Owner" : "Staff"}</small></span></div>
      <SessionControls />
    </div>
  </>;

  return <WorkspaceContext.Provider value={{ role, branches, selectBranch }}><BranchContext.Provider value={branch}><HeaderSlotContext.Provider value={headerSlot}><div className={styles.shell}>
    <a className={styles.skip} href="#admin-content">Skip to page content</a>
    <aside className={styles.sidebar}>{navigation(false)}</aside>
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.headerStart}>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className={styles.menuButton} aria-label="Open navigation"><Menu size={21} aria-hidden /></SheetTrigger>
            <SheetContent side="left" className={styles.mobilePanel}>
              <SheetTitle className="sr-only">Makalipie navigation</SheetTitle><SheetDescription className="sr-only">Choose a branch or an admin page.</SheetDescription>
              {navigation(true)}
            </SheetContent>
          </Sheet>
          <h1>{title}</h1>
        </div>
        <div className={styles.headerEnd}><div ref={setHeaderSlot} className={styles.headerTools} /><span className={styles.scope}><Store size={15} aria-hidden /><span>{shopWide.has(slug) ? "Shop-wide" : branchName}</span></span></div>
      </header>
      <main id="admin-content" tabIndex={-1} className={flushPages.has(slug) ? `${styles.content} ${styles.contentFlush}` : `${styles.content} ${styles.contentInset}`} aria-label={`${title} page`}>{children}</main>
    </div>
  </div></HeaderSlotContext.Provider></BranchContext.Provider></WorkspaceContext.Provider>;
}
