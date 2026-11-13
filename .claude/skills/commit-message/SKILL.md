---
name: commit-message
description: Suggest Conventional Commits messages for the current changes in the TagTape repo, and split them into commits when they cover more than one concern. Use when a step or task is finished, when the user asks for a commit message, or before any change would be committed. Commits on the current claude/ branch; never pushes.
---

# Commit message

**The agent commits each finished step** on its `claude/<topic>` branch (cut from `dev`). Never run `git push`, merge into `dev` or `main`, tag, or rewrite pushed history: the user does those. Read the changes, write the message(s), and commit.

## Workflow

1. Look at the changes with `git status --short`, `git diff --stat`, `git diff`, and `git diff --cached` for anything already staged.
2. Decide whether this is one commit or several. Split when the changes do more than one logical thing, for example a refactor mixed with a feature, or a dependency bump mixed with code. A pure move or rename should be its own commit, so git records it as a rename.
3. Check that `pnpm check`, typecheck and the relevant tests pass. Then, for each commit, stage only its files (`git add <paths>`) and run `git commit -F -` with the message. Report each commit's short hash and subject.

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
  - `desktop` (the Electron app and its pipeline)
  - `website` (the Astro site)
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
feat(desktop): save an album as a folder of MP3s
fix(shared): reject links with credentials
refactor(desktop): extract track list into its own component
build(repo): restructure into pnpm monorepo
chore(deps): bump electron to 45.3
```
