# Conventional Commits Standards Reference

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for creating an explicit commit history, which makes it easier to write automated tools on top of. This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages.

## Structure

The commit message MUST be structured as follows:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Commit Elements

- **type**: Communicates the intent to the consumers of the library. MUST be a noun.
- **scope**: (Optional) A noun describing a section of the codebase surrounded by parenthesis, e.g., `(parser)`.
- **description**: A short summary of the code changes. MUST immediately follow the colon and space after the type/scope prefix.
- **body**: (Optional) A longer commit body providing additional contextual information. MUST begin one blank line after the description.
- **footer**: (Optional) One or more footers, providing information like breaking changes or issue references. MUST begin one blank line after the body.

## Types

- **`feat`**: Introduces a new feature to the codebase (correlates with MINOR in Semantic Versioning).
- **`fix`**: Patches a bug in your codebase (correlates with PATCH in Semantic Versioning).
- **Other Recommended Types**: `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`.

*Note: Types are not treated as case-sensitive, but consistency is recommended (lowercase).*

## Breaking Changes

A commit that introduces a breaking API change (correlating with MAJOR in Semantic Versioning). A breaking change can be part of commits of any type.

It MUST be indicated in one of two ways:
1. **Type/Scope Prefix**: Indicated by a `!` immediately before the `:`. e.g., `feat!:`. If `!` is used, `BREAKING CHANGE:` MAY be omitted from the footer section.
2. **Footer**: Consists of the uppercase text `BREAKING CHANGE`, followed by a colon, space, and description. e.g., `BREAKING CHANGE: environment variables now take precedence over config files.`

## Footers (General)
- Each footer MUST consist of a word token, followed by either a `:<space>` or `<space>#` separator, followed by a string value.
- A footer's token MUST use `-` in place of whitespace characters, e.g., `Acked-by` (except for `BREAKING CHANGE` or `BREAKING-CHANGE`).

## Formatting Rules

1. Commits MUST be prefixed with a type, followed by the OPTIONAL scope, OPTIONAL `!`, and REQUIRED terminal colon and space.
2. The description MUST immediately follow the colon and space.
3. The body MUST begin one blank line after the description.
4. A commit body is free-form and MAY consist of any number of newline separated paragraphs.
5. One or more footers MAY be provided one blank line after the body.

## Examples

### Description and breaking change footer
```text
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

### `!` to draw attention to breaking change
```text
feat!: send an email to the customer when a product is shipped
```

### Scope and `!` to draw attention to breaking change
```text
feat(api)!: send an email to the customer when a product is shipped
```

### Both `!` and BREAKING CHANGE footer
```text
feat!: drop support for Node 6

BREAKING CHANGE: use JavaScript features not available in Node 6.
```

### No body
```text
docs: correct spelling of CHANGELOG
```

### Scope
```text
feat(lang): add Polish language
```

### Multi-paragraph body and multiple footers
```text
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
```

### Revert commit
```text
revert: let us never again speak of the noodle incident

Refs: 676104e, a215868
```
