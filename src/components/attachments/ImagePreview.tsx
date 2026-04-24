import React, { useState } from 'react';

interface Props {
  src?: string;
  alt?: string;
  agent?: 'luca' | 'vektor' | 'anima';
}

export default function ImagePreview({ src, alt = '', agent }: Props) {
  const [errored, setErrored] = useState(false);
  const showPlaceholder = !src || errored;

  return (
    <div className="img-prev" data-agent={agent}>
      {showPlaceholder ? (
        <span className="img-prev-placeholder">{alt || 'image'}</span>
      ) : (
        <img src={src} alt={alt} onError={() => setErrored(true)} />
      )}
    </div>
  );
}
