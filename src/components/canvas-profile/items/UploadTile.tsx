import { File, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  payload: { storage_path: string; mime: string; original_name?: string; width?: number; height?: number };
  mode: 'view' | 'edit';
}

function publicUrl(path: string): string {
  const { data } = (supabase as any).storage.from('profile-uploads').getPublicUrl(path);
  return data?.publicUrl || '';
}

export default function UploadTile({ payload, mode }: Props) {
  const isImage = payload.mime?.startsWith('image/');
  const url = publicUrl(payload.storage_path);

  if (isImage) {
    return (
      <img
        src={url}
        alt={payload.original_name || ''}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none', borderRadius: 'inherit' }}
      />
    );
  }
  return (
    <a
      href={mode === 'view' ? url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { if (mode === 'edit') e.preventDefault(); }}
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 10,
        alignItems: 'center', justifyContent: 'center', background: 'var(--surface-1)',
        color: 'var(--text-body)', textDecoration: 'none', padding: 16,
      }}
    >
      <File size={28} strokeWidth={1.5} />
      <div style={{ fontSize: 12, textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.4 }}>
        {payload.original_name || 'file'}
      </div>
      {mode === 'view' && <Download size={12} style={{ opacity: 0.5 }} />}
    </a>
  );
}
