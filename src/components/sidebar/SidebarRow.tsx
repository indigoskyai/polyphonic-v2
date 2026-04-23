interface Props {
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
}

/** Generic sidebar row — label on the left, optional count on the right. */
export default function SidebarRow({ label, active, count, onClick }: Props) {
  return (
    <button
      type="button"
      className="sidebar-row w-full flex items-center cursor-pointer text-left"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          fontWeight: active ? 500 : 400,
          letterSpacing: 'var(--track-body)',
          color: active ? 'var(--text-primary)' : 'var(--text-body)',
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-mono)',
            color: active ? 'var(--text-soft)' : 'var(--text-ghost)',
            marginLeft: 8,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
