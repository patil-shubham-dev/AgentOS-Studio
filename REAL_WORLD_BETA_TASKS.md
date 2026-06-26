# Real World Beta Tasks

> Generated: 2026-06-24
> Purpose: 50 realistic developer tasks for RC1 validation
> Rule: All tasks must be runnable against any TypeScript/React codebase

---

## Category 1: Bug Fixes (10 tasks)

### Task 1.1 — Null Reference Fix
```
Fix a crash when a nullable property is accessed without optional chaining.

Prompt: "Fix the null reference error when accessing user.profile.name
where profile can be undefined"

Expected: Optional chaining or null check added
Difficulty: Easy
```

### Task 1.2 — Missing Key in Object
```
Fix a runtime error caused by accessing a property that may not exist
on a dynamic object.

Prompt: "Add a safety check for when 'config.apiEndpoint' might not exist
before trying to construct a URL from it"

Expected: Optional access or default value
Difficulty: Easy
```

### Task 1.3 — Async Error Not Caught
```
Wrap an async function call in a try/catch to prevent unhandled promise
rejection.

Prompt: "Add error handling to the async 'loadData()' call so failures
don't cause an unhandled promise rejection"

Expected: try/catch or .catch() added
Difficulty: Easy
```

### Task 1.4 — Race Condition in State Update
```
Fix a stale closure issue where a callback captures an outdated state value.

Prompt: "Fix the stale closure in the useEffect - the interval callback
captures an old 'count' value"

Expected: useRef or updated dependency array
Difficulty: Medium
```

### Task 1.5 — Incorrect Array Filter
```
Fix a filter condition that excludes valid items or includes invalid ones.

Prompt: "The active users filter returns users with status 'inactive'.
Fix the condition to only show users with status 'active'"

Expected: Filter condition corrected
Difficulty: Easy
```

### Task 1.6 — Missing Return Statement
```
Add a return statement to a function that computes a value but doesn't
return it, causing callers to receive undefined.

Prompt: "The formatDate function doesn't return the formatted string.
Add the missing return"

Expected: Return statement added
Difficulty: Easy
```

### Task 1.7 — Wrong Variable Name
```
Fix a typo in a variable name that causes a ReferenceError.

Prompt: "Fix the ReferenceError: 'responsse' is not defined — it should
reference 'response'"

Expected: Variable name corrected
Difficulty: Easy
```

### Task 1.8 — Infinite Loop
```
Fix a missing or incorrect loop termination condition.

Prompt: "The while loop never terminates because 'index' is never
incremented. Fix it"

Expected: Increment or proper termination added
Difficulty: Medium
```

### Task 1.9 — Memory Leak (Event Listener)
```
Remove an event listener that was added but never cleaned up, causing
a memory leak on component unmount.

Prompt: "The scroll event listener in useEffect is never removed.
Return a cleanup function that removes it"

Expected: Cleanup function with removeEventListener
Difficulty: Medium
```

### Task 1.10 — Wrong Comparison Operator
```
Fix a comparison that uses = instead of == or ===, or uses == where
strict comparison is needed.

Prompt: "The login check uses assignment (=) instead of comparison (===).
Fix it"

Expected: Comparison operator corrected
Difficulty: Easy
```

---

## Category 2: Refactors (10 tasks)

### Task 2.1 — Extract Function
```
Extract a repeated block of code into a named function.

Prompt: "The input validation logic is duplicated in 3 places.
Extract it into a validateInput() function"

Expected: New function, callers updated
Difficulty: Medium
```

### Task 2.2 — Convert to TypeScript
```
Convert a .js file to .ts with proper type annotations.

Prompt: "Convert this utility function to TypeScript — add proper
types for parameters and return value"

Expected: .ts file with type annotations
Difficulty: Medium
```

### Task 2.3 — Destructure Props
```
Replace props.propName access with destructured props in a React component.

Prompt: "Refactor the component to destructure 'title', 'onClick',
and 'disabled' from props at the top"

Expected: Destructured parameters
Difficulty: Easy
```

### Task 2.4 — Replace `any` with Specific Types
```
Replace loose `any` types with proper unions, interfaces, or generics.

Prompt: "Replace the 'any' type on the API response handler with
a proper interface for the data shape"

Expected: Specific type replacing any
Difficulty: Medium
```

