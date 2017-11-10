"""
Analyze the dataflow in a Python program
"""

import ast
from typing import List, Set, Tuple


def _get_names(node: ast.AST) -> List[str]:
    if isinstance(node, list):
        return [n for nd in node for n in _get_names(nd)]
    return [n.id for n in ast.walk(node) if isinstance(n, ast.Name)]


def _get_defs_uses(statement: ast.AST) -> Tuple[Set[str], Set[str]]:
    if isinstance(statement, ast.Assign):
        return (_get_names(statement.targets), _get_names(statement.value))
    if isinstance(statement, ast.AnnAssign):
        return (_get_names(statement.target), _get_names(statement.value))
    if isinstance(statement, ast.AugAssign):
        return (_get_names(statement.target), _get_names(statement.value))
    return (set(), _get_names(statement))


def dataflow_analysis(cfg) -> List[Tuple[ast.AST, ast.AST]]:
    """
    Given a control flow graph for a Python program, compute all pairs
    of statements (S1,S2) where data assigned in S1 could potentially be
    read in S2.
    """
    work_queue = list(cfg.get_blocks())
    definitions = dict([(block.block_id, set()) for block in work_queue])
    dataflows = set()
    while work_queue:
        block = work_queue.pop(0)
        defs = set([d for pred in cfg.get_predecessors(block)
                    for d in definitions[pred.block_id]])
        for statement in block.statements:
            def_names, use_names = _get_defs_uses(statement)
            dataflows |= {(defstmt, statement)  # Data flows from defstmt to statement.
                          for (defname, defstmt) in defs if defname in use_names}
            genset = {(name, statement) for name in def_names}
            killset = {(name, stmt)
                       for (name, stmt) in defs if name in def_names}
            defs |= genset - killset
        if definitions[block.block_id] != defs:
            definitions[block.block_id] = defs
            for succ in cfg.get_successors(block):
                if not succ in work_queue:
                    work_queue.append(succ)
    return dataflows
