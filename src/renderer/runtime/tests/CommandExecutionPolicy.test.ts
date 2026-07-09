import { describe, it, expect, beforeEach } from 'vitest'
import { CommandExecutionPolicy } from '@/runtime/tools/policies/CommandExecutionPolicy'

describe('CommandExecutionPolicy', () => {
  let policy: CommandExecutionPolicy

  beforeEach(() => {
    policy = new CommandExecutionPolicy()
  })

  describe('read-only tier', () => {
    it('allows npm test without approval', () => {
      const result = policy.isAllowed('npm test')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('allows npm run build without approval', () => {
      const result = policy.isAllowed('npm run build')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('allows ls without approval', () => {
      const result = policy.isAllowed('ls -la')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('allows git status without approval', () => {
      const result = policy.isAllowed('git status')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('allows git diff without approval', () => {
      const result = policy.isAllowed('git diff')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('allows echo without approval', () => {
      const result = policy.isAllowed('echo "hello"')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('allows cat without approval', () => {
      const result = policy.isAllowed('cat package.json')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('requires approval for unknown commands', () => {
      const result = policy.isAllowed('some-custom-tool --flag')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })
  })

  describe('ask tier', () => {
    it('requires approval for npm install', () => {
      const result = policy.isAllowed('npm install')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it('requires approval for npm add', () => {
      const result = policy.isAllowed('npm add lodash')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it('requires approval for git push', () => {
      const result = policy.isAllowed('git push origin main')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it('requires approval for git commit', () => {
      const result = policy.isAllowed('git commit -m "fix"')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it('requires approval for git reset', () => {
      const result = policy.isAllowed('git reset --hard HEAD~1')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it('requires approval for npm start', () => {
      const result = policy.isAllowed('npm start')
      expect(result.allowed).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })
  })

  describe('deny tier', () => {
    it('blocks sudo commands', () => {
      const result = policy.isAllowed('sudo rm -rf /')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })

    it('blocks rm -rf in home directory', () => {
      const result = policy.isAllowed('rm -rf ~/.config')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })

    it('blocks rm -rf /', () => {
      const result = policy.isAllowed('rm -rf /')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })

    it('blocks root filesystem delete', () => {
      const result = policy.isAllowed('rm -rf /var/log')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })

    it('blocks mkfs', () => {
      const result = policy.isAllowed('mkfs.ext4 /dev/sda1')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })

    it('blocks passwd', () => {
      const result = policy.isAllowed('passwd root')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })

    it('blocks chmod 4xx', () => {
      const result = policy.isAllowed('chmod 400 /etc/shadow')
      expect(result.allowed).toBe(false)
      expect(result.requiresApproval).toBe(false)
    })
  })

  describe('classify', () => {
    it('returns the correct tier for known commands', () => {
      expect(policy.classify('npm test').tier).toBe('read-only')
      expect(policy.classify('npm install').tier).toBe('ask')
      expect(policy.classify('sudo rm -rf').tier).toBe('deny')
    })

    it('includes a reason in classification', () => {
      const result = policy.classify('npm test')
      expect(result.reason).toBeTruthy()
      expect(typeof result.reason).toBe('string')
    })

    it('includes the matched rule pattern', () => {
      const result = policy.classify('git push origin main')
      expect(result.matchedRule).toBeTruthy()
    })
  })

  describe('custom rules', () => {
    it('addRule prepends to rule array', () => {
      policy.addRule({
        pattern: /^my-tool\b/i,
        tier: 'deny',
        reason: 'Custom block',
      })
      expect(policy.isAllowed('my-tool do-stuff').allowed).toBe(false)
    })

    it('setRules replaces all rules', () => {
      policy.setRules([
        { pattern: /./, tier: 'deny', reason: 'Block all' },
      ])
      expect(policy.isAllowed('npm test').allowed).toBe(false)
    })

    it('getRules returns a copy of the rules', () => {
      const rules = policy.getRules()
      const originalLength = rules.length
      rules.push({ pattern: /test/, tier: 'deny', reason: 'test' })
      expect(policy.getRules().length).toBe(originalLength)
    })
  })

  describe('output redirection with inspection commands', () => {
    it('requires approval for cat with output redirection', () => {
      const result = policy.isAllowed('cat > /etc/shadow')
      expect(result.requiresApproval).toBe(true)
    })

    it('requires approval for echo with output redirection', () => {
      const result = policy.isAllowed('echo "hacked" > /etc/passwd')
      expect(result.requiresApproval).toBe(true)
    })

    it('allows cat without redirection as read-only', () => {
      expect(policy.isAllowed('cat package.json').requiresApproval).toBe(false)
    })
  })

  describe('chained dangerous commands', () => {
    it('blocks chained sudo via &&', () => {
      const result = policy.isAllowed('echo "hello" && sudo rm -rf /')
      expect(result.allowed).toBe(false)
    })

    it('blocks chained rm via pipe', () => {
      const result = policy.isAllowed('ls | rm -rf /')
      expect(result.allowed).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles empty command', () => {
      const result = policy.isAllowed('')
      expect(result.allowed).toBe(true)
    })

    it('handles whitespace-only command', () => {
      const result = policy.isAllowed('   ')
      expect(result.allowed).toBe(true)
    })

    it('handles case-insensitive matching', () => {
      expect(policy.isAllowed('NPM TEST').allowed).toBe(true)
      expect(policy.isAllowed('GIT PUSH').requiresApproval).toBe(true)
    })
  })
})