### Task 2.5 — Convert Class Component to Function Component
```
Convert a simple class component to a function component with hooks.

Prompt: "Convert the Counter class component to a function component
using useState and useEffect"

Expected: Function component with hooks
Difficulty: Medium
```

### Task 2.6 — Extract Constants from Magic Strings
```
Replace hardcoded string/number literals with named constants.

Prompt: "Extract the magic number 30000 and the string 'api/v2/users'
into named constants"

Expected: Constants defined and referenced
Difficulty: Easy
```

### Task 2.7 — Flatten Nested Conditionals
```
Simplify deeply nested if/else chains with early returns or guard clauses.

Prompt: "Refactor the nested if/else chain to use early returns
for the error cases"

Expected: Early returns replacing nesting
Difficulty: Medium
```

### Task 2.8 — Replace Callback with Async/Await
```
Convert a .then().catch() chain to async/await.

Prompt: "Replace the promise chain with async/await for readability"

Expected: Async/await replacing .then()
Difficulty: Medium
```

### Task 2.9 — Split Monolithic Function
```
Break a function that does too many things into smaller focused functions.

Prompt: "Split the processOrder function into validateOrder,
calculateTotal, and sendConfirmation"

Expected: Multiple focused functions
Difficulty: Hard
```

### Task 2.10 — Enums for String Constants
```
Replace string literal unions with a TypeScript enum.

Prompt: "Replace the 'pending' | 'processing' | 'completed' | 'failed'
string union with a Status enum"

Expected: Enum defined and used
Difficulty: Easy
```

---

## Category 3: Features (10 tasks)

### Task 3.1 — Add Loading State
```
Add a loading spinner while data is being fetched.

Prompt: "Show a loading spinner while the user list is being fetched.
Use a 'loading' state variable"

Expected: Loading state + spinner component
Difficulty: Easy
```

### Task 3.2 — Add Error Boundary
```
Wrap a component tree in a React error boundary with fallback UI.

Prompt: "Add an error boundary around the Dashboard component that
shows 'Something went wrong' on error"

Expected: Error boundary component
Difficulty: Medium
```

### Task 3.3 — Add Empty State
```
Show a friendly message when a list is empty instead of rendering nothing.

Prompt: "When the search returns no results, show 'No results found'
instead of an empty list"

Expected: Empty state component
Difficulty: Easy
```

### Task 3.4 — Add Keyboard Shortcut
```
Add a Ctrl+S / Cmd+S keyboard shortcut to trigger save.

Prompt: "Add a keyboard shortcut handler that saves when the user
presses Ctrl+S or Cmd+S"

Expected: Keyboard event listener
Difficulty: Medium
```

### Task 3.5 — Add Confirmation Dialog
```
Show a confirmation dialog before destructive actions.

Prompt: "Show a 'Are you sure?' dialog before deleting a record.
Cancel should abort the delete"

Expected: Confirmation dialog
Difficulty: Medium
```

### Task 3.6 — Add Sort Option
```
Add sort buttons to a data table that sort by column.

Prompt: "Add click-to-sort on the Name and Date columns. Click once
for ascending, again for descending"

Expected: Sort toggle on columns
Difficulty: Medium
```

### Task 3.7 — Add Search/Filter
```
Add a text search input that filters a list in real-time.

Prompt: "Add a search box above the list that filters items by name
as the user types"

Expected: Search input + filter logic
Difficulty: Easy
```

### Task 3.8 — Add Pagination
```
Add page navigation to a long list, showing 20 items per page.

Prompt: "Add pagination to the activity log — show 20 items per page
with Previous/Next buttons"

Expected: Pagination controls
Difficulty: Medium
```

### Task 3.9 — Add Dark Mode Toggle
```
Add a theme toggle that switches between light and dark mode.

Prompt: "Add a dark mode toggle in the header. Persist the preference
in localStorage"

Expected: Theme toggle + persistence
Difficulty: Medium
```

### Task 3.10 — Add Auto-Save
```
Add auto-save that persists form data 2 seconds after the last change.

Prompt: "Add auto-save to the editor form — save after 2 seconds
of no typing. Show 'Saved' indicator"

Expected: Debounced save + indicator
Difficulty: Medium
```

---

## Category 4: Repository Analysis (10 tasks)

### Task 4.1 — Count Dependencies
```
Prompt: "How many npm dependencies does this project have?
List the top 5 by version count"

Expected: Dependency count + top 5
```

