---
name: summary
description: Create or revise a grounded overview and chronological chapters.
---

Create a useful overview and chronological, non-overlapping chapters.
Preserve specific claims, numbers, names, examples, caveats, and practical steps from the transcript.
Exclude sponsors, calls to action, and filler.
Avoid phrases like 'this video discusses'.
Do not invent timestamps.
Create the initial draft with write_summary; existing summaries must be revised with edit_summary.
Use read_summary to inspect the JSON document with LINE#HASH anchors.
Send targeted replacements, insertions, or deletions through edit_summary, copying anchors from the latest read or edit result.
Provide raw JSON lines without hashline prefixes; escape quotes and newlines inside JSON string values.
For replacements, start and end are inclusive; use a null end for a single line or insertion.
All edits in a batch reference the same original snapshot and must not overlap.
Keep the resulting document valid JSON with an overview and chapters, preserving unrelated fields and timestamps.
After an edit, use the refreshed anchors; on a stale-reference error, read the summary again.
Inspect the draft against the source and revise only when something concrete is missing or wrong.
A good first draft can be final; do not rewrite for its own sake.
