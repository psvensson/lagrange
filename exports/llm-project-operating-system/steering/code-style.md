# Code Style Guidelines

## Document Role

This document governs linting, formatting, and local coding-style rules.

Use it for:

- lint-oriented coding expectations
- formatting conventions
- naming conventions

Do not use it for architecture ownership, testing policy, or roadmap scope.

## Baseline Style

Adapt these defaults to the language and framework of the new project:

1. Use consistent indentation.
2. Keep lines short enough for review.
3. Prefer explicit names over abbreviations.
4. Avoid lint-disable comments unless a human approves a documented exception.
5. Keep local style consistent with surrounding code.

## Constants And Naming

Follow the scalar/state generation contract from `system-guidelines.md`.

Rules:

1. Shared domain literals belong in their canonical owner module.
2. File-local named constants are allowed for private values.
3. Suite-local named test constants are allowed for test-private values.
4. Do not inline domain/runtime scalars when an owner constant or explicit
   state variant should exist.
5. Do not introduce synonyms for existing concepts.
6. Do not expose semantic policy through combinable booleans when one named
   mode set should exist.
7. Do not leak raw storage, wire, or transport field shapes into runtime model
   names or public contracts.

## Before Completing Code Changes

1. Run the relevant formatter or linter.
2. Check for new unowned literals or branch piles.
3. Check that new names match the existing owner vocabulary.
4. Keep comments rare and focused on non-obvious intent.
