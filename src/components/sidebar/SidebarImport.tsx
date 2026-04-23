import SidebarHeader from './SidebarHeader';

export default function SidebarImport() {
  return (
    <>
      <SidebarHeader folio="§ 05" title="Import" />
      <div style={{ padding: '0 16px', flex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            fontWeight: 400,
            letterSpacing: 'var(--track-body)',
            color: 'var(--text-soft)',
            lineHeight: 1.55,
          }}
        >
          Bring conversations from ChatGPT, Claude, or local exports. Memories and beliefs are extracted into Mnemos.
        </div>
      </div>
    </>
  );
}
