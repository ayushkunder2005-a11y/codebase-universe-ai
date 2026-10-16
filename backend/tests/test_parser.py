from app.parser.python_parser import PythonParser
from app.parser.js_ts_parser import JsTsParser

def test_python_parser_extracts_symbols_and_complexity():
    code = """
import os
import unused_pkg

class AuthService:
    def verify(self, token: str) -> bool:
        if token == "admin":
            return True
        elif len(token) > 5:
            return True
        return False

def standalone_helper():
    return os.getenv("ENV")
"""
    parser = PythonParser()
    parsed = parser.parse_code(code, "auth.py", "auth.py")

    assert parsed.language == "python"
    assert parsed.loc > 10

    # Symbols
    sym_names = {s.name for s in parsed.symbols}
    assert "AuthService" in sym_names
    assert "verify" in sym_names
    assert "standalone_helper" in sym_names

    # Complexity: verify function has 3 paths (base 1 + if + elif) = 3
    verify_sym = next(s for s in parsed.symbols if s.name == "verify")
    assert verify_sym.complexity >= 3

    # Unused imports: unused_pkg should be flagged, os should not be flagged
    assert "unused_pkg" in parsed.unused_imports
    assert "os" not in parsed.unused_imports

def test_js_ts_parser_extracts_elements():
    code = """
import { MetricRecord } from './types';
import axios from 'axios';

export class DataCollector {
  public collect(): void {
    fetchData();
  }
}

export const processMetrics = (a, b) => {
  if (a > 10) {
    return a + b;
  }
  return b;
};
"""
    parser = JsTsParser()
    parsed = parser.parse_code(code, "src/collector.ts", "src/collector.ts")

    assert parsed.language == "typescript"
    
    # Imports
    mod_names = {imp.module for imp in parsed.imports}
    assert "./types" in mod_names
    assert "axios" in mod_names

    # Symbols
    sym_names = {s.name for s in parsed.symbols}
    assert "DataCollector" in sym_names
    assert "processMetrics" in sym_names

    # Calls
    call_names = {c.name for c in parsed.calls}
    assert "fetchData" in call_names
