import { MoreHorizontal, Pencil, Pin, PinOff, Star, StarOff, FolderInput, Archive, ArchiveRestore, Trash2, Check, FolderMinus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThreadStore, type Thread } from '@/stores/threadStore';
import { useProjectStore } from '@/stores/projectStore';
import { useToast } from '@/hooks/use-toast';

interface Props {
  thread: Thread;
  onRename: () => void;
  onRequestDelete: () => void;
}

export default function ThreadRowMenu({ thread, onRename, onRequestDelete }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const updateThreadPinned = useThreadStore((s) => s.updateThreadPinned);
  const updateThreadStarred = useThreadStore((s) => s.updateThreadStarred);
  const updateThreadArchived = useThreadStore((s) => s.updateThreadArchived);
  const updateThreadProject = useThreadStore((s) => s.updateThreadProject);

  const wrap = (label: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast({ title: `Failed to ${label}`, description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Thread actions"
          className="thread-row-actions"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 6,
            background: 'transparent',
            color: 'var(--text-tertiary)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={wrap('pin', () => updateThreadPinned(thread.id, !thread.pinned))}>
          {thread.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
          {thread.pinned ? 'Unpin' : 'Pin'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={wrap('star', () => updateThreadStarred(thread.id, !thread.starred))}>
          {thread.starred ? <StarOff className="mr-2 h-3.5 w-3.5" /> : <Star className="mr-2 h-3.5 w-3.5" />}
          {thread.starred ? 'Unstar' : 'Star'}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput className="mr-2 h-3.5 w-3.5" />
            {thread.project_id ? 'Move to project' : 'Add to project'}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 max-h-72 overflow-y-auto">
            {projects.length === 0 && (
              <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
            )}
            {projects.map((p) => {
              const isCurrent = p.id === thread.project_id;
              return (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={wrap('assign project', () => updateThreadProject(thread.id, isCurrent ? null : p.id))}
                >
                  <span className="mr-2 inline-flex h-3.5 w-3.5 items-center justify-center">
                    {isCurrent && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="truncate">{p.name}</span>
                </DropdownMenuItem>
              );
            })}
            {thread.project_id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={wrap('remove from project', () => updateThreadProject(thread.id, null))}>
                  <FolderMinus className="mr-2 h-3.5 w-3.5" /> Remove from project
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/projects')}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New project...
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={wrap('archive', () => updateThreadArchived(thread.id, !thread.archived))}>
          {thread.archived ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> : <Archive className="mr-2 h-3.5 w-3.5" />}
          {thread.archived ? 'Unarchive' : 'Archive'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onRequestDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
