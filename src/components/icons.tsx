/** Small stroke icons. Decorative: they are always paired with visible text or an accessible name on the button. */
const paths = {
  bag: (<><path d="M5.5 8h13l1 12.5h-15L5.5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>),
  heart: (<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.8 8 3.6 4.8 6.9 4.8c2 0 3.7 1.1 5.1 3 1.4-1.9 3.1-3 5.1-3 3.3 0 5.1 3.2 4.1 6.3-1.7 4.8-9.2 9.4-9.2 9.4Z" />),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>),
  close: (<path d="M6 6l12 12M18 6 6 18" />),
  menu: (<path d="M3 7h18M3 12h18M3 17h18" />),
  "arrow-left": (<path d="M19 12H5m6-6-6 6 6 6" />),
  "arrow-right": (<path d="M5 12h14m-6-6 6 6-6 6" />),
  "chevron-down": (<path d="m6 9 6 6 6-6" />),
  "chevron-left": (<path d="m15 6-6 6 6 6" />),
  "chevron-right": (<path d="m9 6 6 6-6 6" />),
  check: (<path d="m5 12.5 4.5 4.5L19 7.5" />),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5" /></>),
  plus: (<path d="M12 5v14M5 12h14" />),
  minus: (<path d="M5 12h14" />),
  trash: (<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  pin: (<><path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.800 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  send: (<><path d="M21.5 2.5 10.5 13.500" /><path d="M21.5 2.5 14.500 21.500l-4-8-8-4 19-7Z" /></>),
  card: (<><rect x="2.500" y="5" width="19" height="14" rx="2.500" /><path d="M2.500 10h19" /></>),
  eye: (<><path d="M2 12s3.800-7 10-7 10 7 10 7-3.800 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  filter: (<path d="M4 6h16M7 12h10M10 18h4" />),
  grid: (<><rect x="4" y="4" width="6.500" height="6.500" /><rect x="13.500" y="4" width="6.500" height="6.500" /><rect x="4" y="13.500" width="6.500" height="6.500" /><rect x="13.500" y="13.500" width="6.500" height="6.500" /></>),
  ruler: (<><path d="M3 17 17 3l4 4L7 21l-4-4Z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" /></>),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, className = "", strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}
