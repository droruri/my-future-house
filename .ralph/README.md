# .ralph

Settings for the ralph issue loop (https://github.com/droruri/druri-ralph-loop).

- config.json: the settings; change them with `ralph config set <key> <value>`.
- prompts/<phase>.extra.md: optional text added to a phase prompt.
- ../.claude/skills/ralph-issue/SKILL.md: the /ralph-issue skill; `ralph upgrade` rewrites it.
- wt/ and logs/: worktrees and logs of runs (gitignored).

Run `ralph explain` for the commands, phases, labels, issue format and every setting.
