---
name: commit-message
description: Suggest Conventional Commits messages for the current changes in the TagTape repo, and split them into commits when they cover more than one concern. Use when a step or task is finished, when the user asks for a commit message, or before any change would be committed. Never runs git commit; the user commits.
---

# Commit message (suggest only)

**The user makes every commit.** Never run `git commit`, `git push`, `git rebase`, or anything that rewrites history. Read the changes, then print the suggested message(s) for the user to use.

## Workflow

1. Look at the changes with `git status --short`, `git diff --stat`, `git diff`, and `git diff --cached` for anything already staged.
2. Decide whether this is one commit or several. Split when the changes do more than one logical thing, for example a refactor mixed with a feature, or a dependency bump mixed with code. A pure move or rename should be its own commit, so git records it as a rename.
3. For each commit, give only the message text in a fenced block. Don't include `git add` or `git commit` commands; the user writes those. When there's more than one commit, add one short line before each message naming the files it covers.

## Format: Conventional Commits 1.0

```
<type>(<scope>): <subject>

<body: why, not what. Wrap at 72 characters. Optional for trivial changes.>

<footer: BREAKING CHANGE: …, Refs #123. Optional.>
```

- **Types:**
  - `feat`: user-visible capability
  - `fix`: bug fix
  - `refactor`: no behaviour change
  - `perf`
  - `test`
  - `docs`
  - `build`: tooling, bundling, package manager
  - `ci`
  - `chore`: everything else
  - `revert`
- **Scopes** (optional, one per commit):
  - `web` (TanStack Start app)
  - `api` (Fastify service)
  - `shared` (`@tagtape/shared`)
  - `legacy`
  - `repo` (root config, agent setup, monorepo wiring)
  - `deps`
  - Leave the scope out when the change spans the whole repo.
- **Subject:** imperative mood ("add", not "added"), lowercase, no trailing period, at most 72 characters including the prefix.
- **Breaking changes:** add `!` after the type or scope, and a `BREAKING CHANGE:` footer.
- Add a trailer such as `Co-Authored-By` only when the user or the session's instructions ask for it.

## Examples

```
feat(api): add job endpoints with yt-dlp pipeline
fix(shared): reject youtube playlist urls
refactor(web): extract track list into its own component
build(repo): restructure into pnpm monorepo
chore(deps): bump @tanstack/react-start to 1.170
```