### Task 4.2 — Find Dead Code
```
Prompt: "Find any exported functions or components that are
never imported anywhere in the codebase"

Expected: List of unused exports
```

### Task 4.3 — Architecture Summary
```
Prompt: "Describe the project architecture — is it monorepo?
What patterns does it use? List entry points"

Expected: Architecture summary
```

### Task 4.4 — Find Circular Dependencies
```
Prompt: "Check for circular dependencies between modules.
List any cycles found"

Expected: Circular dependency list
```

### Task 4.5 — Test Coverage Estimate
```
Prompt: "Count the number of test files vs source files.
Estimate the test coverage ratio"

Expected: Test count, source count, ratio
```

### Task 4.6 — API Route Inventory
```
Prompt: "List all API route handlers or service endpoints.
Group by HTTP method"

Expected: API route inventory
```

### Task 4.7 — TypeScript Strictness Audit
```
Prompt: "How many implicit 'any' types exist in the codebase?
Count files that disable strict mode"

Expected: Count of implicit any + strict-mode-disabled files
```

### Task 4.8 — Component Tree
```
Prompt: "Map the React component hierarchy — which components
are parents/children of which"

Expected: Component tree (partial or full)
```

### Task 4.9 — Lint Error Count
```
Prompt: "Run the linter and count how many warnings and errors exist.
Group by rule"

Expected: Lint error count by rule
```

### Task 4.10 — Build Time Analysis
```
Prompt: "Run the build and report how long it takes.
Break down by stage if possible"

Expected: Build time breakdown
```

---

## Category 5: Code Review (10 tasks)

### Task 5.1 — Security Review
```
Prompt: "Review this authentication handler. Are there any security
issues with token handling or input validation?"

Expected: Security issues found or "none found"
```

### Task 5.2 — Performance Review
```
Prompt: "Review this data fetching component. Are there any
performance issues with re-renders or data loading?"

Expected: Performance concerns or "none found"
```

### Task 5.3 — Error Handling Review
```
Prompt: "Review the error handling in this API route.
Are there any uncaught errors or missing edge cases?"

Expected: Error handling gaps or "none found"
```

### Task 5.4 — Type Safety Review
```
Prompt: "Review the types in this file. Are there any unsafe
type assertions or missing type guards?"

Expected: Type safety issues or "none found"
```

### Task 5.5 — Accessibility Review
```
Prompt: "Review this component for accessibility issues.
Check for missing aria labels, keyboard nav, or contrast"

Expected: Accessibility issues or "none found"
```

### Task 5.6 — Best Practices Review
```
Prompt: "Review this file for React best practices.
Are there any anti-patterns or hook violations?"

Expected: Best practice issues or "none found"
```

### Task 5.7 — Code Duplication Review
```
Prompt: "Are there any duplicated code blocks or similar
functions that could be consolidated?"

Expected: Duplication report or "none found"
```

### Task 5.8 — API Design Review
```
Prompt: "Review this API endpoint design. Are the routes
RESTful? Are error responses consistent?"

Expected: API design feedback
```

### Task 5.9 — Dependency Review
```
Prompt: "Review the dependencies in package.json.
Are there any outdated, unused, or duplicate dependencies?"

Expected: Dependency feedback
```

### Task 5.10 — Migration Review
```
Prompt: "Review this code that was migrated from JS to TS.
Are there any places where 'any' was used as a shortcut?"

Expected: Migration gaps or "none found"
```

---

## Scoring

| Category | Tasks | Pass Threshold |
|----------|-------|----------------|
| Bug Fixes | 10 | 8/10 |
| Refactors | 10 | 8/10 |
| Features | 10 | 8/10 |
| Analysis | 10 | 8/10 |
| Code Review | 10 | 8/10 |

**Overall: 40/50 tasks must succeed.**

---

## Task Format

Each task should be:
1. Read by the participant from the task list
2. Converted to a natural language prompt in the chat
3. AgenticOS executes the prompt
4. Participant reviews the result
5. Result is recorded: success / partial / fail
6. Brief comment on quality

### Success Criteria
- Bug fix: Bug is actually fixed (no regression)
- Refactor: Code is functionally identical, structurally improved
- Feature: Feature works as described
- Analysis: Information is accurate and complete
- Review: Findings are relevant and correct
