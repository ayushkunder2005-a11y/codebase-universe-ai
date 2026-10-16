from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ParsedCall(BaseModel):
    name: str
    line_number: int
    caller_symbol: Optional[str] = None

class ParsedImport(BaseModel):
    module: str
    names: List[str] = Field(default_factory=list)
    alias: Optional[str] = None
    line_number: int = 1
    is_from: bool = False

class ParsedSymbol(BaseModel):
    name: str
    kind: str  # "function" | "async_function" | "class" | "method"
    line_start: int
    line_end: int
    parent_symbol: Optional[str] = None
    docstring: Optional[str] = None
    parameters: List[str] = Field(default_factory=list)
    return_type: Optional[str] = None
    complexity: int = 1
    calls: List[str] = Field(default_factory=list)  # names of called functions
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ParsedFile(BaseModel):
    file_path: str
    relative_path: str
    language: str
    loc: int = 0
    blank_lines: int = 0
    comment_lines: int = 0
    imports: List[ParsedImport] = Field(default_factory=list)
    symbols: List[ParsedSymbol] = Field(default_factory=list)
    calls: List[ParsedCall] = Field(default_factory=list)
    unused_imports: List[str] = Field(default_factory=list)
    parse_errors: List[str] = Field(default_factory=list)

class BaseParser:
    def parse_code(self, code: str, file_path: str, relative_path: str) -> ParsedFile:
        raise NotImplementedError
