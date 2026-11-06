#!/bin/bash
# Cloud environment setup script: installs Claude Code skills + tools.
# Every step is guarded so a failure never blocks the session from starting.

S=~/.claude/skills
SRC=~/skill-src
mkdir -p "$S" "$SRC"

# Shallow, sparse clone of one folder from a GitHub repo
fetch() { # fetch owner/repo path
  d="$SRC/${1#*/}"
  [ -d "$d" ] || git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/$1" "$d"
  git -C "$d" sparse-checkout add "$2"
}

# 1. graphify (CLI + skill)
uv tool install graphifyy || true
fetch Graphify-Labs/graphify graphify && {
  mkdir -p "$S/graphify"
  cp "$SRC/graphify/graphify/skill.md" "$S/graphify/SKILL.md"
  cp -r "$SRC/graphify/graphify/skills/claude/references" "$S/graphify/"
} || true

# 2. karpathy-guidelines: comes from the account's anthropic-skills, nothing to install

# 3. ponytail
fetch DietrichGebert/ponytail skills && cp -r "$SRC/ponytail/skills/"* "$S/" || true

# 4. background coding agent
fetch openclaw/openclaw skills/coding-agent && cp -r "$SRC/openclaw/skills/coding-agent" "$S/" || true

# 5. prompt optimizer
fetch affaan-m/ecc skills/prompt-optimizer && cp -r "$SRC/ecc/skills/prompt-optimizer" "$S/" || true

# 6. OpenSpec CLI
npm install -g @fission-ai/openspec@latest || true

# Tell Claude Code when to use them
grep -q "Skills to use on every task" ~/.claude/CLAUDE.md 2>/dev/null || cat >> ~/.claude/CLAUDE.md <<'EOF'

## Skills to use on every task
- `graphify` for codebase/architecture questions (query graphify-out/ first when it exists).
- `ponytail` on every coding task; `ponytail-review`/`-audit`/`-debt` as needed.
- `anthropic-skills:karpathy-guidelines` when writing or reviewing code.
- `coding-agent` for long-running background coding work.
- `prompt-optimizer` when writing or improving prompts.
- OpenSpec (`openspec` CLI) for spec-driven changes: proposal before implementation.
EOF

exit 0
