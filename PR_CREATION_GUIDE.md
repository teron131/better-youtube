# GitHub Pull Request Creation Guide

## Branch: claude/review-chinese-conversion-fix-ESObH

This guide will help you create a pull request for the Chinese conversion fix and refactoring improvements.

---

## Prerequisites Check

1. Verify branch exists on GitHub
   - Go to: https://github.com/teron131/better-youtube/branches
   - Search for: `claude/review-chinese-conversion-fix-ESObH`
   - Should show: "86d1cd0 Refactor: Simplify codebase and improve performance"

2. Check if old PR was merged/closed
   - Go to: https://github.com/teron131/better-youtube/pulls?q=is%3Apr
   - Look for any PR with this branch name
   - If found and closed: Note the PR number (you'll reference it)

---

## Step-by-Step PR Creation

### Method 1: Direct Link (Easiest)

1. Click this link:
   ```
   https://github.com/teron131/better-youtube/compare/main...claude/review-chinese-conversion-fix-ESObH
   ```

2. Click the green "Create pull request" button

3. Skip to "PR Title and Description" section below

---

### Method 2: Manual (If link doesn't work)

1. Go to: https://github.com/teron131/better-youtube

2. Click "Pull requests" tab (near the top)

3. Click green "New pull request" button (top right)

4. Set the branches:
   - Base: `main` (or your default branch)
   - Compare: `claude/review-chinese-conversion-fix-ESObH`

5. Click green "Create pull request" button

6. Continue to "PR Title and Description" section below

---

## PR Title and Description

### Title (copy this):
```
Fix Traditional Chinese conversion and refactor codebase
```

### Description (copy and paste this entire block):

```markdown
## Summary
This PR fixes the Traditional Chinese (zh-TW) conversion issue and includes significant codebase refactoring for better performance and maintainability.

## Changes

### 🔧 Chinese Conversion Fix (Commit: 4de61b3)
- **Always convert at generation time** - Subtitles are now converted before saving to storage
- **Save converted captions** - Storage contains the final converted text (not originals)
- **Batch processing** - All segments converted in single operation for performance
- **Two conversion points**:
  1. Background script: During caption refinement (partial + final)
  2. Content script: When receiving generated subtitles

### 🚀 Performance & Code Quality (Commit: 86d1cd0)
- **Removed 77 lines** of duplicate/unnecessary code (6% reduction)
- **Eliminated duplicates**:
  - `getTargetLanguageFromStorage` function (was in 2 files)
  - `isExtensionContextValid` function (was in 2 files)
  - Chinese converter initialization (was in 2 files)
- **Simplified functions**:
  - Removed `convertSubtitlesImmediate` wrapper
  - Inlined `convertSubtitlesBatch`
  - Result: captionConversion.ts reduced 38% (57 → 35 lines)
- **Batched storage operations**:
  - Combined subtitle + font size loading (1 call instead of 2)
  - Cleaner async with `getStorageValues` helper
- **Removed backward compatibility constants**:
  - Deleted `CHROME_API` (duplicate of `API_ENDPOINTS`)
  - Deleted `UI_TIMING` (duplicate of `TIMING`)

## Files Changed
1. `src/lib/captionConversion.ts` - Centralized conversion, exported `s2tw`, simplified
2. `src/background/index.ts` - Convert before sending, use shared helpers
3. `src/content/messageHandler.ts` - Convert before saving
4. `src/content/index.ts` - Removed load-time conversion, batched storage reads
5. `src/content/autoGeneration.ts` - Use shared `isChromeContextValid`
6. `src/lib/constants.ts` - Removed backward compatibility bloat
7. `src/sidepanel/lib/utils.ts` - Import `s2tw` from shared module
8. `src/sidepanel/services/config.ts` - Use `TIMING` directly

## Testing
- ✅ Build passes (`npm run build`)
- ✅ TypeScript compilation successful
- ✅ All features preserved
- ✅ No breaking changes

## Impact
- **Performance**: Fewer storage API calls, no duplicate OpenCC initialization
- **Maintainability**: Single source of truth for conversion logic
- **Correctness**: Chinese conversion now works consistently for zh-TW target language
```

---

## After Creating PR

7. Review the PR page shows:
   - ✅ 2 commits visible
   - ✅ 7 files changed
   - ✅ Additions/deletions stats shown

8. Add labels (optional):
   - `enhancement`
   - `refactoring`
   - `performance`

9. Request reviewers (if applicable)

10. Copy the PR URL and save it for reference

---

## Verification Checklist

After PR is created, verify on the PR page:

- [ ] Title is clear and descriptive
- [ ] Description shows both commits (4de61b3 and 86d1cd0)
- [ ] All 7 files are listed in "Files changed" tab
- [ ] No merge conflicts
- [ ] CI/checks pass (if you have automated checks)

---

## Quick Reference

**Repository**: https://github.com/teron131/better-youtube
**Branch**: claude/review-chinese-conversion-fix-ESObH
**Latest Commit**: 86d1cd0 - "Refactor: Simplify codebase and improve performance"
**Previous Commit**: 4de61b3 - "Refactor Chinese conversion to convert and save at generation time"

**Direct PR Link**:
https://github.com/teron131/better-youtube/compare/main...claude/review-chinese-conversion-fix-ESObH

---

## Troubleshooting

**If branch doesn't appear:**
1. Make sure you're logged into GitHub
2. Refresh the page
3. Try the direct comparison link above

**If "Nothing to compare" appears:**
- Check if the branch was already merged
- Verify you're comparing against the correct base branch

**If old PR exists:**
- Close the old PR first, OR
- Create new PR and reference old PR number in description: "Supersedes #XXX"

---

## Notes for Next Session

When you come back to this:
1. Open this file: `/home/user/better-youtube/PR_CREATION_GUIDE.md`
2. Follow the steps in order
3. Use the direct link in "Quick Reference" section
4. Copy the entire PR description from "PR Title and Description" section

The PR description is already formatted and ready to paste!
