# Vulnerability regression coverage — CLAUDE.md ↔ tests

This matrix maps every security section of the project `CLAUDE.md` to its status in
this extension. The goal is that **every** section is accounted for: either covered by
an automated regression test, or explicitly marked **N/A** with the reason there is no
matching sink in Avocado's code.

Run the security regression subset with:

```bash
composer test-security      # phpunit --group security
```

Legend: ✅ tested · 🟢 N/A (no matching sink) · 📝 manual/review-only (not unit-testable
without a full HTTP harness).

| § | Topic | Status | Where / why |
|---|---|---|---|
| §2 | Routes / middleware authz | 📝 | `extend.php` routes go to controllers that call `assertAdmin()`/`assertRegistered()`+`assertCan()`. Enforced in code; behavioural test needs HTTP harness. |
| §3 | Policies & ID comparison | ✅ | `tests/Unit/DiscussionPolicyTest.php` — `uploadHeroImage` returns ALLOW vs `null` (abstain, not deny). |
| §4 | GUEST group trap | 🟢 | No migration seeds `group_permission`; no custom permission granted to GUEST. |
| §5 | `whereVisibleTo` / IDOR | 📝 | Hero upload loads `Discussion::find` then gates via `assertCan('uploadHeroImage')` (policy-gated path, §3). Online-users list hidden from guests (see §37 test target). |
| §6 | Schema field visibility | 📝 | `DiscussionFields` exposes hero path only; no PII fields added. Review-only. |
| §7 | Mass assignment / `writable` | ✅ | `tests/Integration/DiscussionHeroTest::test_model_persists_and_guards_the_primary_key` — `$guarded` blocks `discussion_id` mass-assign. |
| §8 | Extending core resources | 📝 | `ForumAttributes` adds only counts; `DiscussionFields` adds hero path. No PII; review-only. |
| §9 | XSS / `m.trust` | ✅ | `tests/Unit/HtmlSanitizerTest.php` — script/style/iframe strip, `on*`, `javascript:`/`vbscript:`/`data:text/html`, dangerous styles, **HTML-comment + `<noscript>`/`<template>` strip, and idempotence (mXSS re-scrub loop)**. The JS twin `sanitizeAdminHtml` mirrors this (incl. `<style>`-body scrub for the footer field) — no JS unit harness in-repo, review-locked. |
| §9.3 | CSS-context injection | ✅ | `tests/Security/LoadingSpinnerColorTest.php` — `safeColor()` allowlist blocks `</style>` break-out, `expression()`, `url(javascript:)`. Frontend twin `safeCssColor()` (utils.ts) gates the TeamPage group-color `style=` interpolation. |
| §9.5 | SVG inline / XXE | ✅ | `tests/Unit/SvgSanitizerTest.php` (13 cases) — DOCTYPE/ENTITY reject, `<script>/<a>/<use>` external strip, `on*`, `javascript:`, `@import`. |
| §10 | SQL injection / filters | 🟢 | All queries use the builder; `ForumAttributes` coerces group IDs via `intval > 0` before `whereIn`. No raw SQL. |
| §11 | File uploads | 📝 | `UploadDiscussionHeroController` validates size + MIME (finfo) + server-side filename + Intervention re-encode. Guards are inline in `handle()`; behavioural test needs HTTP harness. |
| §12 | Serving private files | 🟢 | No private-file serving endpoint; assets go to the public `flarum-assets` disk by URL. |
| §13 | Path traversal | 🟢 | **No request-controlled path sink.** Uploads use server-generated filenames; deletes operate on settings-stored paths via the prefix-confined Flysystem disk (`->exists`/`->delete`). |
| §14 | SSRF | 🟢 | No server-side fetch of a user/admin-supplied URL. |
| §15 | Open redirect | 🟢 | No `?return=`/redirect handling. |
| §16 | CSRF / token bypass | 🟢 | No `bypassCsrfToken`; no custom CSRF exemption. |
| §17 | ApiKey / AccessToken | 🟢 | No `ApiKey` created by extension code. |
| §18 | Throttling | 🟢 | No custom throttler registered. |
| §19 | Notifications | 🟢 | No notification blueprints. |
| §20 | Events / schedules / jobs | 📝 | Only `Realtime` broadcasts (conditional on flarum-realtime+likes/sticky), routing per the event's own model. No console schedules/jobs. |
| §21 | `serializeToForum` leakage | ✅ | `HtmlSanitizerTest` backs the `avocado.custom_hero_html` cast (`extend.php:169` wires `HtmlSanitizer::sanitize`). All other serialized keys are booleans/plain UI settings — no secrets. |
| §22 | Translator interpolation | 🟢 | No `m.trust(trans(...))` with user vars (frontend); locale strings static. |
| §23 | Logging sensitive data | 🟢 | No request-body logging in `src/`. |
| §24 | Cache keys | 📝 | `InjectOnlineUsers`/`ForumAttributes` cache by a constant key — values are forum-wide (not per-actor) and the guest/empty branch runs before the cache read, so no cross-actor poisoning. Review-only. |
| §25 | Validators | 🟢 | Validation is inline (filter_var on discussionId, MIME/size). No `AbstractValidator` needed. |
| §26 | Migrations | ✅ | `tests/Integration/DiscussionHeroTest.php` — idempotent `up`, `down` round-trip, FK `cascadeOnDelete` (orphan prevention). |
| §27 | Frontend extend/override | 📝 | JS layer; out of PHP test scope. |
| §28 | `app.forum.attribute` raw HTML | ✅ | Backed by `LoadingSpinnerColorTest` (CSS) + `HtmlSanitizerTest` (hero HTML) — the two admin-raw surfaces. |
| §29 | Realtime broadcast leaks | 📝 | `extend.php` broadcasts route by the event's model/actor (not `public`); broadcasts IDs via core events. Review-only. |
| §30 | Sessions / headers / GDPR | 🟢 | `AddPerfHeaders` middleware only; no auth flow, no PII store beyond hero path. |
| §36 | Shell execution | 🟢 | No `exec`/`proc_open`/external binaries in this extension. |
| §37 | `Content` injectors | ✅/📝 | `InjectOnlineUsers`: bounded `limit(50)`, guest→empty (no PII leak), `discloseOnline` filter, full `JSON_HEX_*` flags; no API duplication. JSON-encoding contract is review-only (needs Document harness); the data-exposure invariants are asserted by design + reviewed here. |

## Not yet automated (candidate follow-ups)

These need either a Flarum HTTP test harness (`flarum/testing`) or a small refactor to
extract the guard into a pure function:

- §11 — upload size/MIME/filename guards in `UploadDiscussionHeroController::handle()`.
- §2/§3 — controller-level `assertAdmin()`/`assertCan()` enforcement (guest → 401/403).
- §37 — `InjectOnlineUsers` `</script>` break-out resistance of the `JSON_HEX_*` output.

If we add `flarum/testing` later (DB + request harness), these become straightforward
integration tests; today they are enforced in code and reviewed, not regression-locked.
