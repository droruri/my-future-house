import { expect, it } from 'vitest';
import { app } from './index';

it('health endpoint responds', async () => {
  const res = await app.request('/api/health');
  expect(await res.json()).toEqual({ ok: true });
});
