"""Domain plugin registry — a family of checkers behind one interface.

A problem opts into a domain by setting "domain" in its JSON entry (e.g.
"algebra2"). Problems without the key get core checker/tutor behavior and
never touch domain code: the domain module is lazy-imported here on first use,
so it is not even imported on a core execution path. Unknown domain names
degrade to core behavior (None) rather than crashing.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass, field
from typing import Callable

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DomainHooks:
    """Optional overrides a domain provides. Each hook returns None to defer
    to core behavior.

    transition_status(prev, curr, var, problem) -> "valid" | "invalid" | "unknown" | None
    final_answer_ok(exprs, answer_expr, var, problem) -> bool | None
    final_form_ok(expr, problem) -> bool | None
    tutor_prompt_addendum(problem) -> str
    allowed_symbols(problem) -> set[Symbol] | None  (multi-variable domains)
    check_all(problem, exprs) -> (divergent_line_index, final_answer_correct) | None
        Full takeover for domains whose step semantics don't fit the
        core anchor loop (e.g. systems of equations, where a step is valid
        as a consequence of ALL trusted lines, not just the previous one).
    """

    name: str
    transition_status: Callable | None = None
    final_answer_ok: Callable | None = None
    final_form_ok: Callable | None = None
    tutor_prompt_addendum: Callable | None = None
    allowed_symbols: Callable | None = None
    check_all: Callable | None = None
    extra_error_types: frozenset = field(default_factory=frozenset)


_cache: dict[str, DomainHooks | None] = {}


def get_hooks(domain: str | None) -> DomainHooks | None:
    """Return the domain's hooks, or None for core-only behavior.

    The domain module is imported lazily on first request for that domain so
    a broken domain module can never affect problems outside that domain.
    """
    if not domain:
        return None
    if domain not in _cache:
        try:
            module = importlib.import_module(f".{domain}", __package__)
            hooks = getattr(module, "HOOKS", None)
            if not isinstance(hooks, DomainHooks):
                hooks = None
        except Exception:
            logger.exception("failed to load domain %r; using core behavior", domain)
            hooks = None
        _cache[domain] = hooks
    return _cache[domain]


def _clear_cache() -> None:
    """Test helper: drop cached hooks so lazy-import behavior is observable."""
    _cache.clear()
