---
name: release
description: "Automate the full release process: version bump, git commit, push, tag, and GitHub Release creation. Use this skill whenever the user says 'release', 'new version', 'publish', 'tag a release', 'bump version', or asks to create a new release of the project."
disable-model-invocation: true
argument-hint: "[patch | minor | vX.Y.Z]"
---

# Release Automation

Automate the complete release workflow for FinanceTracker. The argument `$ARGUMENTS` specifies the version bump type.

## Step 1: Validate state

```bash
git branch --show-current   # must be "master"
git fetch origin
git rev-list HEAD..origin/master --count   # must be "0"
```

Abort if not on `master` or if local is behind remote.

## Step 2: Determine new version

Read current version from `package.json`. Parse `$ARGUMENTS`:
- `patch` → increment patch (e.g. 0.22.0 → 0.22.1)
- `minor` → increment minor (e.g. 0.22.0 → 0.23.0)
- `vX.Y.Z` or `X.Y.Z` → use as-is
- Empty → ask user with AskUserQuestion whether `patch` or `minor`

## Step 3: Commit pending changes

Check `git status`. If there are uncommitted changes:
1. Show `git diff --stat` to the user
2. Stage and commit with a descriptive message based on the changes

Then bump version in `package.json` and commit:
```
chore: bump version to X.Y.Z
```

## Step 4: Push and tag

```bash
git push origin master
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag push triggers the Docker build via GitHub Actions automatically.

## Step 5: Create GitHub Release

Collect commits since last tag:
```bash
git log --oneline $(git describe --tags --abbrev=0 HEAD~1)..HEAD
```

Generate release notes grouped by prefix:
- `feat:` → **Neue Features**
- `fix:` → **Bugfixes**
- `chore:` → **Wartung**
- Other → **Sonstiges**

Append Docker pull command at the end:
```
## Docker
docker pull anri04/finance-tracker:vX.Y.Z
```

Create the release — `gh` is only available at the full path:
```bash
"/c/Program Files/GitHub CLI/gh.exe" release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
<generated-notes>
EOF
)"
```

## Step 6: Confirm

Output the release URL and remind the user that the Docker build is running via GitHub Actions.
