import { useImportStore, type PipelineStage } from '@/stores/importStore';
import { useNavigate } from 'react-router-dom';

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: '',
  filtering: 'Analyzing conversations...',
  parsing: 'Parsing...',
  extracting: 'Extracting memories',
  synthesizing: 'Synthesizing narrative',
  profiling: 'Deep analysis',
  complete: 'Import complete',
  error: 'Import failed',
};

export default function ImportProgressBanner() {
  const { stage, processedChunks, totalChunks, memoriesCreated, pipelineDetail, error, dismissed, dismiss, reset } = useImportStore();
  const navigate = useNavigate();

  if (stage === 'idle' || stage === 'filtering' || dismissed) return null;

  const isActive = !['complete', 'error'].includes(stage);
  const progress = stage === 'extracting' && totalChunks > 0
    ? Math.round((processedChunks / totalChunks) * 100)
    : stage === 'synthesizing' ? 85
    : stage === 'profiling' ? 92
    : stage === 'complete' ? 100
    : 0;

  return (
    <div
      style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        animation: 'viewFadeIn 0.3s ease-out both',
      }}
    >
      {/* Pulse dot */}
      {isActive && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--luca)',
          animation: 'pulse-thread 1.5s ease-in-out infinite',
          flexShrink: 0,
        }} />
      )}

      {/* Label */}
      <span style={{ fontSize: 12, color: stage === 'error' ? '#f87171' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {STAGE_LABELS[stage]}
      </span>

      {/* Detail */}
      {pipelineDetail && isActive && (
        <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {pipelineDetail}
        </span>
      )}

      {/* Progress bar */}
      {isActive && (
        <div style={{ flex: 1, maxWidth: 200, height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--text-ghost)',
            borderRadius: 2,
            transition: 'width 0.6s ease-out',
          }} />
        </div>
      )}

      {/* Memories counter */}
      {memoriesCreated > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {memoriesCreated} memories
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* View details link */}
      <button
        onClick={() => navigate('/import')}
        className="cursor-pointer"
        style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', fontFamily: 'var(--font-sans)', padding: 0 }}
      >
        View details
      </button>

      {/* Dismiss */}
      {!isActive && (
        <button
          onClick={() => { dismiss(); if (stage === 'complete') setTimeout(reset, 500); }}
          className="cursor-pointer"
          style={{ fontSize: 14, color: 'var(--text-ghost)', background: 'none', border: 'none', padding: '0 2px', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}
