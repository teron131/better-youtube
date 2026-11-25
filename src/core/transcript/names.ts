/** Finds name-shaped words a transcript repeats, which rewrite requests list so the model spells names consistently. */

// NAME judges only a word's shape, so it also takes ordinary capitalized words and Japanese loanwords.
// It matches katakana runs of three or more, capitalized words with another capital or a digit after their first letter, capitalized words in mid-sentence, and capitalized words right after Chinese or Japanese text, which capitalizes nothing but names.
// Latin words end at the first non-ASCII letter, since Chinese and Japanese put no space between a name and the next word, as in GPTは.
// "We ran GPT-X on the iPhone, and Sam liked it. Then クロード" → GPT-X, Sam, クロード
const NAME =
  /[゠-ヿ]{3,}|(?<![A-Za-z0-9])[A-Z][A-Za-z0-9.-]*[A-Z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?![A-Za-z0-9])|(?<=[^\s.!?] )[A-Z][a-z]+(?![A-Za-z0-9])|(?<=[　-ヿ一-鿿＀-￯])[A-Z][a-z]+(?![A-Za-z0-9])/g;

/** Most frequent first, ties in order of first use; mishearings the captions repeat stay in, since only one-off words are dropped. */
export function repeatedNames(text: string): string[] {
  const counts = new Map<string, number>();
  for (const [name] of text.matchAll(NAME)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}
