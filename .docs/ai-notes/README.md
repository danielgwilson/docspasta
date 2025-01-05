# AI Documentation System

This directory contains our AI-friendly documentation system that helps both human developers and AI agents collaborate effectively.

## How to Use This System

1. **For New Tasks**
   - Start in `temp/` for work-in-progress notes
   - Use templates from `_templates/`
   - Move finalized content to appropriate `topics/` subdirectory

2. **For Existing Documentation**
   - Browse `topics/` directories by domain
   - Reference existing decisions before making new ones
   - Keep documentation linked and atomic

## Directory Structure

- `_templates/` - Markdown templates for tasks, decisions, and features
- `temp/` - Git-ignored workspace for in-progress documentation
- `topics/` - Permanent documentation organized by domain:
  - `workspace/` - Development environment setup and configuration
  - `features/` - Feature documentation and evolution
  - `decisions/` - Architecture and technical decisions
  - `vision/` - Long-term strategy and goals
  - `meta/` - Documentation about this documentation system

## Best Practices

1. Always use templates for consistency
2. Link related documents together
3. Keep documentation current and relevant
4. Clean up temporary files regularly
5. Update this system as needed 