interface Props {
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
}

/** Generic sidebar row — label on the left, optional count on the right. */
export default function SidebarRow({ label, active, count, onClick }: Props) {
  return (
    <div
      className="flex items-center cursor-pointer"
      style={{
        padding: '7px 12px',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--overlay-active)' : undefined,
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--overlay-hover)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = ''; }}
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
    </div>
  );
}
