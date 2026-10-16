import re
from typing import List, Dict, Set, Optional, Any
from app.parser.base import BaseParser, ParsedFile, ParsedImport, ParsedSymbol, ParsedCall

class JsTsParser(BaseParser):
    """
    High-fidelity structural parser for JavaScript and TypeScript files.
    Extracts imports, classes, functions, arrow functions, calls, and LOC.
    """
    IMPORT_REGEX = re.compile(
        r'''(?:import\s+(?:(?P<default>[\w$]+)\s*,?\s*)?(?:\{(?P<named>[^}]+)\})?(?:\*\s+as\s+(?P<namespace>[\w$]+))?\s+from\s+['"](?P<module_from>[^'"]+)['"])|(?:const\s+(?:\{(?P<req_named>[^}]+)\}|(?P<req_default>[\w$]+))\s*=\s*require\(['"](?P<module_req>[^'"]+)['"]\))''',
        re.MULTILINE
    )

    CLASS_REGEX = re.compile(
        r'''(?:export\s+)?(?:default\s+)?class\s+(?P<name>[\w$]+)(?:\s+extends\s+(?P<base>[\w$]+))?\s*\{''',
        re.MULTILINE
    )

    FUNC_REGEX = re.compile(
        r'''(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(?P<name>[\w$]+)\s*\((?P<params>[^)]*)\)''',
        re.MULTILINE
    )

    ARROW_FUNC_REGEX = re.compile(
        r'''(?:export\s+)?(?:const|let|var)\s+(?P<name>[\w$]+)\s*=\s*(?:async\s*)?\((?P<params>[^)]*)\)\s*(?::\s*[^=>]+)?\s*=>''',
        re.MULTILINE
    )

    CALL_REGEX = re.compile(
        r'''\b(?P<name>[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(''',
        re.MULTILINE
    )

    KEYWORDS_EXCLUDE_CALLS = {
        "if", "for", "while", "switch", "catch", "function", "return", "import", "require", "typeof", "super"
    }

    def parse_code(self, code: str, file_path: str, relative_path: str) -> ParsedFile:
        lines = code.splitlines()
        loc = len(lines)
        blank_lines = sum(1 for line in lines if not line.strip())
        comment_lines = sum(1 for line in lines if line.strip().startswith("//") or line.strip().startswith("/*") or line.strip().startswith("*"))

        is_ts = relative_path.endswith((".ts", ".tsx"))
        lang = "typescript" if is_ts else "javascript"

        parsed = ParsedFile(
            file_path=file_path,
            relative_path=relative_path,
            language=lang,
            loc=loc,
            blank_lines=blank_lines,
            comment_lines=comment_lines
        )

        try:
            # 1. Imports
            for match in self.IMPORT_REGEX.finditer(code):
                module = match.group("module_from") or match.group("module_req")
                if not module:
                    continue

                names = []
                if match.group("default"):
                    names.append(match.group("default").strip())
                if match.group("namespace"):
                    names.append(match.group("namespace").strip())
                if match.group("named"):
                    for n in match.group("named").split(","):
                        clean_n = n.strip().split(" as ")[0].strip()
                        if clean_n:
                            names.append(clean_n)
                if match.group("req_default"):
                    names.append(match.group("req_default").strip())
                if match.group("req_named"):
                    for n in match.group("req_named").split(","):
                        clean_n = n.strip().split(":")[0].strip()
                        if clean_n:
                            names.append(clean_n)

                line_num = code[:match.start()].count("\n") + 1
                parsed.imports.append(ParsedImport(
                    module=module,
                    names=names,
                    line_number=line_num,
                    is_from=bool(match.group("module_from"))
                ))

            # 2. Classes
            for match in self.CLASS_REGEX.finditer(code):
                cname = match.group("name")
                base = match.group("base")
                line_start = code[:match.start()].count("\n") + 1
                line_end = self._estimate_block_end(code, match.end() - 1, line_start)

                parsed.symbols.append(ParsedSymbol(
                    name=cname,
                    kind="class",
                    line_start=line_start,
                    line_end=line_end,
                    complexity=1,
                    metadata={"base": base} if base else {}
                ))

            # 3. Functions
            for match in self.FUNC_REGEX.finditer(code):
                fname = match.group("name")
                params = [p.strip().split(":")[0].strip() for p in match.group("params").split(",") if p.strip()]
                line_start = code[:match.start()].count("\n") + 1
                line_end = self._estimate_block_end(code, match.end(), line_start)

                # Heuristic complexity based on keywords in body
                func_body = code[match.start():self._find_block_close_char_index(code, match.end())]
                complexity = 1 + len(re.findall(r'\b(if|else\s+if|for|while|case|catch|\?\?|\&\&|\|\|)\b', func_body))

                parsed.symbols.append(ParsedSymbol(
                    name=fname,
                    kind="function",
                    line_start=line_start,
                    line_end=line_end,
                    parameters=params,
                    complexity=complexity
                ))

            # 4. Arrow Functions
            for match in self.ARROW_FUNC_REGEX.finditer(code):
                fname = match.group("name")
                params = [p.strip().split(":")[0].strip() for p in match.group("params").split(",") if p.strip()]
                line_start = code[:match.start()].count("\n") + 1
                line_end = self._estimate_block_end(code, match.end(), line_start)

                func_body = code[match.start():self._find_block_close_char_index(code, match.end())]
                complexity = 1 + len(re.findall(r'\b(if|else\s+if|for|while|case|catch|\?\?|\&\&|\|\|)\b', func_body))

                parsed.symbols.append(ParsedSymbol(
                    name=fname,
                    kind="function",
                    line_start=line_start,
                    line_end=line_end,
                    parameters=params,
                    complexity=complexity
                ))

            # 5. Calls
            for match in self.CALL_REGEX.finditer(code):
                cname = match.group("name")
                if cname not in self.KEYWORDS_EXCLUDE_CALLS:
                    line_num = code[:match.start()].count("\n") + 1
                    parsed.calls.append(ParsedCall(
                        name=cname,
                        line_number=line_num
                    ))

        except Exception as e:
            parsed.parse_errors.append(f"JS/TS parsing error: {str(e)}")

        return parsed

    def _find_block_close_char_index(self, code: str, start_index: int) -> int:
        open_bracket = code.find("{", start_index)
        if open_bracket == -1 or open_bracket > start_index + 100:
            semi = code.find(";", start_index)
            newline = code.find("\n", start_index)
            return min(x for x in [semi, newline, len(code)] if x != -1)
        
        depth = 0
        for i in range(open_bracket, len(code)):
            if code[i] == '{':
                depth += 1
            elif code[i] == '}':
                depth -= 1
                if depth == 0:
                    return i + 1
        return len(code)

    def _estimate_block_end(self, code: str, start_index: int, line_start: int) -> int:
        close_idx = self._find_block_close_char_index(code, start_index)
        return max(line_start, code[:close_idx].count("\n") + 1)
