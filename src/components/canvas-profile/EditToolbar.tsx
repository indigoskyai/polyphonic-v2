import { useState } from 'react';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import { Plus, Image as ImageIcon, FileText, Box, Home as HomeIcon, X } from 'lucide-react';
import AddArtifactPicker from './AddArtifactPicker';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  onExit: () => void;
  viewport: { x: number; y: number; zoom: number };
}

export default function EditToolbar({ onExit, viewport }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addItem = useProfileCanvasStore((s) => s.addItem);
  const updateProfile = useProfileCanvasStore((s) => s.updateProfile);
  const profile = useProfileCanvasStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  // drop position = current viewport center, in canvas units
  const dropPos = () => {
    const rect = document.querySelector('.canvas-root')?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: rect.width / 2 / viewport.zoom - viewport.x - 160,
      y: rect.height / 2 / viewport.zoom - viewport.y - 100,
    };
  };

  const addNote = async () => {
    const p = dropPos();
    await addItem({ item_type: 'note', x: p.x, y: p.y, w: 320, h: 220, z: Date.now() % 100000, rotation: 0, payload: { markdown: '# New note\n\nWrite something here.' }, caption: null, published: true });
  };

  const addUpload = async () => {
    if (!user) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await (supabase as any).storage.from('profile-uploads').upload(path, file, {
        cacheControl: '31536000', upsert: false, contentType: file.type,
      });
      if (error) { alert(error.message); return; }
      const isImage = file.type.startsWith('image/');
      const p = dropPos();
      await addItem({
        item_type: 'upload',
        x: p.x, y: p.y,
        w: isImage ? 360 : 220,
        h: isImage ? 280 : 220,
        z: Date.now() % 100000, rotation: 0,
        payload: { storage_path: path, mime: file.type, original_name: file.name },
        caption: null, published: true,
      });
    };
    input.click();
  };

  const setHome = () => {
    updateProfile({ home_viewport: viewport });
  };

  return (
    <>
      <div
        style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          borderRadius: 999, padding: '6px 8px',
          boxShadow: '0 14px 40px -16px rgba(0,0,0,0.6)',
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)',
          color: 'var(--text-soft)', textTransform: 'uppercase',
          zIndex: 50,
        }}
      >
        <span style={{ padding: '0 6px' }}>edit mode</span>
        <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <ToolbarBtn onClick={() => setPickerOpen(true)} icon={<Box size={12} />} label="artifact" />
        <ToolbarBtn onClick={addUpload} icon={<ImageIcon size={12} />} label="upload" />
        <ToolbarBtn onClick={addNote} icon={<FileText size={12} />} label="note" />
        <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <ToolbarBtn onClick={setHome} icon={<HomeIcon size={12} />} label="set home" />
        <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <ToolbarBtn onClick={onExit} icon={<X size={12} />} label="done" />
      </div>

      {pickerOpen && profile && (
        <AddArtifactPicker
          onClose={() => setPickerOpen(false)}
          onPick={async (artifactId) => {
            const p = dropPos();
            await addItem({
              item_type: 'artifact', x: p.x, y: p.y, w: 480, h: 360, z: Date.now() % 100000,
              rotation: 0, payload: { artifact_id: artifactId }, caption: null, published: true,
            });
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

function ToolbarBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-body)', padding: '4px 8px', borderRadius: 999,
        fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--overlay-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </button>
  );
}
