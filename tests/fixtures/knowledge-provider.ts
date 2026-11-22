import type { KnowledgeProvider } from '../../src/server/providers/knowledge';

export const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
export const fakeProvider: KnowledgeProvider = {
  async analyze(text) {
    return {
      value: {
        summary: 'A section about computing.',
        tags: ['Computing', 'Chips', 'Research'],
        entities: [{ name: 'AMD', type: 'company', evidence: text.slice(0, 20) }],
        relationships: [],
      },
      model: 'fake',
      inputTokens: 10,
      outputTokens: 10,
    };
  },
  async embed(texts) {
    return {
      value: texts.map(() => vector),
      model: 'text-embedding-3-small',
      inputTokens: 10,
      outputTokens: 0,
    };
  },
  async summarize() {
    return {
      value: 'Computing research compares processors.',
      model: 'fake',
      inputTokens: 10,
      outputTokens: 10,
    };
  },
};
