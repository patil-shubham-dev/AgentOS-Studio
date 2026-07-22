import type { SkillDefinition } from '../SkillRegistry'

export const issueToPRSkill: SkillDefinition = {
  name: 'issue-to-pr',
  description: 'Takes a GitHub issue, researches the codebase, implements the fix, runs tests, and creates a pull request.',
  prompt: [
    'Convert the given GitHub issue into a pull request using this process:',
    '',
    '1. **Read the issue** — Use github_search_issues or github_list_issues to get the issue details, including comments.',
    '2. **Research the codebase** — Use ReadFileTool, GlobTool, and GrepTool to find relevant files.',
    '3. **Plan the implementation** — State which files need to change and how.',
    '4. **Create a branch** — Use BashTool with git checkout -b to create a feature branch named fix/{issue-number}-{short-description}.',
    '5. **Implement the changes** — Use WriteFileTool and EditFileTool to make the necessary edits.',
    '6. **Run tests** — Use BashTool to run the project test suite.',
    '7. **Fix any failures** — If tests fail, diagnose and fix the issues, then re-run.',
    '8. **Commit and push** — Use GitCommitTool, then git push.',
    '9. **Create the PR** — Use github_create_pull_request with a descriptive title and body referencing the issue.',
    '',
    'Rules:',
    '- Read the issue body AND all comments before starting.',
    '- Only change files necessary to resolve the issue.',
    '- Keep commits atomic and well-described.',
    '- If tests fail after 3 attempts, stop and report the failures.',
  ].join('\n'),
  source: 'bundled',
  tags: ['github', 'pr', 'issue', 'automation'],
  aliases: ['issue-to-pr', 'fix-issue', 'pr-from-issue', 'implement-issue'],
  requiresConfirmation: true,
}
