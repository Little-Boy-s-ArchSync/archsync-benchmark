# Pinned local study artifact intake

This is content verification and technical preparation. It supplies no capture identity, human approval, study freeze, participant run or research result.

`openStudyArtifactStore` in `scripts/lib/study-artifact-store.mjs` accepts a canonical absolute artifact directory and two independently supplied immutable SHA-256 pins: the exact store-manifest bytes and the exact event-log bytes. For real collection, the caller must obtain the reviewed pins through the approved process before intake. Recomputing both pins from an unreviewed or changed directory does not establish approval. The committed tests and `pnpm study:verify` use authored synthetic fixtures only.

```js
const store = await openStudyArtifactStore({
  root: canonicalArtifactRoot,
  manifest: { path: "manifest.json", sha256: reviewedManifestDigest },
  event_log_sha256: reviewedEventLogDigest,
});
const issues = await validateInstrumentationArtifacts(store.events, store.readArtifact);
```

The store manifest has exactly `schema_version: 1`, `kind: "study-artifact-store"`, `event_log: { path, sha256 }`, and a nonempty `runs` array. Every run has exactly `run_id`, `attempt_id`, `task_id`, `condition`, and `artifacts`. IDs use ASCII letters, digits, underscores and hyphens, starting with a letter or digit. Conditions are A–D. Each artifact entry has exactly `path` and `sha256`; each digest is 64 lowercase hexadecimal characters. The event log is the exact JSON array accepted by `validateInstrumentationArtifacts`, including its stable attempt IDs and receipt/source references.

Each run owns its complete artifact inventory. Paths cannot be shared between runs, even if their bytes are identical: shared source documents must have separate run-owned copies. All event references must match their run's inventory entries, and every inventory entry and run must be referenced by the event log. Manifest, event-log and artifact paths must be distinct, including case-insensitive aliases. The manifest and log are intake metadata, not readable through the returned artifact reader.

Paths are relative ASCII letters, digits, underscores, dots, slashes and hyphens. Empty, `.` and `..` segments, absolute paths, backslashes, URL encoding, drive/stream syntax, trailing dots and Windows device names are rejected. The root must already be canonical; do not resolve or decode untrusted artifact paths before passing them to the reader. Root aliases, symlink ancestors, final symlinks, hardlinks and nonregular files fail. Every file must be nonempty and at most 4 MiB. The complete intake, including manifest and log, is limited to 64 MiB, 4,096 artifacts and 10,000 events.

**Filesystem boundary:** disk intake requires a trusted local filesystem with no concurrent writers or mount changes. Portable Node path APIs do not provide descriptor-relative ancestor confinement against a hostile process that can repeatedly rename directories or change symlinks. Pre/post directory and file identity/metadata checks reject observed changes; they do not eliminate that race. Place the capture in a trusted quiescent snapshot first. A hostile-writer intake would require a separate platform-specific implementation and review, not a stronger claim about these checks.

The intake opens only listed paths, checks regular-file/link metadata, reads through a descriptor into a bounded buffer, rechecks file and directory identity, verifies both external pins and every file digest, then runs strict receipt/event verification. No reader is returned on any failure. Open descriptors close on failure. The captured bytes remain private; `readArtifact` returns a new byte copy, and `events`/`manifest` return separate JSON copies. After successful intake the reader performs no further filesystem reads. Deleting or altering the source directory cannot change the accepted snapshot; a new intake rejects missing or altered files against the original pins.

The returned receipt records the two digests, captured counts and byte total with `verification: "content-bound-local-snapshot"`, `authenticated_capture: false`, and `human_approval_verified: false`. It is not a signature or an assertion that the source is genuine. It does not run acceptance commands, inspect baseline Git trees, judge redaction, verify provider provenance, or satisfy independent reproduction. Original failed/inconclusive event records remain unchanged. EXP-103/STAT-101, pilot, ethics/data/Lead decisions and all real-execution gates remain required.
