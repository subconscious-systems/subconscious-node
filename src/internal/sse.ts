import type { StreamEvent } from '../types/events.js';

export type SSEMessage = {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
};

export function parseSSELine(line: string): Partial<SSEMessage> | null {
  if (line === '' || line.startsWith(':')) {
    return null;
  }

  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    return { [line]: '' } as Partial<SSEMessage>;
  }

  const field = line.slice(0, colonIndex);
  let value = line.slice(colonIndex + 1);

  if (value.startsWith(' ')) {
    value = value.slice(1);
  }

  switch (field) {
    case 'event':
      return { event: value };
    case 'data':
      return { data: value };
    case 'id':
      return { id: value };
    case 'retry':
      return { retry: parseInt(value, 10) };
    default:
      return null;
  }
}

export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentMessage: Partial<SSEMessage> = {};

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line === '') {
        if (currentMessage.data !== undefined) {
          try {
            const event = JSON.parse(currentMessage.data) as StreamEvent;
            yield event;
          } catch {
            // Skip malformed JSON
          }
        }
        currentMessage = {};
        continue;
      }

      const parsed = parseSSELine(line);
      if (parsed) {
        Object.assign(currentMessage, parsed);
      }
    }
  }

  // Handle any remaining data in buffer
  if (buffer !== '') {
    const parsed = parseSSELine(buffer);
    if (parsed) {
      Object.assign(currentMessage, parsed);
    }
    if (currentMessage.data !== undefined) {
      try {
        const event = JSON.parse(currentMessage.data) as StreamEvent;
        yield event;
      } catch {
        // Skip malformed JSON
      }
    }
  }
}
