# Git Commit Convention

This project follows a **simple, strict commit message convention** to keep the Git history clean, readable, and hackathon-friendly.

---

##  Commit Message Format

```

<type>(optional-scope): short description

```

### Examples
```

feature(editor): add ghost text AI suggestions
performance(editor): debounce AI completions
fix(api): handle invalid URL ingestion

```

---

##  Commit Types

###  feature
Use when **adding a new feature or capability**.

Examples:
```

feature: generate project structure from prompt
feature(editor): integrate CodeMirror 6
feature(webcontainer): run app inside editor
feature(github): push generated project to repository

```

---

###  performance
Use when **improving speed, latency, memory usage, or UX smoothness**.

Examples:
```

performance(editor): reduce re-renders during typing
performance(ai): cache LLM responses
performance(webcontainer): speed up dev server startup

```

---

###  fix
Use when **fixing a bug or incorrect behavior**.

Examples:
```

fix(editor): prevent cursor jump on tab accept
fix(api): handle crawl timeout errors
fix(auth): refresh expired GitHub token

```

---

###  refactor
Use when **restructuring code without changing behavior**.

Examples:
```

refactor(agent): simplify file generation pipeline
refactor(editor): extract editor logic into hooks

```

---

###  docs
Use for **documentation-only changes**.

Examples:
```

docs: add project README
docs: document API endpoints
docs: explain architecture and data flow

```

---

### chore
Use for **setup, tooling, configuration, or dependencies**.

Examples:
```

chore: initialize Next.js with TypeScript
chore: add eslint and prettier
chore: configure environment variables

```

---

## Scopes (Optional but Recommended)

Scopes describe **which part of the system** was affected.

Common scopes for this project:
```

editor
agent
ai
api
webcontainer
github
auth
db
ui
infra
docs

```

Example:
```

feature(agent): enable multi-file creation
performance(editor): debounce AI suggestions

```

---

## Commit Rules

- Use **present tense**
```

add 
❌ added 
❌ adding

```
- Keep subject line **under 72 characters**
- No period (`.`) at the end
- One logical change per commit

❌ Bad commits:
```

update code
final changes
fix stuff

```

---

##  Example Commit History (Ideal)

```

chore: initialize Next.js project
feature(editor): integrate CodeMirror 6
feature(agent): generate project from prompt
feature(webcontainer): enable live preview
feature(editor): add ghost text AI suggestions
performance(editor): debounce AI completion calls
fix(editor): resolve cursor jump issue
docs: add setup and architecture guide

```

---

## Summary

This convention helps:
- Keep commit history clean
- Make reviews and debugging easier
- Impress judges and collaborators
- Scale smoothly beyond the hackathon

Stick to it 
```
