import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import RichBody from '@/components/rich/RichBody';

describe('RichBody artifact fence suppression', () => {
  it('removes promoted simulation fences without leaving an empty code panel', () => {
    const payload = JSON.stringify({
      version: 1,
      title: 'Cooling preview',
      question: 'What changes with cooling?',
      dataset: {
        family_id: 'fluid',
        label: 'The Well: fluid',
        access_name: 'the_well.fluid/v1/train',
        docs_url: 'https://polymathic-ai.org/the_well/',
      },
      evidence: {
        claim_boundary: 'Preview only.',
        evidence_level: 'simulation-proxy',
        measurements: ['energy'],
        caveats: ['synthetic preview'],
      },
      preview: {
        preset: 'fluid-field',
        fields: ['velocity'],
        parameters: { cooling: 0.5 },
        initial_state: { timestep: 0.25 },
        color_mode: 'thermal',
      },
      access: {
        streaming_snippet: 'stream()',
        download_command: 'well-download fluid',
        raw_ingest_default: false,
      },
    }, null, 2);

    render(
      <MemoryRouter>
        <RichBody
          source={`Here is the preview.\n\n\`\`\`simulation\n${payload}\n\`\`\``}
          suppressArtifactFences
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Here is the preview.')).toBeInTheDocument();
    expect(screen.queryByText(/Cooling preview/)).not.toBeInTheDocument();
    expect(document.querySelector('pre')).toBeNull();
  });
});
