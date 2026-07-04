import type { SkillDefinition } from '../SkillRegistry'

export const addTestsSkill: SkillDefinition = {
  name: 'add-tests',
  description: 'Adds comprehensive unit or integration tests for a given function, module, or feature.',
  prompt: [
    'Write comprehensive tests for the specified code:',
    '',
    '1. **Read the target code** — Understand what the function/module does, its inputs, outputs, and edge cases.',
    '2. **Find the test file** — If a test file exists for this module, add to it. If not, create one in the same directory with a `.test.ts` or `.spec.ts` suffix.',
    '3. **Write tests** — Cover:',
    '   - Happy path (expected inputs produce expected outputs)',
    '   - Error cases (invalid inputs, missing data)',
    '   - Edge cases (empty arrays, null values, boundary conditions)',
    '   - Any async behavior (if applicable)',
    '4. **Use the project\'s test framework** — Check package.json for the test runner (Vitest, Jest, etc).',
    '5. **Run the tests** — Call run_command to run the test file after proposing it.',
    '',
    'Rules:',
    '- Tests must be deterministic — no random data, no time-dependent behavior without mocking.',
    '- Mock external dependencies (filesystem, network, database).',
    '- One assertion per test where possible.',
    '- Test names should read as sentences: "returns null when input is empty".',
  ].join('\n'),
  source: 'bundled',
  tags: ['testing', 'quality'],
  aliases: ['add-tests', 'write-tests', 'test-coverage', 'unit-test'],
  requiresConfirmation: false,
}
