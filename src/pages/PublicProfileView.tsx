import ComingSoonCover from '@/components/common/ComingSoonCover';

interface Props { mode: 'view' | 'edit' }

export default function PublicProfileView(_props: Props) {
  return (
    <ComingSoonCover
      fullscreen
      title="Social intelligence"
      subtitle="Public profiles, shareable canvases, and handle claiming are coming soon."
    />
  );
}
