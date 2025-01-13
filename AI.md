# AI Agent Guidelines

Welcome, AI agent! This guide will help you understand how to work with our codebase effectively.

## Project Overview

DocsPasta is a documentation crawler and processor that makes documentation searchable and accessible. Our vision and long-term strategy can be found in `.docs/ai-notes/topics/vision/`.

## Workflow Guidelines

1. **Task Planning → Implementation → Documentation → Review**
   - Start with task planning in `.docs/ai-notes/temp/`
   - Implement changes following our code standards
   - Document changes in appropriate `.docs/ai-notes/topics/` location
   - Review for completeness and accuracy

2. **Documentation Rules**
   - Use templates from `.docs/ai-notes/_templates/`
   - Store temporary notes in `.docs/ai-notes/temp/`
   - Place permanent records in `.docs/ai-notes/topics/`
   - Always link to relevant decisions/features

3. **Best Practices**
   - Check existing docs before creating new ones
   - Use provided templates for consistency
   - Keep documentation atomic and well-linked
   - Follow our code style and conventions

## Directory Structure

```sh
.docs/
├── ai-notes/
│   ├── _templates/    # Use these for new docs
│   ├── temp/         # For work-in-progress
│   └── topics/       # Permanent documentation
```

## Tech Stack

- Frontend: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- Backend: Node.js, Express.js, TypeScript
- Database: Supabase (PostgreSQL)
- Testing: Vitest
