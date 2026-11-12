"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortItem = { id: string };
type DropTarget = { id: string; edge: "before" | "after"; index: number };
type Drag = {
  id: string; pointer: number; handle: HTMLElement; preview: HTMLElement;
  x: number; y: number; offsetX: number; offsetY: number; frame: number;
  target?: DropTarget;
};

function scrollParent(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return document.scrollingElement as HTMLElement;
}

export function SortableList<T extends SortItem>({ items, label, row, onReorder, className, disabled }: {
  items: T[];
  label: (item: T) => string;
  row: (item: T, grip: ReactNode, controls: ReactNode) => ReactNode;
  onReorder: (items: T[]) => void;
  className?: string;
  disabled?: boolean;
}) {
  const list = useRef<HTMLUListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const drag = useRef<Drag | null>(null);
  const positions = useRef<Map<string, number> | null>(null);
  const animations = useRef(new Map<string, Animation>());
  const [active, setActive] = useState<string>();
  const [target, setTarget] = useState<DropTarget>();
  const [announcement, setAnnouncement] = useState("");

  function reorder(id: string, to: number, liftedTop?: number) {
    const from = items.findIndex(item => item.id === id);
    if (disabled || from < 0 || to < 0 || to >= items.length || from === to) return;
    positions.current = new Map([...rows.current].map(([key, element]) => [key, element.getBoundingClientRect().top]));
    if (liftedTop !== undefined) positions.current.set(id, liftedTop);
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder(next);
    setAnnouncement(`${label(item)} moved to position ${to + 1} of ${next.length}.`);
  }

  useLayoutEffect(() => {
    const previous = positions.current;
    positions.current = null;
    if (!previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, element] of rows.current) {
      const top = previous.get(id);
      if (top === undefined) continue;
      const delta = top - element.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      const animation = element.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
        { duration: 180, easing: getComputedStyle(element).getPropertyValue("--ease-out").trim() || "ease-out" },
      );
      animations.current.set(id, animation);
      animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id); };
    }
  }, [items]);

  useEffect(() => {
    const currentAnimations = animations.current;
    return () => {
      for (const animation of currentAnimations.values()) animation.cancel();
      if (drag.current) {
        cancelAnimationFrame(drag.current.frame);
        drag.current.preview.remove();
      }
    };
  }, []);

  function updateDrag(state: Drag) {
    const bounds = list.current?.getBoundingClientRect();
    if (!bounds) return;
    state.preview.style.transform = `translate3d(${state.x - state.offsetX}px,${state.y - state.offsetY}px,0)`;
    const candidates = items.filter(item => item.id !== state.id);
    const firstBelow = candidates.findIndex(item => {
      const rect = rows.current.get(item.id)?.getBoundingClientRect();
      return rect && state.y < rect.top + rect.height / 2;
    });
    const next = state.x >= bounds.left && state.x <= bounds.right
      && state.y >= bounds.top && state.y <= bounds.bottom && state.y >= 0 && state.y <= window.innerHeight
      ? firstBelow >= 0
        ? { id: candidates[firstBelow].id, edge: "before" as const, index: firstBelow }
        : { id: candidates.at(-1)!.id, edge: "after" as const, index: candidates.length }
      : undefined;
    if (state.target?.id !== next?.id || state.target?.edge !== next?.edge) setTarget(next);
    state.target = next;
  }

  function begin(event: PointerEvent<HTMLElement>, id: string) {
    if (disabled || drag.current || items.length < 2 || !event.isPrimary || event.button !== 0) return;
    const element = rows.current.get(id);
    if (!element) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const preview = document.createElement("div");
    const clone = element.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-dragging");
    clone.removeAttribute("data-drop-edge");
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    // Keep the visual row, including expanded size fields, out of the focus order.
    preview.inert = true;
    preview.setAttribute("aria-hidden", "true");
    preview.className = "admin-theme admin-sort-preview";
    preview.style.width = `${bounds.width}px`;
    preview.append(clone);
    document.body.append(preview);
    handle.setPointerCapture(event.pointerId);
    const state: Drag = { id, pointer: event.pointerId, handle, preview, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, frame: 0 };
    drag.current = state;
    setActive(id);
    updateDrag(state);

    const scroller = scrollParent(element);
    function tick() {
      if (drag.current !== state) return;
      const viewport = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      const bounds = list.current?.getBoundingClientRect();
      if (bounds && state.x >= bounds.left && state.x <= bounds.right) {
        const top = Math.max(0, viewport.top);
        const bottom = Math.min(window.innerHeight, viewport.bottom);
        const speed = state.y < top + 48 ? -Math.min(14, (top + 48 - state.y) / 3)
          : state.y > bottom - 48 ? Math.min(14, (state.y - bottom + 48) / 3) : 0;
        if (speed) {
          const before = scroller.scrollTop;
          scroller.scrollTop += speed;
          if (scroller.scrollTop !== before) updateDrag(state);
        }
      }
      state.frame = requestAnimationFrame(tick);
    }
    state.frame = requestAnimationFrame(tick);
  }

  function end(commit: boolean) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    cancelAnimationFrame(state.frame);
    state.preview.remove();
    if (state.handle.hasPointerCapture(state.pointer)) state.handle.releasePointerCapture(state.pointer);
    setActive(undefined);
    setTarget(undefined);
    if (commit && state.target) reorder(state.id, state.target.index, state.y - state.offsetY);
    else setAnnouncement("Reordering cancelled.");
  }

  useEffect(() => {
    if (!active) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const state = drag.current;
        if (state) {
          drag.current = null;
          cancelAnimationFrame(state.frame);
          state.preview.remove();
          if (state.handle.hasPointerCapture(state.pointer)) state.handle.releasePointerCapture(state.pointer);
        }
        setActive(undefined);
        setTarget(undefined);
        setAnnouncement("Reordering cancelled.");
      }
    };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [active]);

  return <>
    <ul ref={list} className={cn("divide-y", className)}>
      {items.map((item, index) => {
        const name = label(item);
        const grip = <span aria-hidden="true" className="inline-grid size-8 shrink-0 touch-none cursor-grab place-items-center select-none text-muted-foreground active:cursor-grabbing"
          onPointerDown={event => begin(event, item.id)}
          onPointerMove={event => {
            const state = drag.current;
            if (!state || event.pointerId !== state.pointer) return;
            state.x = event.clientX;
            state.y = event.clientY;
            updateDrag(state);
          }}
          onPointerUp={event => {
            const state = drag.current;
            if (!state || event.pointerId !== state.pointer) return;
            state.x = event.clientX;
            state.y = event.clientY;
            updateDrag(state);
            end(true);
          }}
          onPointerCancel={() => end(false)}
          onLostPointerCapture={() => end(false)}
        ><GripVertical className="size-4" /></span>;
        const controls = <div className="flex shrink-0 gap-1">
          <Button type="button" variant="outline" size="icon-sm" aria-label={`Move ${name} up`} aria-disabled={disabled || index === 0} onClick={() => reorder(item.id, index - 1)}><ArrowUp aria-hidden /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={`Move ${name} down`} aria-disabled={disabled || index === items.length - 1} onClick={() => reorder(item.id, index + 1)}><ArrowDown aria-hidden /></Button>
        </div>;
        return <li key={item.id} ref={element => { if (element) rows.current.set(item.id, element); else rows.current.delete(item.id); }}
          data-dragging={active === item.id || undefined} data-drop-edge={target?.id === item.id ? target.edge : undefined}
          className="admin-sort-row relative">
          {row(item, grip, controls)}
        </li>;
      })}
    </ul>
    <p role="status" className="sr-only">{announcement}</p>
  </>;
}
