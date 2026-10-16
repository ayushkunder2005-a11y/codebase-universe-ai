import ast
from typing import List, Dict, Set, Optional, Any
from app.parser.base import BaseParser, ParsedFile, ParsedImport, ParsedSymbol, ParsedCall

class ComplexityVisitor(ast.NodeVisitor):
    def __init__(self):
        self.complexity = 1

    def visit_If(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_While(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_For(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_AsyncFor(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_With(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_AsyncWith(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_Assert(self, node):
        self.complexity += 1
        self.generic_visit(node)

    def visit_BoolOp(self, node):
        self.complexity += len(node.values) - 1
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        # A nested function has its own complexity score.
        return

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        # Methods belong to the class's symbols, not the enclosing function.
        return


class FunctionCallVisitor(ast.NodeVisitor):
    """Collect calls in one function, excluding nested definitions."""

    def __init__(self, name_getter):
        self.name_getter = name_getter
        self.calls: List[str] = []

    def visit_FunctionDef(self, node):
        return

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        return

    def visit_Call(self, node):
        name = self.name_getter(node)
        if name:
            self.calls.append(name)
        self.generic_visit(node)

def compute_complexity(node: ast.AST) -> int:
    visitor = ComplexityVisitor()
    body = getattr(node, "body", None)
    if body is None:
        visitor.visit(node)
    else:
        for statement in body:
            visitor.visit(statement)
    return visitor.complexity

class PythonAstVisitor(ast.NodeVisitor):
    def __init__(self, code: str):
        self.code = code
        self.imports: List[ParsedImport] = []
        self.symbols: List[ParsedSymbol] = []
        self.calls: List[ParsedCall] = []
        self.imported_names: Set[str] = set()
        self.used_names: Set[str] = set()
        self.current_scope: List[str] = []

    def _get_call_name(self, node: ast.Call) -> Optional[str]:
        if isinstance(node.func, ast.Name):
            return node.func.id
        elif isinstance(node.func, ast.Attribute):
            return node.func.attr
        return None

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            name = alias.asname or alias.name
            self.imported_names.add(name)
            self.imports.append(ParsedImport(
                module=alias.name,
                names=[name],
                alias=alias.asname,
                line_number=node.lineno,
                is_from=False
            ))
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        module = node.module or ""
        imported_list = []
        for alias in node.names:
            name = alias.asname or alias.name
            self.imported_names.add(name)
            imported_list.append(name)
        
        self.imports.append(ParsedImport(
            module=module,
            names=imported_list,
            line_number=node.lineno,
            is_from=True
        ))
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        bases = []
        for b in node.bases:
            if isinstance(b, ast.Name):
                bases.append(b.id)
            elif isinstance(b, ast.Attribute):
                bases.append(f"{self._get_attr_name(b)}")

        docstring = ast.get_docstring(node)
        parent = ".".join(self.current_scope) if self.current_scope else None

        self.symbols.append(ParsedSymbol(
            name=node.name,
            kind="class",
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno),
            parent_symbol=parent,
            docstring=docstring,
            complexity=1,
            metadata={"bases": bases, "decorators": [ast.unparse(d) for d in node.decorator_list if hasattr(ast, 'unparse')]}
        ))

        self.current_scope.append(node.name)
        self.generic_visit(node)
        self.current_scope.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._handle_function(node, is_async=False)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self._handle_function(node, is_async=True)

    def _handle_function(self, node, is_async: bool):
        docstring = ast.get_docstring(node)
        parent = ".".join(self.current_scope) if self.current_scope else None
        kind = "method" if parent else ("async_function" if is_async else "function")
        
        params = [arg.arg for arg in node.args.args]
        return_type = None
        if node.returns:
            try:
                return_type = ast.unparse(node.returns) if hasattr(ast, 'unparse') else None
            except Exception:
                pass

        # Collect function-level calls
        call_visitor = FunctionCallVisitor(self._get_call_name)
        for statement in node.body:
            call_visitor.visit(statement)
        func_calls = call_visitor.calls

        complexity = compute_complexity(node)

        self.symbols.append(ParsedSymbol(
            name=node.name,
            kind=kind,
            line_start=node.lineno,
            line_end=getattr(node, 'end_lineno', node.lineno),
            parent_symbol=parent,
            docstring=docstring,
            parameters=params,
            return_type=return_type,
            complexity=complexity,
            calls=func_calls,
            metadata={"decorators": [ast.unparse(d) for d in node.decorator_list if hasattr(ast, 'unparse')]}
        ))

        self.current_scope.append(node.name)
        self.generic_visit(node)
        self.current_scope.pop()

    def visit_Call(self, node: ast.Call):
        call_name = self._get_call_name(node)
        if call_name:
            caller = ".".join(self.current_scope) if self.current_scope else None
            self.calls.append(ParsedCall(
                name=call_name,
                line_number=node.lineno,
                caller_symbol=caller
            ))
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, ast.Load):
            self.used_names.add(node.id)
        self.generic_visit(node)

    def _get_attr_name(self, node: ast.Attribute) -> str:
        if isinstance(node.value, ast.Name):
            return f"{node.value.id}.{node.attr}"
        elif isinstance(node.value, ast.Attribute):
            return f"{self._get_attr_name(node.value)}.{node.attr}"
        return node.attr

class PythonParser(BaseParser):
    def parse_code(self, code: str, file_path: str, relative_path: str) -> ParsedFile:
        lines = code.splitlines()
        loc = len(lines)
        blank_lines = sum(1 for line in lines if not line.strip())
        comment_lines = sum(1 for line in lines if line.strip().startswith("#"))

        parsed = ParsedFile(
            file_path=file_path,
            relative_path=relative_path,
            language="python",
            loc=loc,
            blank_lines=blank_lines,
            comment_lines=comment_lines
        )

        try:
            tree = ast.parse(code, filename=file_path)
            visitor = PythonAstVisitor(code)
            visitor.visit(tree)

            parsed.imports = visitor.imports
            parsed.symbols = visitor.symbols
            parsed.calls = visitor.calls

            # Determine unused imports
            unused = []
            for name in visitor.imported_names:
                # Ignore special conventions like __all__ or dunder
                if name.startswith("_") or name == "*":
                    continue
                if name not in visitor.used_names:
                    unused.append(name)
            parsed.unused_imports = sorted(unused)

        except SyntaxError as e:
            parsed.parse_errors.append(f"SyntaxError at line {e.lineno}: {e.msg}")
        except Exception as e:
            parsed.parse_errors.append(f"Parser error: {str(e)}")

        return parsed
