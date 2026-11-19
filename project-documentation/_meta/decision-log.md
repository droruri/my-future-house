# Decision Log

## DEC-001: Gemini through the Vercel AI SDK, behind one `Ai` port

**Date**: 2026-11-19
**Phase**: 1 - Product Manager

**Decision**: All model calls go through `server/ai.ts` (`Ai.extract` → structured output checked with Zod), built on `ai` + `@ai-sdk/google`. Docs model `gemini-2.5-pro`, agent model `gemini-2.5-flash`, both overridable by env. `AI_FAKE=1` gives a scripted fake for tests and CI.

**Context**: The owner already runs Gemini this way in other projects, and wants the same setup here instead of calling Claude directly.

**Not done**: No Groq fallback — Groq can't read PDFs or images, so it can't cover the documents step, and for one user a "Try again" button is enough.

**Consequences**: Switching provider later is a model-factory change in one file. Personal documents go to Google; use a paid-tier key.
