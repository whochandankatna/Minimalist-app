"""Research store. It may READ market symbols but must never import strategy,
execution or experiment modules (enforced by a test). Research produces
explanations and logged risk flags only; it cannot change trading in v1.
"""
