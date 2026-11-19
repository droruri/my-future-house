import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { sampleHouse } from '../src/sample';

export type AiFile = { name: string; mediaType: string; data: Uint8Array };
export type ExtractResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type ExtractArgs<T> = {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  files?: AiFile[];
  /** Which configured model to use. */
  model?: 'docs' | 'agent';
  /** Lets the scripted fake pick its answer. */
  task?: 'house' | 'item';
};
/** The only place a model is called. Never throws. */
export type Ai = { extract<T>(args: ExtractArgs<T>): Promise<ExtractResult<T>> };

const EnvSchema = z
  .object({
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    AI_FAKE: z.string().optional(),
    LLM_DOCS_MODEL: z.string().min(1).catch('gemini-2.5-pro').default('gemini-2.5-pro'),
    LLM_AGENT_MODEL: z.string().min(1).catch('gemini-2.5-flash').default('gemini-2.5-flash'),
  })
  .transform((e, ctx) => {
    const fake = e.AI_FAKE === '1';
    if (!fake && !e.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'GOOGLE_GENERATIVE_AI_API_KEY is required unless AI_FAKE=1' });
      return z.NEVER;
    }
    return {
      fake,
      apiKey: e.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
      docsModel: e.LLM_DOCS_MODEL,
      agentModel: e.LLM_AGENT_MODEL,
    };
  });
export type AiEnv = z.output<typeof EnvSchema>;

/** Throws with a readable message on startup if the env is unusable. */
export function parseEnv(env: Record<string, string | undefined>): AiEnv {
  const r = EnvSchema.safeParse(env);
  if (!r.success) throw new Error(`Bad environment: ${r.error.issues.map((i) => i.message).join('; ')}`);
  return r.data;
}

/** Logs model, time and success only — never prompts or document contents. */
function logCall(model: string, started: number, ok: boolean) {
  console.log(JSON.stringify({ ai: 'extract', model, ms: Date.now() - started, ok }));
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'unknown error');

/** Scripted: reads "W×D[×H]" from the source (cm if > 10); no numbers means no dimensions. */
function fakeItem(prompt: string) {
  const m = /(\d+(?:\.\d+)?)\s*[×x*]\s*(\d+(?:\.\d+)?)(?:\s*[×x*]\s*(\d+(?:\.\d+)?))?/.exec(prompt);
  const metres = (v: string | undefined) => (v === undefined ? null : Number(v) > 10 ? Number(v) / 100 : Number(v));
  const price = /(\d+)\s*(?:₪|ש"ח)/.exec(prompt)?.[1];
  const room = /Rooms: ([^,\n]+)/.exec(prompt)?.[1];
  return {
    name: 'ספה תלת מושבית',
    width: metres(m?.[1]),
    depth: metres(m?.[2]),
    height: m ? (metres(m[3]) ?? 0.85) : null,
    color: '#8899aa',
    price: price ? Number(price) : null,
    room: room && room !== '(none)' ? room : null,
  };
}

function fakeAi(): Ai {
  return {
    async extract<T>({ schema, files, prompt, task }: ExtractArgs<T>): Promise<ExtractResult<T>> {
      const started = Date.now();
      if (task === 'item') {
        const r = schema.safeParse(fakeItem(prompt));
        logCall('fake', started, r.success);
        return r.success ? { ok: true, value: r.data } : { ok: false, error: 'fake output does not match schema' };
      }
      // Scripted: a file whose name contains "unreadable" cannot be read.
      const bad = files?.find((f) => f.name.includes('unreadable'));
      if (bad) {
        logCall('fake', started, false);
        return { ok: false, error: `cannot read ${bad.name}` };
      }
      const r = schema.safeParse(sampleHouse);
      logCall('fake', started, r.success);
      return r.success ? { ok: true, value: r.data } : { ok: false, error: 'fake output does not match schema' };
    },
  };
}

function geminiAi(env: AiEnv): Ai {
  const google = createGoogleGenerativeAI({ apiKey: env.apiKey });
  return {
    async extract<T>({ schema, system, prompt, files, model }: ExtractArgs<T>): Promise<ExtractResult<T>> {
      const started = Date.now();
      const modelId = model === 'agent' ? env.agentModel : env.docsModel;
      try {
        const { object } = await generateObject({
          model: google(modelId),
          schema,
          system,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...(files ?? []).map((f) => ({ type: 'file' as const, data: f.data, mediaType: f.mediaType })),
              ],
            },
          ],
        });
        const checked = schema.safeParse(object);
        logCall(modelId, started, checked.success);
        return checked.success ? { ok: true, value: checked.data } : { ok: false, error: 'model output did not match the schema' };
      } catch (e) {
        logCall(modelId, started, false);
        return { ok: false, error: errText(e) };
      }
    },
  };
}

export const createAi = (env: AiEnv): Ai => (env.fake ? fakeAi() : geminiAi(env));
