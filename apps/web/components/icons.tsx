// Small hand-authored icon set — deliberately not a generic icon library
// import, to keep the visual language specific to this product (slightly
// heavier stroke, consistent 1.75px weight, rounded caps throughout).

type Props = { className?: string; size?: number; style?: React.CSSProperties };
const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconMark({ className, size = 20, style }: Props) {
  // The product mark: a plan becoming a path — three waypoints connected
  // by a drawn line, standing in for "describe -> plan -> run".
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <circle cx="5" cy="18" r="2.2" fill="var(--accent)" stroke="none" />
      <circle cx="12" cy="7" r="2.2" fill="var(--accent)" stroke="none" />
      <circle cx="19" cy="15" r="2.2" fill="var(--accent)" stroke="none" />
      <path d="M6.8 16.7 10.3 9.3M13.6 8.2 17.3 13" stroke="var(--accent)" />
    </svg>
  );
}

export function IconSun({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
    </svg>
  );
}

export function IconMoon({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function IconCheck({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function IconX({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M5 5 19 19M19 5 5 19" />
    </svg>
  );
}

export function IconClock({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconSpinner({ className, size, style }: Props) {
  return (
    <svg className={className} {...base(size)} aria-hidden style={{ animation: "spin 0.9s linear infinite", ...style }}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </svg>
  );
}

export function IconBell({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M6 10a6 6 0 1 1 12 0c0 4.2 1.4 5.8 2 6.5H4c.6-.7 2-2.3 2-6.5Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconUser({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c1-3.6 3.9-5.8 7-5.8s6 2.2 7 5.8" />
    </svg>
  );
}

export function IconLogout({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 16l4-4-4-4M20 12H9" />
    </svg>
  );
}

export function IconChevron({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M8 5l8 7-8 7" />
    </svg>
  );
}

export function IconLayers({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 13l9 5 9-5M3 18l9 5 9-5" style={{ opacity: 0.45 }} />
    </svg>
  );
}

export function IconShield({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <path d="M12 3.5 5 6v6c0 4.5 3 7.4 7 8.5 4-1.1 7-4 7-8.5V6Z" />
      <path d="M9 11.5l2 2 4-4.5" />
    </svg>
  );
}

export function IconUsers({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.7-3 2.9-4.8 5.5-4.8s4.8 1.8 5.5 4.8" />
      <circle cx="17" cy="9" r="2.3" style={{ opacity: 0.6 }} />
      <path d="M15.5 14.7c2.2.3 3.8 1.9 4.4 4.3" style={{ opacity: 0.6 }} />
    </svg>
  );
}

export function IconKey({ className, size, style }: Props) {
  return (
    <svg className={className} style={style} {...base(size)} aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l2 2M19 4l2 2" />
    </svg>
  );
}
