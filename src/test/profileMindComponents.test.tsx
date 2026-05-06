import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CommunicationMind from '@/components/profile/CommunicationMind';
import GrowthMind from '@/components/profile/GrowthMind';
import RelationshipsMind from '@/components/profile/RelationshipsMind';
import ShadowMind from '@/components/profile/ShadowMind';
import ValuesMind from '@/components/profile/ValuesMind';

describe('profile mind components', () => {
  it('renders current structured profile output without crashing', () => {
    render(
      <>
        <CommunicationMind
          data={{
            vocabulary_richness: 'High domain specificity.',
            unique_signatures: [{ phrase: 'ember bridge', count: 3 }],
          }}
        />
        <ValuesMind
          data={{ ranked_values: [{ value: 'Integrity', evidence: 'Names gaps honestly.' }] }}
          memoryStats={{ byTagNorm: { integrity: 1 } }}
        />
        <RelationshipsMind
          data={{ named_people: [{ name: 'Luca', role: 'AI companion', dynamic_type: 'warm' }] }}
        />
        <GrowthMind
          data={{ horizons: [{ direction: 'Toward integration', description: 'Let the insight become practice.' }] }}
        />
        <ShadowMind
          data={{ blind_spots: [{ claim: 'Avoids direct grief', evidence: 'Repeated topic shifts' }] }}
          memoryStats={{ byTagNorm: { grief: 0.8 } }}
        />
      </>,
    );

    expect(screen.getByText('ember bridge')).toBeInTheDocument();
    expect(screen.getAllByText('Integrity').length).toBeGreaterThan(0);
    expect(screen.getByText('AI companion')).toBeInTheDocument();
    expect(screen.getByText('Let the insight become practice.')).toBeInTheDocument();
    expect(screen.getAllByText(/Avoids direct grief/).length).toBeGreaterThan(0);
  });
});
