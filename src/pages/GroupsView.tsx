import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Bot,
  Brain,
  Check,
  Copy,
  Link as LinkIcon,
  LogOut,
  MessageSquarePlus,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Send,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useGroupRoomStore } from '@/stores/groupRoomStore';
import DurableAttachment from '@/components/attachments/DurableAttachment';
import AttachmentSourceControl from '@/components/attachments/AttachmentSourceControl';
import { cancelChatAttachment, retryChatAttachment, uploadChatAttachment } from '@/lib/attachmentApi';
import { CHAT_ATTACHMENT_ACCEPT, MAX_CHAT_ATTACHMENTS, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chatAttachments';
import { isCanonicalAttachment, type AttachmentDescriptor, type AttachmentStatus } from '@/types/attachments';
import {
  groupAgentDisplayLabel,
  groupMemberDisplayName,
  shouldShowGroupJobUnderMessage,
  type GroupAgentJob,
  type GroupMessage,
  type GroupRoomAgent,
  type GroupRoomMember,
} from '@/lib/groupRooms';

type RightPanel = 'members' | 'agents' | 'memory' | 'settings';

interface GroupPendingAttachment {
  localId: string;
  file: File;
  status: AttachmentStatus | 'pending';
  progress: number;
  descriptor?: AttachmentDescriptor;
  error?: string;
  controller?: AbortController;
}

export default function GroupsView() {
  const { roomId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const agents = useAgentSettingsStore((s) => s.agents);
  const loadAgents = useAgentSettingsStore((s) => s.load);
  const {
    rooms,
    membersByRoom,
    agentsByRoom,
    messagesByRoom,
    jobsByRoom,
    memoryByRoom,
    loadingRooms,
    loadingRoomId,
    creatingRoom,
    error,
    inviteUrl,
    loadRooms,
    loadRoom,
    subscribeRoom,
    createRoom,
    inviteRoom,
    acceptInvite,
    addAgent,
    removeAgent,
    sendMessage,
    deleteMessage,
    updateMember,
    createMemoryCandidate,
    reviewMemoryCandidate,
    roomUnreadCount,
    clearError,
  } = useGroupRoomStore();

  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<GroupPendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [inviteHandle, setInviteHandle] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [mentionPolicy, setMentionPolicy] = useState<GroupRoomAgent['mention_policy']>('owner');
  const [rightPanel, setRightPanel] = useState<RightPanel>('members');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadBatchIdRef = useRef(crypto.randomUUID());

  const members = roomId ? (membersByRoom[roomId] ?? []) : [];
  const roomAgents = roomId ? (agentsByRoom[roomId] ?? []) : [];
  const messages = roomId ? (messagesByRoom[roomId] ?? []) : [];
  const jobs = roomId ? (jobsByRoom[roomId] ?? []) : [];
  const memoryCandidates = roomId ? (memoryByRoom[roomId] ?? []) : [];
  const room = roomId ? rooms.find((item) => item.id === roomId) ?? null : null;
  const selfMember = user && roomId ? members.find((member) => member.user_id === user.id) : null;
  const isManager = selfMember?.role === 'owner' || selfMember?.role === 'admin';
  const attachmentsReady = pendingAttachments.every((attachment) => attachment.status === 'ready');

  const membersByUser = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const agentsByOwnerAndId = useMemo(
    () => new Map(roomAgents.map((agent) => [`${agent.owner_user_id}:${agent.agent_id}`, agent])),
    [roomAgents],
  );

  useEffect(() => {
    if (!user) return;
    void loadRooms(user.id);
    void loadAgents(user.id);
  }, [user?.id, loadRooms, loadAgents]);

  useEffect(() => {
    if (!user) return;
    const token = searchParams.get('invite');
    if (!token) return;
    let cancelled = false;
    void acceptInvite(token).then((acceptedRoomId) => {
      if (cancelled) return;
      setSearchParams({});
      if (acceptedRoomId) navigate(`/groups/${acceptedRoomId}`, { replace: true });
    });
    return () => { cancelled = true; };
  }, [user?.id, searchParams, acceptInvite, navigate, setSearchParams]);

  useEffect(() => {
    if (!roomId) return;
    void loadRoom(roomId);
    const unsubscribe = subscribeRoom(roomId);
    return unsubscribe;
  }, [roomId, loadRoom, subscribeRoom]);

  useEffect(() => {
    setPendingAttachments((current) => {
      current.forEach((attachment) => attachment.controller?.abort());
      return [];
    });
    setFileError(null);
    setAttachmentMenuOpen(false);
    uploadBatchIdRef.current = crypto.randomUUID();
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    const channel = supabase.channel(`group-presence:${roomId}`, {
      config: { presence: { key: user.id } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineUserIds(new Set(Object.keys(state)));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: user.id, at: new Date().toISOString() });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, user?.id]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [roomId, messages.length, jobs.length]);

  useEffect(() => {
    if (!roomId || !messages.length) return;
    const latest = [...messages].reverse().find((message) => message.state === 'visible');
    if (!latest) return;
    const handle = window.setTimeout(() => {
      void updateMember(roomId, 'mark_read', { message_id: latest.id });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [roomId, messages, updateMember]);

  const handleCreateRoom = async () => {
    clearError();
    const roomTitle = newRoomTitle.trim() || 'New group room';
    const created = await createRoom(roomTitle);
    if (created) {
      setNewRoomTitle('');
      navigate(`/groups/${created.id}`);
    }
  };

  const patchPendingAttachment = useCallback((localId: string, patch: Partial<GroupPendingAttachment>) => {
    setPendingAttachments((current) => current.map((attachment) => (
      attachment.localId === localId ? { ...attachment, ...patch } : attachment
    )));
  }, []);

  const startGroupAttachmentUpload = useCallback((attachment: GroupPendingAttachment) => {
    if (!roomId) return;
    const controller = new AbortController();
    patchPendingAttachment(attachment.localId, { status: 'uploading', progress: 1, controller, error: undefined });
    void uploadChatAttachment(attachment.file, { roomId }, {
      batchId: uploadBatchIdRef.current,
      signal: controller.signal,
      onState: ({ status, progress, descriptor }) => {
        patchPendingAttachment(attachment.localId, { status, progress, descriptor, controller, error: descriptor?.error });
      },
    }).then((descriptor) => {
      patchPendingAttachment(attachment.localId, { status: 'ready', progress: 100, descriptor, controller: undefined });
    }).catch((uploadError) => {
      if (uploadError instanceof DOMException && uploadError.name === 'AbortError') return;
      patchPendingAttachment(attachment.localId, {
        status: 'failed',
        progress: 0,
        error: uploadError instanceof Error ? uploadError.message : 'Upload failed',
        controller: undefined,
      });
    });
  }, [patchPendingAttachment, roomId]);

  const addFiles = (incoming: File[]) => {
    setFileError(null);
    if (!roomId) return;
    if (pendingAttachments.length + incoming.length > MAX_CHAT_ATTACHMENTS) {
      setFileError(`Add up to ${MAX_CHAT_ATTACHMENTS} files per message.`);
      return;
    }
    const oversized = incoming.find((file) => file.size > MAX_CHAT_ATTACHMENT_BYTES);
    if (oversized) {
      setFileError(`${oversized.name} is larger than 100 MB.`);
      return;
    }
    const empty = incoming.find((file) => file.size < 1);
    if (empty) {
      setFileError(`${empty.name} is empty.`);
      return;
    }
    const queued = incoming.map((file): GroupPendingAttachment => ({
      localId: crypto.randomUUID(),
      file,
      status: 'uploading',
      progress: 0,
    }));
    setPendingAttachments((current) => [...current, ...queued]);
    queued.forEach(startGroupAttachmentUpload);
  };

  const removeGroupAttachment = (attachment: GroupPendingAttachment) => {
    attachment.controller?.abort();
    setPendingAttachments((current) => current.filter((item) => item.localId !== attachment.localId));
    if (attachment.descriptor?.id) void cancelChatAttachment(attachment.descriptor.id).catch(() => undefined);
  };

  const retryGroupAttachment = (attachment: GroupPendingAttachment) => {
    if (attachment.descriptor?.id && attachment.descriptor.status === 'failed') {
      const controller = new AbortController();
      patchPendingAttachment(attachment.localId, { status: 'quarantined', progress: 72, error: undefined, controller });
      void retryChatAttachment(attachment.descriptor.id, {
        file: attachment.file,
        signal: controller.signal,
        onState: ({ status, progress, descriptor }) => {
          patchPendingAttachment(attachment.localId, { status, progress, descriptor, controller, error: descriptor?.error });
        },
      }).then((descriptor) => {
        patchPendingAttachment(attachment.localId, { status: 'ready', progress: 100, descriptor, controller: undefined });
      }).catch((retryError) => {
        patchPendingAttachment(attachment.localId, { status: 'failed', progress: 0, error: retryError instanceof Error ? retryError.message : 'Retry failed', controller: undefined });
      });
      return;
    }
    startGroupAttachmentUpload({ ...attachment, descriptor: undefined, error: undefined });
  };

  const handleSend = async () => {
    if (!roomId) return;
    const content = composer.trim();
    const descriptors = pendingAttachments.map((attachment) => attachment.descriptor);
    if ((!content && pendingAttachments.length === 0) || sending) return;
    if (descriptors.some((descriptor) => !descriptor || descriptor.status !== 'ready')) {
      setFileError('Wait for every attachment to finish processing, or retry the failed file.');
      return;
    }
    setSending(true);
    const message = await sendMessage(roomId, content, descriptors as AttachmentDescriptor[]);
    setSending(false);
    if (message) {
      setComposer('');
      setPendingAttachments([]);
      setFileError(null);
      uploadBatchIdRef.current = crypto.randomUUID();
    }
  };

  const handleInvite = async () => {
    if (!roomId) return;
    await inviteRoom(roomId, inviteHandle.trim() || undefined);
    setInviteHandle('');
  };

  const handleAddAgent = async () => {
    if (!roomId || !selectedAgentId) return;
    await addAgent(roomId, selectedAgentId, mentionPolicy);
    setSelectedAgentId('');
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard?.writeText(inviteUrl).catch(() => undefined);
  };

  const activeMembers = members.filter((member) => member.state === 'active');
  const activeAgents = roomAgents.filter((agent) => agent.state === 'active');
  const muted = selfMember?.muted === true;

  return (
    <div className="groups-page">
      <section className="groups-list" aria-label="Group rooms">
        <div className="groups-list__header">
          <div>
            <div className="groups-kicker">Groups</div>
            <h1>Rooms</h1>
          </div>
          <MessagesSquare size={18} strokeWidth={1.6} />
        </div>
        <div className="groups-create">
          <input
            value={newRoomTitle}
            onChange={(event) => setNewRoomTitle(event.target.value)}
            placeholder="Room name"
            aria-label="Room name"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreateRoom();
            }}
          />
          <button
            type="button"
            className="groups-icon-button groups-icon-button--primary"
            onClick={() => void handleCreateRoom()}
            aria-label="Create room"
            aria-busy={creatingRoom}
            disabled={creatingRoom}
            title={creatingRoom ? 'Creating room' : 'Create room'}
          >
            <Plus size={15} />
          </button>
        </div>
        {error && !roomId && (
          <div className="groups-error groups-error--list" role="status">
            <AlertTriangle size={14} /> {error}
          </div>
        )}
        <div className="groups-list__rooms">
          {loadingRooms && <div className="groups-loading">Loading rooms...</div>}
          {!loadingRooms && rooms.length === 0 && (
            <div className="groups-empty">
              <MessageSquarePlus size={18} />
              <span>No group rooms yet</span>
            </div>
          )}
          {rooms.map((item) => {
            const unread = user ? roomUnreadCount(item.id, user.id) : 0;
            const memberCount = membersByRoom[item.id]?.filter((member) => member.state === 'active').length ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                className="groups-room-row"
                data-active={item.id === roomId ? 'true' : undefined}
                onClick={() => navigate(`/groups/${item.id}`)}
              >
                <span className="groups-room-row__title">{item.title}</span>
                <span className="groups-room-row__meta">
                  <Users size={12} /> {memberCount || 1}
                  {unread > 0 && <span className="groups-unread">{unread}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="groups-room">
        {!roomId && (
          <div className="groups-room__blank">
            <MessagesSquare size={28} strokeWidth={1.5} />
            <h2>Select a room</h2>
          </div>
        )}

        {roomId && (
          <>
            <header className="groups-room__header">
              <div>
                <div className="groups-kicker">Invite-only</div>
                <h2>{room?.title || 'Group room'}</h2>
              </div>
              <div className="groups-header-actions">
                <button
                  type="button"
                  className="groups-chip-button"
                  onClick={() => {
                    setRightPanel('members');
                    setMobilePanelOpen(true);
                  }}
                >
                  <Users size={14} /> {activeMembers.length}
                </button>
                <button
                  type="button"
                  className="groups-chip-button"
                  onClick={() => {
                    setRightPanel('agents');
                    setMobilePanelOpen(true);
                  }}
                >
                  <Bot size={14} /> {activeAgents.length}
                </button>
                <button
                  type="button"
                  className="groups-icon-button"
                  onClick={() => setMobilePanelOpen((open) => !open)}
                  aria-label="Open room panel"
                >
                  <PanelRightOpen size={15} />
                </button>
              </div>
            </header>

            {error && (
              <div className="groups-error" role="status">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {loadingRoomId === roomId && messages.length === 0 ? (
              <div className="groups-loading groups-loading--room">Loading room...</div>
            ) : (
              <div ref={transcriptRef} className="groups-transcript" aria-label="Room transcript">
                {messages.length === 0 && (
                  <div className="groups-transcript__empty">
                    <MessagesSquare size={20} />
                    <span>Start the room</span>
                  </div>
                )}
                {messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    selfUserId={user?.id ?? ''}
                    membersByUser={membersByUser}
                    agentsByOwnerAndId={agentsByOwnerAndId}
                    jobs={jobs.filter((job) => shouldShowGroupJobUnderMessage(job, message.id))}
                    canDelete={message.sender_user_id === user?.id || isManager}
                    onDelete={() => roomId && void deleteMessage(roomId, message.id)}
                    onRemember={(visibility) => roomId && void createMemoryCandidate(roomId, message.id, message.content, visibility)}
                  />
                ))}
              </div>
            )}

            <footer
              className="groups-composer"
              data-dragging={draggingFiles ? 'true' : undefined}
              onDragEnter={(event) => {
                if (event.dataTransfer.types.includes('Files')) setDraggingFiles(true);
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingFiles(false);
                addFiles(Array.from(event.dataTransfer.files));
              }}
              onPaste={(event) => {
                const pasted = Array.from(event.clipboardData.files);
                if (pasted.length) {
                  event.preventDefault();
                  addFiles(pasted);
                }
              }}
            >
              <input
                ref={fileInputRef}
                className="chat-file-input"
                type="file"
                multiple
                accept={CHAT_ATTACHMENT_ACCEPT}
                aria-label="File picker"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <input
                ref={photoInputRef}
                className="chat-file-input"
                type="file"
                multiple
                accept="image/*"
                aria-label="Photo picker"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <input
                ref={cameraInputRef}
                className="chat-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Camera picker"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              {fileError && <div className="groups-file-error" role="alert">{fileError}</div>}
              {pendingAttachments.length > 0 && (
                <div className="groups-file-strip" aria-live="polite">
                  {pendingAttachments.map((attachment) => (
                    <span
                      key={attachment.localId}
                      className="groups-file-pill"
                      data-status={attachment.status}
                      title={attachment.error || attachment.file.name}
                    >
                      <span className="groups-file-pill__copy">
                        <strong>{attachment.file.name}</strong>
                        <small>
                          {attachment.status === 'ready'
                            ? 'Ready'
                            : attachment.status === 'failed' || attachment.status === 'rejected'
                              ? attachment.error || 'Processing failed'
                              : `${attachment.status} · ${Math.round(attachment.progress)}%`}
                        </small>
                      </span>
                      {attachment.status === 'failed' && (
                        <button
                          type="button"
                          aria-label={`Retry ${attachment.file.name}`}
                          title="Retry"
                          onClick={() => retryGroupAttachment(attachment)}
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.file.name}`}
                        onClick={() => removeGroupAttachment(attachment)}
                      >
                        <X size={12} />
                      </button>
                      {attachment.status !== 'ready' && attachment.status !== 'failed' && attachment.status !== 'rejected' && (
                        <i aria-hidden="true" style={{ width: `${Math.max(3, attachment.progress)}%` }} />
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div className="groups-composer__row">
                <AttachmentSourceControl
                  open={attachmentMenuOpen}
                  onOpenChange={setAttachmentMenuOpen}
                  onFiles={() => fileInputRef.current?.click()}
                  onPhotos={() => photoInputRef.current?.click()}
                  onCamera={() => cameraInputRef.current?.click()}
                  disabled={pendingAttachments.length >= MAX_CHAT_ATTACHMENTS}
                />
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Message the room"
                  aria-label="Message the room"
                  rows={1}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <button type="button" className="groups-icon-button groups-icon-button--primary" onClick={() => void handleSend()} aria-label={sending ? 'Sending message' : !attachmentsReady ? 'Wait for attachments to finish' : 'Send message'} disabled={sending || !attachmentsReady || (!composer.trim() && pendingAttachments.length === 0)}>
                  <Send size={15} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>

      {roomId && (
        <aside className="groups-side" data-open={mobilePanelOpen ? 'true' : undefined}>
          <div className="groups-side__tabs" role="tablist" aria-label="Room panels">
            {(['members', 'agents', 'memory', 'settings'] as RightPanel[]).map((panel) => (
              <button
                key={panel}
                type="button"
                data-active={rightPanel === panel ? 'true' : undefined}
                onClick={() => setRightPanel(panel)}
              >
                {panel}
              </button>
            ))}
            <button type="button" className="groups-side__close" onClick={() => setMobilePanelOpen(false)} aria-label="Close panel">
              <X size={14} />
            </button>
          </div>

          {rightPanel === 'members' && (
            <MembersPanel
              members={members}
              onlineUserIds={onlineUserIds}
              isManager={isManager}
              selfUserId={user?.id ?? ''}
              onRemove={(targetUserId) => roomId && void updateMember(roomId, 'remove_member', { target_user_id: targetUserId })}
              onReveal={(targetUserId) => roomId && void updateMember(roomId, 'reveal_history', { target_user_id: targetUserId })}
            />
          )}

          {rightPanel === 'agents' && (
            <AgentsPanel
              userId={user?.id ?? ''}
              agents={agents}
              roomAgents={roomAgents}
              membersByUser={membersByUser}
              selectedAgentId={selectedAgentId}
              mentionPolicy={mentionPolicy}
              onSelectAgent={setSelectedAgentId}
              onMentionPolicy={setMentionPolicy}
              onAdd={() => void handleAddAgent()}
              onRemove={(agent) => roomId && void removeAgent(roomId, agent.agent_id, agent.owner_user_id)}
            />
          )}

          {rightPanel === 'memory' && (
            <MemoryPanel
              candidates={memoryCandidates}
              onReview={(candidateId, action) => roomId && void reviewMemoryCandidate(roomId, candidateId, action)}
            />
          )}

          {rightPanel === 'settings' && (
            <SettingsPanel
              muted={muted}
              inviteHandle={inviteHandle}
              inviteUrl={inviteUrl}
              onInviteHandle={setInviteHandle}
              onInvite={() => void handleInvite()}
              onCopyInvite={() => void copyInvite()}
              onToggleMute={() => roomId && void updateMember(roomId, muted ? 'unmute' : 'mute')}
              onLeave={() => {
                if (!roomId) return;
                void updateMember(roomId, 'leave').then(() => navigate('/groups'));
              }}
            />
          )}
        </aside>
      )}
    </div>
  );
}

function MessageRow({
  message,
  selfUserId,
  membersByUser,
  agentsByOwnerAndId,
  jobs,
  canDelete,
  onDelete,
  onRemember,
}: {
  message: GroupMessage;
  selfUserId: string;
  membersByUser: Map<string, GroupRoomMember>;
  agentsByOwnerAndId: Map<string, GroupRoomAgent>;
  jobs: GroupAgentJob[];
  canDelete: boolean;
  onDelete: () => void;
  onRemember: (visibility: 'private' | 'room') => void;
}) {
  const isSelf = message.sender_user_id === selfUserId;
  const label = getMessageLabel(message, membersByUser, agentsByOwnerAndId);
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  return (
    <article className="groups-message" data-self={isSelf ? 'true' : undefined} data-system={isSystem ? 'true' : undefined}>
      <div className="groups-message__meta">
        <span>{label}</span>
        <time>{formatTime(message.created_at)}</time>
      </div>
      <div className="groups-message__body" data-assistant={isAssistant ? 'true' : undefined}>
        {message.state === 'deleted' ? <em>Message deleted</em> : message.content}
        {message.attachments.length > 0 && (
          <div className="groups-attachments">
            {message.attachments.map((attachment, index) => isCanonicalAttachment(attachment)
              ? <DurableAttachment key={attachment.id} initial={attachment} />
              : (
                <a key={`${attachment.path}-${index}`} href={attachment.signedUrl || '#'} target="_blank" rel="noreferrer">
                  <Paperclip size={12} /> {attachment.name}
                </a>
              ))}
          </div>
        )}
      </div>
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} agentsByOwnerAndId={agentsByOwnerAndId} />
      ))}
      {!isSystem && message.state === 'visible' && (
        <div className="groups-message__actions">
          <button type="button" onClick={() => onRemember('private')}><Brain size={12} /> private</button>
          <button type="button" onClick={() => onRemember('room')}><Users size={12} /> room</button>
          {canDelete && <button type="button" onClick={onDelete}><Trash2 size={12} /> delete</button>}
        </div>
      )}
    </article>
  );
}

function JobCard({
  job,
  agentsByOwnerAndId,
}: {
  job: GroupAgentJob;
  agentsByOwnerAndId: Map<string, GroupRoomAgent>;
}) {
  const agent = agentsByOwnerAndId.get(`${job.agent_owner_user_id}:${job.agent_id}`);
  const title = agent?.display_name || job.agent_id;
  return (
    <div className="groups-job-card" data-status={job.status}>
      {job.status === 'failed' ? <AlertTriangle size={13} /> : <MoreHorizontal size={13} />}
      <span>
        {job.status === 'failed' ? `${title} could not reply` : `${title} is replying`}
        {job.error && <small>{job.error}</small>}
      </span>
    </div>
  );
}

function MembersPanel({
  members,
  onlineUserIds,
  isManager,
  selfUserId,
  onRemove,
  onReveal,
}: {
  members: GroupRoomMember[];
  onlineUserIds: Set<string>;
  isManager: boolean;
  selfUserId: string;
  onRemove: (targetUserId: string) => void;
  onReveal: (targetUserId: string) => void;
}) {
  return (
    <div className="groups-panel">
      <PanelHeader icon={<Users size={16} />} title="Members" />
      {members.map((member) => (
        <div key={member.id} className="groups-member-row" data-state={member.state}>
          <span className="groups-presence" data-online={onlineUserIds.has(member.user_id) ? 'true' : undefined} />
          <div>
            <strong>{groupMemberDisplayName(member)}</strong>
            <small>{member.role}{member.state !== 'active' ? ` · ${member.state}` : ''}</small>
          </div>
          {isManager && member.user_id !== selfUserId && member.state === 'active' && (
            <div className="groups-row-actions">
              {!member.can_see_history_before_join && (
                <button type="button" onClick={() => onReveal(member.user_id)} aria-label="Reveal history">
                  <Shield size={13} />
                </button>
              )}
              <button type="button" onClick={() => onRemove(member.user_id)} aria-label="Remove member">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AgentsPanel({
  userId,
  agents,
  roomAgents,
  membersByUser,
  selectedAgentId,
  mentionPolicy,
  onSelectAgent,
  onMentionPolicy,
  onAdd,
  onRemove,
}: {
  userId: string;
  agents: { id: string; name: string }[];
  roomAgents: GroupRoomAgent[];
  membersByUser: Map<string, GroupRoomMember>;
  selectedAgentId: string;
  mentionPolicy: GroupRoomAgent['mention_policy'];
  onSelectAgent: (id: string) => void;
  onMentionPolicy: (policy: GroupRoomAgent['mention_policy']) => void;
  onAdd: () => void;
  onRemove: (agent: GroupRoomAgent) => void;
}) {
  const activeRoomAgents = roomAgents.filter((agent) => agent.state === 'active');
  return (
    <div className="groups-panel">
      <PanelHeader icon={<Bot size={16} />} title="Agents" />
      <div className="groups-agent-add">
        <select value={selectedAgentId} onChange={(event) => onSelectAgent(event.target.value)} aria-label="Agent">
          <option value="">Select agent</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <select value={mentionPolicy} onChange={(event) => onMentionPolicy(event.target.value as GroupRoomAgent['mention_policy'])} aria-label="Mention policy">
          <option value="owner">Owner only</option>
          <option value="members">Members may mention</option>
          <option value="blocked">No summons</option>
        </select>
        <button type="button" className="groups-chip-button" onClick={onAdd}><Plus size={13} /> Add</button>
      </div>
      {activeRoomAgents.map((agent) => (
        <div key={agent.id} className="groups-agent-row">
          <div className="groups-agent-dot" data-color={agent.avatar_color || 'cream'} />
          <div>
            <strong>{groupAgentDisplayLabel(agent, membersByUser.get(agent.owner_user_id))}</strong>
            <small>{agent.mention_policy === 'members' ? 'members may mention' : agent.mention_policy === 'blocked' ? 'blocked' : 'owner only'}</small>
          </div>
          {agent.owner_user_id === userId && (
            <button type="button" onClick={() => onRemove(agent)} aria-label="Remove agent">
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function MemoryPanel({
  candidates,
  onReview,
}: {
  candidates: { id: string; content: string; visibility: 'private' | 'room'; status: string }[];
  onReview: (candidateId: string, action: 'approve' | 'reject') => void;
}) {
  return (
    <div className="groups-panel">
      <PanelHeader icon={<Brain size={16} />} title="Memory" />
      {candidates.length === 0 && <div className="groups-panel-empty">No memory candidates</div>}
      {candidates.map((candidate) => (
        <div key={candidate.id} className="groups-memory-row" data-status={candidate.status}>
          <small>{candidate.visibility} · {candidate.status}</small>
          <p>{candidate.content}</p>
          {candidate.status === 'pending' && (
            <div className="groups-row-actions">
              <button type="button" onClick={() => onReview(candidate.id, 'approve')}><Check size={13} /></button>
              <button type="button" onClick={() => onReview(candidate.id, 'reject')}><X size={13} /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({
  muted,
  inviteHandle,
  inviteUrl,
  onInviteHandle,
  onInvite,
  onCopyInvite,
  onToggleMute,
  onLeave,
}: {
  muted: boolean;
  inviteHandle: string;
  inviteUrl: string | null;
  onInviteHandle: (value: string) => void;
  onInvite: () => void;
  onCopyInvite: () => void;
  onToggleMute: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="groups-panel">
      <PanelHeader icon={<LinkIcon size={16} />} title="Room" />
      <div className="groups-invite-box">
        <input value={inviteHandle} onChange={(event) => onInviteHandle(event.target.value)} placeholder="@handle" aria-label="Invite handle" />
        <button type="button" className="groups-chip-button" onClick={onInvite}><LinkIcon size={13} /> Invite</button>
      </div>
      {inviteUrl && (
        <button type="button" className="groups-copy-url" onClick={onCopyInvite}>
          <Copy size={13} /> {inviteUrl}
        </button>
      )}
      <button type="button" className="groups-settings-row" onClick={onToggleMute}>
        {muted ? <BellOff size={14} /> : <Bell size={14} />}
        {muted ? 'Muted' : 'Notifications on'}
      </button>
      <button type="button" className="groups-settings-row groups-settings-row--danger" onClick={onLeave}>
        <LogOut size={14} /> Leave room
      </button>
    </div>
  );
}

function PanelHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="groups-panel__header">
      {icon}
      <h3>{title}</h3>
    </div>
  );
}

function getMessageLabel(
  message: GroupMessage,
  membersByUser: Map<string, GroupRoomMember>,
  agentsByOwnerAndId: Map<string, GroupRoomAgent>,
): string {
  if (message.role === 'system') return 'Room';
  if (message.role === 'assistant') {
    const agent = agentsByOwnerAndId.get(`${message.sender_agent_owner_user_id}:${message.sender_agent_id}`);
    const owner = message.sender_agent_owner_user_id ? membersByUser.get(message.sender_agent_owner_user_id) : null;
    return agent ? groupAgentDisplayLabel(agent, owner) : `${message.sender_agent_id || 'Agent'} · former owner`;
  }
  if (!message.sender_user_id) return 'Former member';
  return groupMemberDisplayName(membersByUser.get(message.sender_user_id));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
