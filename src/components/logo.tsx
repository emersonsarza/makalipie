import { cn } from "@/lib/utils";

export function pieCrustPath(
  cx: number,
  cy: number,
  radius: number,
  scallops: number,
  depth: number
) {
  const parts: string[] = [];

  for (let i = 0; i < scallops; i++) {
    const start = (i / scallops) * Math.PI * 2 - Math.PI / 2;
    const end = ((i + 1) / scallops) * Math.PI * 2 - Math.PI / 2;
    const mid = (start + end) / 2;
    const x0 = cx + radius * Math.cos(start);
    const y0 = cy + radius * Math.sin(start);
    const qx = cx + (radius + depth) * Math.cos(mid);
    const qy = cy + (radius + depth) * Math.sin(mid);
    const x1 = cx + radius * Math.cos(end);
    const y1 = cy + radius * Math.sin(end);

    if (i === 0) parts.push(`M ${x0.toFixed(2)} ${y0.toFixed(2)}`);
    parts.push(
      `Q ${qx.toFixed(2)} ${qy.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`
    );
  }

  parts.push("Z");
  return parts.join(" ");
}

export const logoColors = {
  gold: "#F4C430",
  charcoal: "#2C2A28",
  cream: "#FFF8F0",
} as const;

const GOLD = logoColors.gold;
const CHARCOAL = logoColors.charcoal;
const CREAM = logoColors.cream;

type LogoProps = {
  className?: string;
  title?: string;
  markId?: string;
};

export function LogoMark({
  className,
  title = "Makalipie",
  markId = "logo",
}: LogoProps) {
  const outer = pieCrustPath(100, 100, 84, 18, 11);
  const inner = pieCrustPath(100, 100, 78, 18, 10);
  const topArc = `${markId}-top-arc`;
  const bottomArc = `${markId}-bottom-arc`;

  return (
    <svg
      viewBox="0 0 200 200"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <path
          id={topArc}
          d="M 48 108 A 56 56 0 0 1 152 108"
          fill="none"
        />
        <path
          id={bottomArc}
          d="M 150 118 A 54 54 0 0 1 50 118"
          fill="none"
        />
      </defs>
      <path d={outer} fill={GOLD} />
      <path d={inner} fill={CHARCOAL} />

      <text
        fill={CREAM}
        fontSize="11"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="2.2"
      >
        <textPath href={`#${topArc}`} startOffset="50%" textAnchor="middle">
          TARTS &amp; PIES
        </textPath>
      </text>
      <text
        fill={CREAM}
        fontSize="9.5"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="1.6"
      >
        <textPath
          href={`#${bottomArc}`}
          startOffset="50%"
          textAnchor="middle"
        >
          SWEET &amp; SAVOURY
        </textPath>
      </text>

      <text
        x="38"
        y="106"
        fill={CREAM}
        fontSize="8"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="1.4"
        textAnchor="middle"
      >
        EST.
      </text>
      <text
        x="162"
        y="106"
        fill={CREAM}
        fontSize="8"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="1.2"
        textAnchor="middle"
      >
        2020
      </text>

      <circle cx="88" cy="88" r="4.2" fill={GOLD} />
      <circle cx="112" cy="88" r="4.2" fill={GOLD} />
      <path
        d="M 84 104 Q 100 118 116 104"
        fill="none"
        stroke={GOLD}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <text
        x="100"
        y="138"
        fill={GOLD}
        fontSize="9"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
        letterSpacing="2.4"
        textAnchor="middle"
      >
        MAKALIPIE
      </text>
    </svg>
  );
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-11 shrink-0 sm:size-12" markId="nav-logo" />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[1.15rem] font-semibold tracking-tight text-charcoal sm:text-xl">
          Makalipie
        </span>
        <span className="mt-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-charcoal/60 uppercase">
          Tarts &amp; pies
        </span>
      </span>
    </span>
  );
}
