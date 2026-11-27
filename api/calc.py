"""Calculated stats: small formulas over catalog fields, like `pts / min`.

A formula may use field ids, numbers, + - * / and brackets. Nothing else gets
through: the parser rebuilds the SQL from its own pieces, and every field id is
swapped for that field's catalog SQL. Division never errors: `a / b` becomes
`a / nullif(b, 0)`, so a zero gives an empty cell.

The same formula can be worked out two ways:
  - over a group (the usual case): each field is its group value, so `pts / min`
    is total points ÷ total minutes, not an average of per-game ratios;
  - per game (for "keep games where pts / min ≥ 1" filters): each field is that
    game's number.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

MAX_LEN = 200
_TOKEN = re.compile(r"\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(.))")


class CalcError(ValueError):
    pass


@dataclass
class Node:
    kind: str  # num | field | neg | + - * /
    value: str = ""
    left: Node | None = None
    right: Node | None = None


def _tokens(text: str) -> list[tuple[str, str]]:
    out = []
    pos = 0
    text = text.rstrip()
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m:
            break
        num, name, op = m.groups()
        if num is not None:
            out.append(("num", num))
        elif name is not None:
            out.append(("name", name.lower()))
        elif op in "+-*/()":
            out.append(("op", op))
        else:
            raise CalcError(f"“{op}” isn't allowed. Use field names, numbers, + − × ÷ and brackets.")
        pos = m.end()
    return out


def parse(text: str) -> Node:
    if not text.strip():
        raise CalcError("Type a formula, e.g. pts / min")
    if len(text) > MAX_LEN:
        raise CalcError(f"Keep formulas under {MAX_LEN} characters.")
    toks = _tokens(text)
    i = 0

    def peek() -> tuple[str, str] | None:
        return toks[i] if i < len(toks) else None

    def take() -> tuple[str, str]:
        nonlocal i
        t = toks[i]
        i += 1
        return t

    def expr() -> Node:
        node = term()
        while peek() in (("op", "+"), ("op", "-")):
            op = take()[1]
            node = Node(op, left=node, right=term())
        return node

    def term() -> Node:
        node = factor()
        while peek() in (("op", "*"), ("op", "/")):
            op = take()[1]
            node = Node(op, left=node, right=factor())
        return node

    def factor() -> Node:
        t = peek()
        if t is None:
            raise CalcError("The formula ends too soon.")
        if t == ("op", "-"):
            take()
            return Node("neg", left=factor())
        if t == ("op", "("):
            take()
            node = expr()
            if peek() != ("op", ")"):
                raise CalcError("A bracket isn't closed.")
            take()
            return node
        if t[0] == "num":
            take()
            return Node("num", t[1])
        if t[0] == "name":
            take()
            return Node("field", t[1])
        raise CalcError(f"Didn't expect “{t[1]}” there.")

    node = expr()
    if i < len(toks):
        raise CalcError(f"Didn't expect “{toks[i][1]}” there.")
    return node


def fields_in(node: Node) -> list[str]:
    if node.kind == "field":
        return [node.value]
    return [f for child in (node.left, node.right) if child for f in fields_in(child)]


def to_sql(node: Node, field_sql: Callable[[str], str]) -> str:
    """SQL for the formula; field_sql turns a field id into its SQL."""
    k = node.kind
    if k == "num":
        return node.value
    if k == "field":
        return f"cast({field_sql(node.value)} as double)"
    if k == "neg":
        return f"(-{to_sql(node.left, field_sql)})"
    a, b = to_sql(node.left, field_sql), to_sql(node.right, field_sql)
    if k == "/":
        return f"({a} / nullif({b}, 0))"
    return f"({a} {k} {b})"
