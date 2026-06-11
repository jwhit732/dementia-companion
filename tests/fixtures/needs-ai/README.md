# Needs-AI Fixtures

These fixtures represent document formats that require an LLM normaliser to parse.
Tests referencing them are marked `test.skip` today and serve as the eval set for
the future `llmNormalise` implementation (Phase 3 backlog).

When `llmNormalise` is built:
1. Remove the `.skip` from the relevant tests in `tests/normaliser.test.ts`
2. Run against these fixtures to verify the LLM correctly normalises all cases
3. Add confidence/abstain path tests — the LLM must fall back to the carer alert
   rather than guess when it is not confident

## Fixtures

- `freeform-schedule.txt` — natural language schedule, no structured time format
- `casual-update.txt` — casual "today marg has..." prose update

## Interface contract (unchanged when AI is added)

The `llmNormalise` function must satisfy the same `Normaliser` interface:

```typescript
normalise(text: string, now?: Date): NormaliserResult
```

Output is validated by the unchanged zod schema gate after normalisation,
so the confabulation defence is preserved by construction.
