# Project rules

Scale Insights is a static web app. `app/build.mjs` copies `app/src/` to `app/dist/`, and Vercel deploys `app/dist/`.

## Code layout

- `app/src/*.js` are classic browser scripts (IIFEs sharing `window.SP`, no imports or exports). `app/src/index.html` loads them in order: `core.js`, `sales.js`, `products.js`, `ads.js`, `more.js`, `account.js`, `optimizer.js`, `app.js`.
- Types for the shared globals live in `app/types/globals.d.ts`.
- `app/dist/` is build output and is gitignored. Never edit or commit it.

## Commands (run in `app/`)

- `npm ci`: install dependencies
- `npm run build`: write `dist/` (Vercel runs `cd app && npm run build`)
- `npm run lint`: ESLint
- `npm run typecheck`: TypeScript check

CI (`.github/workflows/ci.yml`) runs Lint and Typecheck on every PR.

## Commits and pull requests

- Commit only as the repo-local git identity (Shaisab Mistry, already set in `.git/config`). No co-authors.
- No `Co-Authored-By` trailers, no "Generated with ..." lines, and no mention of the tools or assistants used to make a change. This applies to commit messages, PR titles and bodies, branch names, code comments and committed files.
- Every change goes through a branch and a PR into `main`. Never commit to or push `main` directly. The `main` ruleset rejects direct and force pushes and requires a PR, a successful Vercel deployment and Copilot code review.
- Keep `.claude/` out of commits. It is excluded locally through `.git/info/exclude`.

## Tests

- Every change to app code ships with unit tests for the new or changed behavior, in the same PR. They must pass locally and in CI before the PR goes up.
- A bug fix includes a test that fails without the fix.
- If a change has nothing unit-testable (CI config, docs, pure renames), say so in the PR description.
- There is no test runner yet. The first change that needs tests sets one up with a DOM environment (for example Vitest with jsdom or happy-dom) that loads the `app/src` scripts in order, and adds a Test job next to Lint and Typecheck in CI.

## GitHub access

- `origin` is SSH. Pushes authenticate as `shaisabm` through the repo-local `core.sshCommand`. Don't change global git or gh config for this repo.
- The globally active gh account can't see this private repo and should stay active. Pass a token per command instead of switching accounts:

  ```bash
  GH_TOKEN="$(gh auth token --hostname github.com --user shaisabm)" gh pr create ...
  ```

## Branch-switch trap

The first commit (`48b3f72`) still tracks `agent-session.jsonl`, `build-activity.log`, `app/dist/`, `inbox/` and `.idea/`, which are now gitignored live files. Checking out that commit overwrites them, and moving forward again deletes them. Never check it out.

To update local `main`, run this from a branch where those files are already untracked:

```bash
git fetch origin && git branch -f main origin/main && git switch main
```
