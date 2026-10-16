import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

from app.models.graph import CodeGraph, GraphNode, NodeType
from app.models.chat import ChatCitation, ChatResponse
from app.ai.provider import get_llm_provider, HeuristicFallbackProvider

SYSTEM_PROMPT = """You are Codebase Universe AI, an elite Staff Principal Software Architect and Systems Intelligence Engine.
You deliver high-density, executive-level technical analysis tailored for senior IT professionals, engineering leads, and technical teams.

COMMUNICATION RULES FOR IT PROFESSIONALS:
1. ZERO FILLER: Do not output conversational pleasantries (e.g. no "Sure", "Certainly", "Here is"). Start directly with the technical analysis.
2. NO LONG ESSAYS OR WALLS OF TEXT: Developers and tech teams do not read paragraphs. Use concise, high-contrast bullet points and bold technical terms.
3. GROUNDED CITATIONS: Always cite verified file paths and line ranges in format `[path:lines]`.
4. STRUCTURE YOUR ANSWER AS FOLLOWS:
   • 📌 **Architecture Verdict**: 1-2 sentence executive summary of the component or design pattern.
   • ⚙️ **Technical Implementation**: Bulleted analysis of interfaces, signatures, algorithms, or call flows.
   • ⚠️ **Risk & Engineering Impact**: Blast radius, coupling risks, and concrete recommendations for the engineering team.
5. If context is insufficient, explicitly state: "⚠️ **Insufficient Context**: [brief reason]" without hallucinating.
"""

class CodebaseRAG:
    def retrieve_context(
        self,
        query: str,
        graph: CodeGraph,
        repo_dir: Path,
        focused_node_id: Optional[str] = None
    ) -> Tuple[str, List[ChatCitation], List[str]]:
        citations: List[ChatCitation] = []
        relevant_node_ids: List[str] = []
        context_snippets: List[str] = []

        query_terms = set(re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', query.lower()))
        matched_nodes: List[Tuple[int, GraphNode]] = []

        for node in graph.nodes:
            score = 0
            # If focused, boost score
            if focused_node_id and (node.id == focused_node_id or node.parent_id == focused_node_id):
                score += 50

            node_name_lower = node.name.lower()
            if node_name_lower in query_terms:
                score += 25
            for term in query_terms:
                if len(term) >= 3 and term in node_name_lower:
                    score += 10
                if node.file_path and term in node.file_path.lower():
                    score += 5

            if score > 0:
                matched_nodes.append((score, node))

        # Sort by relevance and take top 6 nodes
        matched_nodes.sort(key=lambda x: x[0], reverse=True)
        top_nodes = [item[1] for item in matched_nodes[:6]]

        # If no direct matches, include 2 core files
        if not top_nodes:
            top_nodes = [n for n in graph.nodes if n.type == NodeType.FILE][:3]

        for node in top_nodes:
            relevant_node_ids.append(node.id)
            if not node.file_path:
                continue

            full_path = (repo_dir / node.file_path).resolve()
            if not full_path.exists() or not full_path.is_file():
                continue

            try:
                with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()

                start = max(1, node.line_start or 1)
                end = min(len(lines), node.line_end or min(100, len(lines)))
                snippet_text = "".join(lines[start - 1:end])

                citations.append(ChatCitation(
                    file_path=node.file_path,
                    line_start=start,
                    line_end=end,
                    snippet=snippet_text[:350] + ("..." if len(snippet_text) > 350 else ""),
                    entity_name=node.name,
                    entity_type=node.type.value,
                    verified=True
                ))

                context_snippets.append(
                    f"--- File: {node.file_path} (Lines {start}-{end}) Symbol: {node.name} ({node.type.value}) ---\n"
                    f"{snippet_text}\n"
                )
            except Exception:
                pass

        formatted_context = "\n".join(context_snippets)
        return formatted_context, citations, relevant_node_ids

    async def answer_query(
        self,
        query: str,
        graph: CodeGraph,
        repo_dir: Path,
        conversation_id: str,
        focused_node_id: Optional[str] = None
    ) -> ChatResponse:
        context_str, citations, relevant_nodes = self.retrieve_context(
            query=query,
            graph=graph,
            repo_dir=repo_dir,
            focused_node_id=focused_node_id
        )

        user_prompt = (
            f"USER QUESTION: {query}\n\n"
            f"RELEVANT CODEBASE CONTEXT:\n{context_str}\n\n"
            "Please answer the user question using only the verified code context above. "
            "Cite exact files and lines for all claims."
        )

        provider = get_llm_provider()
        is_fallback = isinstance(provider, HeuristicFallbackProvider)
        try:
            reply = await provider.generate_response(user_prompt, system_prompt=SYSTEM_PROMPT)
            evidence_status = "insufficient_evidence" if is_fallback or not citations else "grounded"
            answer_source = "static_fallback" if is_fallback else "llm"
        except Exception as e:
            reply = f"Error communicating with AI Provider ({str(e)}). The retrieved source context is listed below."
            evidence_status = "insufficient_evidence"
            answer_source = "error"

        return ChatResponse(
            conversation_id=conversation_id,
            reply=reply,
            citations=citations,
            relevant_nodes=relevant_nodes,
            evidence_status=evidence_status,
            answer_source=answer_source
        )

codebase_rag = CodebaseRAG()
