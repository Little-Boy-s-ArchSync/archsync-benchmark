# Real historical change packet preparation

This extends source preparation to the entire previously retained list of 60
candidate historical changes: the first 20 API-returned scope-touching commits
per project. It neither selects a final scientific sample nor labels outcomes.
The earlier history-selection disclosure, including the five-record previews,
remains applicable. All rows, empty scopes, unsupported modes and failures stay
visible; no replacement or outcome-driven filtering is permitted.

Before any fetch, save the exact input history-summary and plan digests and
every candidate/parent in a new selection receipt. Fetch all selected heads
and their recorded parents into one private bare Git store per repository.
Do not checkout, execute project code, install dependencies, follow symlinks,
run either analyzer, or expose tool predictions to reviewers.

For single-parent candidates, verify the actual commit bytes and parent link.
Retain both full tree listings, whole-repository and scoped raw/patch diffs,
and exact changed-file blobs within scope. Freeze Git options: no external
diff, no text conversion, no rename inference, full object IDs, binary patch
support, Myers diff with three context lines. A rename is represented as
explicit deletion/addition under this preparation policy, not an architecture
classification. Submodule pointers remain explicit unsupported source entries;
they are never dereferenced or silently removed.

Verify the retained Git store with offline `git fsck --strict`. Recompute all
tree listings and diffs from those objects, reconcile each path and blob hash,
and report collection coverage separately from labels and tool performance.
Overlapping historical changes are correlated, not independent trials. File
occurrences are not distinct files, architectural edges or accuracy samples.

This is technical preparation under the user's repository-discovery request.
Final repository/case selection, leakage declarations, the annotation rubric,
expected contracts, statistical plan, ground truth, and versioned tool inputs
still need the existing research gates before official execution. No change
to frozen evidence, human identity, approval or scientific claims is implied.
