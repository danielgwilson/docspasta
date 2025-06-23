# CLAUDE.md

🚨 **MOST CRITICAL RULE**: **ALWAYS USE RESUMABLE-STREAM FOR SSE** 🚨
- **NEVER** implement custom ReadableStream for SSE
- **NEVER** handle Last-Event-ID manually
- **ALWAYS** use resumable-stream's ResumableReadableStream
- The V5 SSE implementation in `/api/v5/jobs/[id]/stream/route.ts` is the correct pattern

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Current Architecture**: Docspasta V2 uses a **Vercel-native serverless architecture** with:
- PostgreSQL for persistent data storage
- QStash for job queuing and processing
- Resumable-stream for SSE real-time updates
- Database-driven state management (no Redis)

**V5 API Status**: Complete and production-ready with clean separation of concerns.

## Development Instructions

### Server Management
- The user will run the dev server for you. If it is not running, stop and ask the user to run it. Do not run the dev server yourself.

## Kit MCP for Code Navigation

**IMPORTANT**: Always use the Kit MCP tool (`mcp__kit__*`) for code navigation and analysis. Kit provides:
- `open_repository`: Open and index a repository for fast searching
- `search_code`: Search for code patterns across the entire codebase
- `get_file_content`: Read multiple files efficiently
- `extract_symbols`: Find function/class definitions
- `find_symbol_usages`: Track where symbols are used
- `get_file_tree`: Understand project structure

- Always use serena mcp over find if possible

Use Kit instead of manual file navigation for better performance and comprehensive code understanding.

[The rest of the file remains unchanged...]