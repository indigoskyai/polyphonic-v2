import RichBody from '@/components/rich/RichBody';

interface Props {
  payload: { markdown: string };
  mode: 'view' | 'edit';
}

export default function NoteTile({ payload }: Props) {
  return (
    <div
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        padding: 18, background: 'var(--surface-1)',
        color: 'var(--text-primary)',
      }}
    >
      <RichBody source={payload.markdown || '*Empty note*'} />
    </div>
  );
}
