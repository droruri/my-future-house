import { expect, it } from 'vitest';
import { parseEnv } from './ai';

it('requires a key unless AI_FAKE=1, with model defaults', () => {
  expect(() => parseEnv({})).toThrow();
  const e = parseEnv({ AI_FAKE: '1' });
  expect(e.docsModel).toBe('gemini-2.5-pro');
  expect(e.agentModel).toBe('gemini-2.5-flash');
  expect(parseEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'k', LLM_DOCS_MODEL: 'x' }).docsModel).toBe('x');
});
