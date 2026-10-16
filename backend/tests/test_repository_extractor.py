import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from app.parser.extractor import RepositoryExtractor


def test_zip_extraction_rejects_sibling_path_with_shared_prefix():
    # Keep test artifacts inside the writable workspace; the host's default
    # pytest temp directory may be inaccessible in managed environments.
    with TemporaryDirectory(dir=Path.cwd()) as temp_dir:
        tmp_path = Path(temp_dir)
        archive = tmp_path / "malicious.zip"
        target = tmp_path / "extract"
        escaped_file = tmp_path / "extract_evil" / "payload.txt"

        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("../extract_evil/payload.txt", "outside")

        with pytest.raises(ValueError, match="path traversal"):
            RepositoryExtractor().extract_zip(archive, target)

        assert not escaped_file.exists()
