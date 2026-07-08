# Changelog

All notable changes to tree-diff will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-08

### Added
- Initial release
- Directory tree comparison with content hashing (SHA-256)
- Support for added, removed, modified, and type-changed file detection
- CLI with multiple output formats (text, JSON, markdown)
- Ignore patterns (glob-style, directory names, paths)
- Depth control (max-depth option)
- Size deltas per file and total
- Symlink tracking and detection
- TypeScript API with full type definitions
- Zero runtime dependencies

### Features
- **Content hashing** — SHA-256 based change detection (not just size)
- **Symlink tracking** — detects symlink target changes
- **Type changes** — file→dir, dir→symlink, etc.
- **Ignore patterns** — glob-style (*.log), directory names, paths
- **Depth control** — limit recursion depth
- **Size deltas** — per-file and total size changes
- **Zero dependencies**

### Testing
- 14 tests covering all core functionality
- 95.16% statement coverage
- 97.22% branch coverage
- 100% function coverage

### Documentation
- Comprehensive README with CLI and API examples
- STATUS.md with full exceptional checklist audit