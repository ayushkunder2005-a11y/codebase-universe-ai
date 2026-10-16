import uuid
import difflib
import subprocess
import shutil
from pathlib import Path
from typing import Optional, List
from datetime import datetime

from app.models.project import Project
from app.models.refactor import RefactorRequest, RefactorProposal, ApplyPatchResult
from app.ai.provider import get_llm_provider, HeuristicFallbackProvider
from app.config import settings

REFACTOR_SYSTEM_PROMPT = """You are an expert software refactoring engineer.
When given original source code and an instruction, output ONLY the complete refactored replacement code.
Do not wrap in explanatory conversational text outside the code block.
Preserve public APIs, contracts, and existing comments unless requested otherwise.
"""

class RefactorEngine:
    async def create_proposal(self, project: Project, req: RefactorRequest) -> RefactorProposal:
        proposal_id = str(uuid.uuid4())
        repo_dir = Path(project.source_path).resolve()
        target_file = (repo_dir / req.file_path).resolve()

        if not target_file.exists() or not str(target_file).startswith(str(repo_dir)):
            raise ValueError(f"Target file {req.file_path} not found or outside repository.")

        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            original_code = f.read()

        provider = get_llm_provider()
        if isinstance(provider, HeuristicFallbackProvider):
            raise ValueError("Refactoring requires a configured LLM provider (GEMINI_API_KEY, OPENAI_API_KEY or Ollama).")

        user_prompt = (
            f"File: {req.file_path}\n"
            f"Instruction: {req.instruction}\n\n"
            f"ORIGINAL CODE:\n```\n{original_code}\n```"
        )

        try:
            raw_response = await provider.generate_response(user_prompt, system_prompt=REFACTOR_SYSTEM_PROMPT)
            # Extract code block if wrapped in markdown
            if "```" in raw_response:
                lines = raw_response.splitlines()
                code_lines = []
                inside = False
                for line in lines:
                    if line.startswith("```"):
                        inside = not inside
                        continue
                    if inside:
                        code_lines.append(line)
                proposed_code = "\n".join(code_lines)
            else:
                proposed_code = raw_response
        except Exception as e:
            raise ValueError(f"The AI provider did not return a proposal: {e}")

        if proposed_code.strip() == original_code.strip():
            raise ValueError("The AI provider returned no changes for this instruction.")

        # Generate Unified Diff
        diff_lines = list(difflib.unified_diff(
            original_code.splitlines(keepends=True),
            proposed_code.splitlines(keepends=True),
            fromfile=f"a/{req.file_path}",
            tofile=f"b/{req.file_path}"
        ))
        unified_diff = "".join(diff_lines)

        # Identify affected tests using change impact analysis
        affected_tests: List[str] = []
        try:
            from app.db.storage import storage
            from app.graph.impact import impact_engine
            graph = await storage.get_graph(project.id)
            if graph:
                impact = impact_engine.analyze_impact(graph, f"file:{req.file_path}")
                if impact:
                    affected_tests = impact.related_tests
        except Exception:
            pass

        # Test validation execution if requested in an isolated sandbox
        test_status = "not_run"
        test_output = None

        if req.run_tests and settings.ENABLE_TEST_RUNNER:
            test_status, test_output = self._run_isolated_tests(repo_dir, req.file_path, proposed_code)

        return RefactorProposal(
            id=proposal_id,
            project_id=project.id,
            file_path=req.file_path,
            title=f"Refactor {Path(req.file_path).name}: {req.instruction[:40]}",
            explanation=f"Proposed changes based on instruction: '{req.instruction}'. Review diff before applying.",
            original_code=original_code,
            proposed_code=proposed_code,
            unified_diff=unified_diff,
            affected_tests=affected_tests,
            test_validation_status=test_status,
            test_output=test_output,
            created_at=datetime.utcnow().isoformat()
        )

    def _run_isolated_tests(self, repo_dir: Path, rel_file_path: str, proposed_code: str) -> (str, str):
        """
        Runs available automated tests in an isolated temporary sandbox with the proposed code applied.
        Ensures the user's working copy is completely untouched and test output is real.
        """
        import tempfile
        try:
            with tempfile.TemporaryDirectory(prefix="refactor_sandbox_") as tmp_dir:
                sandbox_path = Path(tmp_dir)

                def ignore_heavy(dir_name, contents):
                    ignored = []
                    for c in contents:
                        if c in [".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache"]:
                            ignored.append(c)
                    return ignored

                shutil.copytree(repo_dir, sandbox_path, dirs_exist_ok=True, ignore=ignore_heavy)

                target_sandbox_file = sandbox_path / rel_file_path
                target_sandbox_file.parent.mkdir(parents=True, exist_ok=True)
                with open(target_sandbox_file, "w", encoding="utf-8") as f:
                    f.write(proposed_code)

                has_py = any(sandbox_path.glob("**/test_*.py")) or (sandbox_path / "pytest.ini").exists()
                has_package_json = (sandbox_path / "package.json").exists()

                if has_py:
                    cmd = ["pytest", "-q"]
                elif has_package_json:
                    cmd = ["npm", "test", "--", "--run"]
                else:
                    return "skipped", "No test suite detected in repository."

                proc = subprocess.run(
                    cmd,
                    cwd=str(sandbox_path),
                    capture_output=True,
                    text=True,
                    timeout=15
                )

                status = "passed" if proc.returncode == 0 else "failed"
                output = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
                return status, output[:2000]

        except subprocess.TimeoutExpired:
            return "failed", "Isolated test execution timed out after 15 seconds."
        except Exception as e:
            return "skipped", f"Isolated test runner unavailable: {str(e)}"

    def apply_proposal(
        self,
        project: Project,
        proposal: RefactorProposal,
        create_branch: bool = True,
        branch_name: Optional[str] = None
    ) -> ApplyPatchResult:
        repo_dir = Path(project.source_path).resolve()
        target_file = (repo_dir / proposal.file_path).resolve()

        if not target_file.exists() or not str(target_file).startswith(str(repo_dir)):
            raise ValueError(f"File {proposal.file_path} is invalid or outside repository.")

        # Refuse to apply a proposal generated against content that has since changed
        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            if f.read() != proposal.original_code:
                raise ValueError(f"{proposal.file_path} changed after this proposal was generated. Generate a new proposal.")

        git_branch = None
        if create_branch:
            git_branch = branch_name or f"refactor/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            try:
                proc = subprocess.run(["git", "checkout", "-b", git_branch], cwd=str(repo_dir), capture_output=True, text=True)
                if proc.returncode != 0:
                    git_branch = None
            except Exception:
                git_branch = None

        # Write proposed code to file
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(proposal.proposed_code)

        return ApplyPatchResult(
            success=True,
            message=f"Successfully applied refactoring to {proposal.file_path}.",
            applied_file=proposal.file_path,
            git_branch=git_branch,
            diff_applied=proposal.unified_diff
        )

refactor_engine = RefactorEngine()
