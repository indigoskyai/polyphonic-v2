import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useThreadStore, type Thread } from '@/stores/threadStore';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: Thread;
}

export default function ThreadDeleteDialog({ open, onOpenChange, thread }: Props) {
  const deleteThread = useThreadStore((s) => s.deleteThread);
  const navigate = useNavigate();
  const params = useParams();
  const { toast } = useToast();

  const onConfirm = async () => {
    try {
      const isCurrent = params.threadId === thread.id;
      await deleteThread(thread.id);
      onOpenChange(false);
      if (isCurrent) navigate('/chat');
    } catch (e) {
      toast({
        title: 'Failed to delete',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{thread.title || 'New conversation'}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the conversation and all its messages. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
