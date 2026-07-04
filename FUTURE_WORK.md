# Future Work And Known Compromises

This file tracks intentional compromises made during the current backend build-out. These are not accidental TODOs; they are decisions that kept the dev/MVP scope moving and should be revisited before production hardening.

## Security And Secrets

- Rotate the Firebase private key that was pasted into chat, then update `.env.development`.
- Rotate the OpenAI API key that was pasted into chat, then update `.env.development`.
- Move all production secrets to a managed secret store instead of `.env.production` files on disk.
- Add secret scanning to CI so committed or pasted credentials are caught early.

## Auth

- The product is Google-only for now. Email/password and magic-link login are intentionally not implemented.
- No account-linking logic exists for users who later want to add another identity provider.
- Google login verifies ID tokens against one configured `GOOGLE_CLIENT_ID`; multi-client/mobile audience handling may be needed later.

## AI Coach

- AI suggestions are generated as structured JSON, but the backend currently relies on JSON mode and prompt instructions rather than strict schema validation.
- AI output is stored as proposed suggestions and does not directly mutate product truth. A future approval/apply workflow should validate and transform suggestions into goals, tracks, tasks, roadmap versions, and adjustments.
- The current coach rules are prompt-level rules. They should eventually become versioned prompt templates with tests/evals.
- AI planning has no reality-check system yet. User-reported completion is trusted until a future verification/rating-calibration system is designed.
- Plan adjustment is triggered by probability decrease after progress updates, but the suggested adjustment content is still basic and should become AI-assisted with stronger context.

## Roadmap And Planning

- Tracks and milestones are AI-assisted and flexible. There are no hard product constraints on number of tracks or milestones.
- Daily plans schedule every day and do not enforce daily duration limits unless availability is provided. This may overload users if inputs are incomplete.
- Exam/education plans reserve revision cycles by prompt rule, not by deterministic scheduling logic.
- Generated roadmap daily plans can be persisted, but generated tasks are still proposals unless separately created through task APIs.
- There is no full apply/reject flow for generated daily plans and task breakdowns yet.

## Analytics And Probability

- Probability uses a lightweight Phase 0 formula based mainly on completion and missed tasks.
- No real calibration exists against actual goal outcomes.
- Probability snapshots are persisted, but formula versioning and migration behavior are minimal.
- Lack of daily progress update means no plan adjustment. This is a product rule, but it also means silent users may not receive useful rescue planning.

## Sync

- Offline sync supports a broader action catalog, but conflict handling is still simple: accepted/rejected/duplicate.
- There are no typed conflict responses or merge strategies for concurrent edits.
- Payload validation in sync dispatch is still loose because actions arrive as generic JSON.

## Notifications

- FCM sending is wired, but failure handling is basic.
- Quiet hours are interpreted in UTC, not the user's local timezone.
- Notification scheduling is immediate/shifted only; there is no robust scheduler for future delivery windows.
- Sensitive-goal redaction is coarse: it replaces title/body, but payload metadata still needs a stricter privacy review.

## Privacy Export And Deletion

- Privacy export is immediate JSON. This is fine for dev/MVP, but large accounts may need archive generation and signed download URLs.
- Account deletion is soft deletion plus session/device revocation. It is not irreversible anonymization.
- Export currently returns broad nested data. A production export should define a stable schema and redact internal-only fields where appropriate.

## Payments And Subscriptions

- The app is free-only for now.
- Subscription status is a default local record, not payment-provider truth.
- Premium feature gates and webhook verification are not implemented.

## Worker Infrastructure

- BullMQ jobs exist for notifications, AI suggestions, snapshots, and probability updates.
- There is no recurring timezone-aware scheduler for missed-task detection at local day end.
- Worker retries, dead-letter handling, and observability are minimal.

## Validation And Testing

- Build and Jest pass, but lint is blocked because ESLint v9 expects `eslint.config.js`.
- Current tests are thin and mostly utility-level. Service-level tests should be added for auth, sync, planning, AI suggestion lifecycle, notifications, privacy export, and account deletion.
- OpenAI and Firebase integrations need mocked tests to avoid network-dependent CI.

## Data Model And API Shape

- Some APIs accept generic `Record<string, unknown>` bodies, especially AI, reviews, preferences, roadmap, privacy, and sync payloads.
- DTO validation should be tightened before public clients depend on these endpoints.
- There is no formal API versioning strategy yet.
