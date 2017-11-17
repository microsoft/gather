import ast


class _Block:
    def __init__(self, block_id, hint, statements=None):
        self.statements = statements or []
        self.block_id = block_id
        self.hint = hint

    def __repr__(self):
        import codegen
        code = '\n'.join(['    ' + codegen.to_source(stmt) for stmt in self.statements])
        return "BLOCK " + str(self.block_id) + " (" + self.hint + "):\n" + code


class ControlFlowGraph:

    def __init__(self, statements):
        self.global_id = 0
        self.blocks = []
        self.successors = set()
        exception_exit_block = self._make_block('exceptional exit')
        self.entry, self.exit = self._cfg_for_statements(
            'entry', statements, None, None, exception_exit_block)

    def _make_block(self, hint: str, statements=None) -> _Block:
        block = _Block(self.global_id, hint, statements)
        self.blocks.append(block)
        self.global_id += 1
        return block

    def get_blocks(self):
        """
        Get the basic blocks in the control flow graph, starting with
        the entry block.
        """
        visited = set()
        to_visit = set([self.entry])
        while to_visit:
            block = to_visit.pop()
            visited.add(block)
            yield block
            for (pred, succ) in self.successors:
                if pred == block and not (succ in visited):
                    to_visit.add(succ)

    def get_successors(self, block):
        """
        Get the blocks that can be executed directly after the given basic block.
        """
        return [succ for (pred, succ) in self.successors if pred == block]

    def get_predecessors(self, block):
        """
        Get the blocks that can be executed directly before the given basic block.
        """
        return [pred for (pred, succ) in self.successors if succ == block]

    def print(self):
        """
        Print the control flow graph, for debugging.
        """
        print('CFG', 'ENTRY:', self.entry.block_id, 'EXIT:', self.exit.block_id)
        for block in self.get_blocks():
            print(block.__repr__())
            if block == self.exit:
                print('    EXIT')
            else:
                print('    SUCC', [succ.block_id for (pred, succ)
                                   in self.successors if pred == block])

    def _add_successor(self, block1, block2):
        self.successors.add((block1, block2))

    def _handle_if(self, statement: ast.If, last, closest_loop_head, closest_loop_exit, exc_block):
        test_block = self._make_block('if test', [statement.test])
        self._add_successor(last, test_block)
        body_entry, body_exit = self._cfg_for_statements(
            'if body', statement.body, closest_loop_head, closest_loop_exit, exc_block)
        self._add_successor(test_block, body_entry)
        join_block = self._make_block('conditional join')
        self._add_successor(body_exit, join_block)
        if statement.orelse:
            else_entry, else_exit = self._cfg_for_statements(
                'else body', statement.orelse, closest_loop_head, closest_loop_exit, exc_block)
            self._add_successor(test_block, else_entry)
            self._add_successor(else_exit, join_block)
        else:
            self._add_successor(test_block, join_block)
        return join_block

    def _handle_while(self, statement: ast.While, last, exc_block):
        head = [statement.test]
        loop_head_block = self._make_block('while loop head', head)
        self._add_successor(last, loop_head_block)
        after_loop = self._make_block('while loop join')
        body_entry, body_exit = self._cfg_for_statements(
            'while body', statement.body, loop_head_block, after_loop, exc_block)
        self._add_successor(loop_head_block, body_entry)
        self._add_successor(body_exit, loop_head_block)  # back edge
        self._add_successor(loop_head_block, after_loop)
        return after_loop

    def _handle_for(self, statement: ast.For, last, exc_block):
        # We approximate an iter call with an assignment
        head = [ast.Assign(statement.target, statement.iter)]
        loop_head_block = self._make_block('for loop head', head)
        self._add_successor(last, loop_head_block)
        after_loop = self._make_block('for loop join')
        body_entry, body_exit = self._cfg_for_statements(
            'for body', statement.body, loop_head_block, after_loop, exc_block)
        self._add_successor(loop_head_block, body_entry)
        self._add_successor(body_exit, loop_head_block)  # back edge
        self._add_successor(loop_head_block, after_loop)
        return after_loop

    def _handle_with(self, statement: ast.With, last, closest_loop_head, closest_loop_exit, exc_block):
        resource_block = self._make_block([statement.items])
        self._add_successor(last, resource_block)
        body_entry, body_exit = self._cfg_for_statements(
            'with body', statement.body, closest_loop_head, closest_loop_exit, exc_block)
        self._add_successor(resource_block, body_entry)
        return body_exit

    def _handle_try(self, statement: ast.Try, last, closest_loop_head, closest_loop_exit, exc_block):
        # a block for normal exit from the body
        after_try = self._make_block('try join')
        # For the handlers, create a block that fans out to all handler bodies.
        # This block is reachable from any nested raise statement.
        # FIXME make this block reachable from function calls
        if statement.handlers:
            handler_head = self._make_block('handler fan out')
            handler_pairs = [self._cfg_for_statements(
                'handler body', h.body, closest_loop_head, closest_loop_exit, exc_block) for h in statement.handlers]
            for (entry, _) in handler_pairs:
                self._add_successor(handler_head, entry)
        # Translate the body, using the new exception block.
        body_entry, body_exit = self._cfg_for_statements(
            'try body', statement.body, closest_loop_head, closest_loop_exit,
            handler_head if statement.handlers else exc_block)
        self._add_successor(last, body_entry)
        # The finally block comes after the body and any handlers,
        # with the original exception context.
        if statement.finalbody:
            finally_entry, finally_exit = self._cfg_for_statements(
                'finally body', statement.finalbody,  closest_loop_head, closest_loop_exit, exc_block)
            self._add_successor(body_exit, finally_entry)
            self._add_successor(finally_exit, after_try)
            # All the handler CFGs go to the finally.
            if statement.handlers:
                for (_, handler_exit) in handler_pairs:
                    self._add_successor(handler_exit, finally_entry)
        else:
            # All the handler CFGs go to the statement after the try,
            # since the corresponding exception was handled.
            if statement.handlers:
                for (_, handler_exit) in handler_pairs:
                    self._add_successor(handler_exit, after_try)
            self._add_successor(body_exit, after_try)
        return after_try

    def _cfg_for_statements(self, hint, statements, closest_loop_head, closest_loop_exit, exc_block):
        entry = self._make_block(hint)
        last = entry
        for statement in statements:
            if isinstance(statement, ast.If):
                last = self._handle_if(
                    statement, last, closest_loop_head, closest_loop_exit, exc_block)
            elif isinstance(statement, ast.While):
                last = self._handle_while(statement, last, exc_block)
            elif isinstance(statement, ast.For):
                last = self._handle_for(statement, last, exc_block)
            elif isinstance(statement, ast.With):
                last = self._handle_with(
                    statement, last, closest_loop_head, closest_loop_exit, exc_block)
            elif isinstance(statement, ast.Try):
                last = self._handle_try(
                    statement, last, closest_loop_head, closest_loop_exit, exc_block)
            elif isinstance(statement, ast.Raise):
                self._add_successor(last, exc_block)
            elif isinstance(statement, ast.Break):
                self._add_successor(last, closest_loop_exit)
            elif isinstance(statement, ast.Continue):
                self._add_successor(last, closest_loop_head)
            else:
                last.statements.append(statement)
        return (entry, last)
