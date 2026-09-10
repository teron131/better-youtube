/** Bundles Markdown skills and derives their discovery metadata from the files' frontmatter. */

import questions from "./skills/questions/SKILL.md?raw";
import summary from "./skills/summary/SKILL.md?raw";

export const SKILLS = [readSkill(summary), readSkill(questions)];

/** Separates discovery metadata from the skill body so each workflow controls when guidance is loaded. */
function readSkill(markdown: string) {
  const document = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);
  const name = document?.[1].match(/^name: (.+)$/m)?.[1].trim();
  const description = document?.[1].match(/^description: (.+)$/m)?.[1].trim();
  if (!name || !description)
    throw new Error("Bundled skills require name and description frontmatter.");
  return { name, description, content: document![2].trim() };
}
