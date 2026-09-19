# Gemini fixtures

Recorded real Gemini responses (level, repair and roast calls), committed so the
app and offline tests can run with `GEMINI_REPLAY=1` and zero API calls.

- Record: `GEMINI_RECORD=1` with a real key. Each successful call writes
  `<kind>-<promptHash>-<inputHash>.json` here.
- Replay: `GEMINI_REPLAY=1`. A call with no matching file fails with a clear error and never hits the API.
- `promptHash` covers the system prompt and JSON schema, so editing a prompt
  orphans its old fixtures; re-record after prompt changes. `inputHash` covers the
  request input (the image is hashed, not stored).
