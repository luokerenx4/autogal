# _invalid_typo

A deliberately-broken game. Its `game.yaml` declares a switch `unlocked`
but the script's `requires:` references `unlokced` (typo). The parser's
`validateGame` should reject this game at load time with a
`GameValidationError` listing every unresolved reference.

This is exercised by `scripts/validate-rejects-invalid-typo.sh` which
inverts the exit code — the test passes if loading fails with the
expected diagnostic.
