from app.parser.python_parser import PythonParser


def test_nested_function_calls_and_complexity_belong_to_their_own_symbol():
    source = """\
def outer(flag):
    if flag:
        work()

    def inner():
        if flag and ready:
            nested_work()
"""

    parsed = PythonParser().parse_code(source, "example.py", "example.py")

    assert parsed.parse_errors == []
    outer, inner = parsed.symbols
    assert outer.name == "outer"
    assert outer.complexity == 2
    assert outer.calls == ["work"]
    assert inner.name == "inner"
    assert inner.complexity == 3
    assert inner.calls == ["nested_work"]


def test_syntax_errors_are_reported_without_raising():
    parsed = PythonParser().parse_code("def broken(:\n", "broken.py", "broken.py")

    assert parsed.symbols == []
    assert parsed.parse_errors
    assert "SyntaxError at line 1" in parsed.parse_errors[0]


def test_empty_file_is_a_valid_empty_parse():
    parsed = PythonParser().parse_code("", "empty.py", "empty.py")

    assert parsed.parse_errors == []
    assert parsed.symbols == []
    assert parsed.imports == []
