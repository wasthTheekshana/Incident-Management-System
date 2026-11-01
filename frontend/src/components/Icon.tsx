const PATHS = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  plus: 'M12 5v14M5 12h14',
  building: 'M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  template: 'M5 4h14v16H5zM5 9h14M10 9v11',
  tag: 'M3 12V4h8l10 10-8 8L3 12Zm5-5h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 19a2 2 0 0 0 4 0',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5.1-1-.1-1 2-1.6-2-3.4-2.4.9a7 7 0 0 0-1.7-1L15 3.4h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-.9-2 3.4 2 1.6-.1 1 .1 1-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4.9 2-3.4-2-1.6Z',
  key: 'M14 10a4 4 0 1 0-3.5 4L21 14v3h-3v3h-3v-3l-2-1.5',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  menu: 'M4 7h16M4 12h16M4 17h16',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <Icon name="shield" size={Math.round(size * 0.6)} />
    </span>
  );
}
