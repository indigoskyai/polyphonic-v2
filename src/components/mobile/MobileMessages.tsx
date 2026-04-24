import React from 'react';

export interface MobileMessage {
  id: string;
  role: 'luca' | 'vektor' | 'anima' | 'user';
  body: string;
}

interface Props { messages: MobileMessage[] }

export default function MobileMessages({ messages }: Props) {
  return (
    <div className="m-messages">
      {messages.map((m) => (
        <div key={m.id} className="m-msg">
          <div className="m-msg-role" data-agent={m.role !== 'user' ? m.role : undefined}>
            {m.role}
          </div>
          <div className="m-msg-body">{m.body}</div>
        </div>
      ))}
    </div>
  );
}
