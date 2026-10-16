import math
from typing import List, Dict, Optional, Tuple, Set
import networkx as nx

from app.parser.base import ParsedFile, ParsedSymbol
from app.models.graph import (
    CodeGraph, GraphNode, GraphEdge, NodeType, EdgeType, NodeMetrics, Position3D
)

class GraphBuilder:
    def build(self, project_id: str, parsed_files: List[ParsedFile]) -> CodeGraph:
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []
        node_id_set: Set[str] = set()

        # Build symbol lookup map: symbol_name -> list of (file_path, symbol)
        symbol_map: Dict[str, List[Tuple[str, ParsedSymbol]]] = {}
        # File path lookup: module_path / relative_path -> file_node_id
        file_lookup: Dict[str, str] = {}
        # Directory set
        directories: Set[str] = set()

        # Step 1: Pre-populate lookups
        for pf in parsed_files:
            file_node_id = f"file:{pf.relative_path}"
            file_lookup[pf.relative_path] = file_node_id

            # module path variants (e.g. app.models.user or models.user)
            no_ext = pf.relative_path.rsplit(".", 1)[0].replace("/", ".")
            file_lookup[no_ext] = file_node_id
            parts = no_ext.split(".")
            for i in range(len(parts)):
                sub_mod = ".".join(parts[i:])
                file_lookup[sub_mod] = file_node_id

            # Track directories
            dir_part = pf.relative_path.rsplit("/", 1)[0] if "/" in pf.relative_path else ""
            if dir_part:
                curr = ""
                for part in dir_part.split("/"):
                    curr = f"{curr}/{part}" if curr else part
                    directories.add(curr)

            for sym in pf.symbols:
                if sym.name not in symbol_map:
                    symbol_map[sym.name] = []
                symbol_map[sym.name].append((pf.relative_path, sym))

        # Step 2: Create Directory Nodes
        for d in sorted(directories):
            dir_node_id = f"dir:{d}"
            parent_dir = d.rsplit("/", 1)[0] if "/" in d else None
            parent_id = f"dir:{parent_dir}" if parent_dir else None

            node = GraphNode(
                id=dir_node_id,
                name=d.split("/")[-1],
                type=NodeType.DIRECTORY,
                file_path=d,
                parent_id=parent_id,
                metadata={"full_directory": d}
            )
            nodes.append(node)
            node_id_set.add(dir_node_id)

            if parent_id and parent_id in node_id_set:
                edges.append(GraphEdge(
                    id=f"{parent_id}->{dir_node_id}:contains",
                    source=parent_id,
                    target=dir_node_id,
                    type=EdgeType.CONTAINS,
                    weight=0.5
                ))

        # Step 3: Create File Nodes and Symbol Nodes
        for pf in parsed_files:
            file_node_id = f"file:{pf.relative_path}"
            dir_part = pf.relative_path.rsplit("/", 1)[0] if "/" in pf.relative_path else ""
            parent_dir_id = f"dir:{dir_part}" if dir_part else None

            file_node = GraphNode(
                id=file_node_id,
                name=pf.relative_path.split("/")[-1],
                type=NodeType.FILE,
                file_path=pf.relative_path,
                language=pf.language,
                parent_id=parent_dir_id,
                metrics=NodeMetrics(loc=pf.loc),
                metadata={
                    "loc": pf.loc,
                    "blank_lines": pf.blank_lines,
                    "comment_lines": pf.comment_lines,
                    "unused_imports": pf.unused_imports,
                    "parse_errors": pf.parse_errors
                }
            )
            nodes.append(file_node)
            node_id_set.add(file_node_id)

            if parent_dir_id and parent_dir_id in node_id_set:
                edges.append(GraphEdge(
                    id=f"{parent_dir_id}->{file_node_id}:contains",
                    source=parent_dir_id,
                    target=file_node_id,
                    type=EdgeType.CONTAINS,
                    weight=0.7
                ))

            # Symbols (Classes & Functions)
            for sym in pf.symbols:
                sym_type = NodeType.CLASS if sym.kind == "class" else NodeType.FUNCTION
                sym_id = f"{sym.kind}:{pf.relative_path}:{sym.name}"
                parent_id = f"class:{pf.relative_path}:{sym.parent_symbol}" if sym.parent_symbol else file_node_id

                sym_node = GraphNode(
                    id=sym_id,
                    name=sym.name,
                    type=sym_type,
                    file_path=pf.relative_path,
                    line_start=sym.line_start,
                    line_end=sym.line_end,
                    language=pf.language,
                    parent_id=parent_id,
                    metrics=NodeMetrics(
                        loc=max(1, sym.line_end - sym.line_start + 1),
                        complexity=sym.complexity
                    ),
                    metadata={
                        "kind": sym.kind,
                        "parameters": sym.parameters,
                        "return_type": sym.return_type,
                        "docstring": sym.docstring,
                        "decorators": sym.metadata.get("decorators", []),
                        "bases": sym.metadata.get("bases", [])
                    }
                )
                nodes.append(sym_node)
                node_id_set.add(sym_id)

                edges.append(GraphEdge(
                    id=f"{parent_id}->{sym_id}:contains",
                    source=parent_id,
                    target=sym_id,
                    type=EdgeType.CONTAINS,
                    weight=0.6
                ))

                # Inheritance edges
                if sym.kind == "class":
                    for base in sym.metadata.get("bases", []):
                        if base in symbol_map:
                            target_match = symbol_map[base][0]
                            target_sym_id = f"class:{target_match[0]}:{base}"
                            if target_sym_id in node_id_set:
                                edges.append(GraphEdge(
                                    id=f"{sym_id}->{target_sym_id}:inherits",
                                    source=sym_id,
                                    target=target_sym_id,
                                    type=EdgeType.INHERITS_FROM,
                                    weight=1.5
                                ))

        # Step 4: Resolve Import and Call Edges
        for pf in parsed_files:
            file_node_id = f"file:{pf.relative_path}"

            # Import edges
            for imp in pf.imports:
                target_file_id = None
                clean_mod = imp.module.lstrip(".")
                if clean_mod in file_lookup:
                    target_file_id = file_lookup[clean_mod]
                elif imp.module.startswith("."):
                    base_dir = pf.relative_path.rsplit("/", 1)[0] if "/" in pf.relative_path else ""
                    rel_target = f"{base_dir}/{clean_mod}".replace("//", "/").strip("/")
                    if rel_target in file_lookup:
                        target_file_id = file_lookup[rel_target]

                if target_file_id and target_file_id != file_node_id and target_file_id in node_id_set:
                    edge_id = f"{file_node_id}->{target_file_id}:imports"
                    edges.append(GraphEdge(
                        id=edge_id,
                        source=file_node_id,
                        target=target_file_id,
                        type=EdgeType.IMPORTS,
                        line_number=imp.line_number,
                        weight=1.0,
                        metadata={"module": imp.module, "names": imp.names, "resolution": "import_path"}
                    ))

            # Call edges with scope-qualified caller mapping
            caller_lookup = {
                (f"{s.parent_symbol}.{s.name}" if s.parent_symbol else s.name): f"{s.kind}:{pf.relative_path}:{s.name}"
                for s in pf.symbols
            }
            for call in pf.calls:
                caller_id = caller_lookup.get(call.caller_symbol, file_node_id) if call.caller_symbol else file_node_id
                if call.name in symbol_map:
                    candidates = symbol_map[call.name]
                    target_file, target_sym = candidates[0]
                    target_id = f"{target_sym.kind}:{target_file}:{call.name}"

                    if caller_id in node_id_set and target_id in node_id_set and caller_id != target_id:
                        edges.append(GraphEdge(
                            id=f"{caller_id}->{target_id}:calls:{call.line_number}",
                            source=caller_id,
                            target=target_id,
                            type=EdgeType.CALLS,
                            line_number=call.line_number,
                            weight=1.2,
                            metadata={
                                "resolution": "unique_name" if len(candidates) == 1 else "ambiguous_name",
                                "candidate_count": len(candidates)
                            }
                        ))

        # Step 5: Compute Network Metrics (Degree, Coupling, Risk) via NetworkX
        nx_graph = nx.DiGraph()
        for n in nodes:
            nx_graph.add_node(n.id)
        for e in edges:
            nx_graph.add_edge(e.source, e.target, type=e.type.value)

        in_degrees = dict(nx_graph.in_degree())
        out_degrees = dict(nx_graph.out_degree())

        for node in nodes:
            node.metrics.in_degree = in_degrees.get(node.id, 0)
            node.metrics.out_degree = out_degrees.get(node.id, 0)
            
            coupling = float(node.metrics.in_degree + node.metrics.out_degree)
            node.metrics.coupling_score = round(coupling, 2)

            loc_factor = min(30.0, (node.metrics.loc / 100.0) * 10.0)
            comp_factor = min(40.0, (node.metrics.complexity - 1) * 4.0)
            coupling_factor = min(30.0, coupling * 2.0)
            raw_risk = loc_factor + comp_factor + coupling_factor
            node.metrics.risk_score = round(min(100.0, raw_risk), 1)

        # Step 6: 3D Cosmic Celestial Coordinates
        self._calculate_cosmic_positions(nodes)

        return CodeGraph(
            project_id=project_id,
            nodes=nodes,
            edges=edges,
            stats={
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "density": round(nx.density(nx_graph), 4) if len(nodes) > 1 else 0
            }
        )

    def _calculate_cosmic_positions(self, nodes: List[GraphNode]):
        dir_nodes = [n for n in nodes if n.type == NodeType.DIRECTORY]
        file_nodes = [n for n in nodes if n.type == NodeType.FILE]
        symbol_nodes = [n for n in nodes if n.type in (NodeType.CLASS, NodeType.FUNCTION)]

        # 1. Distribute Directories as Galaxy Cores / Sectors
        dir_pos_map: Dict[str, Tuple[float, float, float]] = {}
        golden_angle = 2.39996323  # radians
        galaxy_radius_scale = 160.0

        for idx, d in enumerate(dir_nodes):
            if idx == 0 and len(dir_nodes) == 1:
                x, y, z = 0.0, 0.0, 0.0
            else:
                r = 100.0 + math.sqrt(idx + 1) * galaxy_radius_scale
                theta = idx * golden_angle
                x = r * math.cos(theta)
                z = r * math.sin(theta)
                y = math.sin(idx * 1.5) * 30.0
            d.position = Position3D(x=round(x, 2), y=round(y, 2), z=round(z, 2))
            dir_pos_map[d.id] = (x, y, z)

        # 2. Distribute Files per Directory in Generous Orbital Shells
        files_by_dir: Dict[str, List[GraphNode]] = {}
        for f in file_nodes:
            parent = f.parent_id or "root"
            files_by_dir.setdefault(parent, []).append(f)

        file_pos_map: Dict[str, Tuple[float, float, float]] = {}
        for parent_id, files in files_by_dir.items():
            center = dir_pos_map.get(parent_id, (0.0, 0.0, 0.0))
            count = len(files)
            for idx, f in enumerate(files):
                # Multi-shell distribution around directory
                shell = idx // 6
                pos_in_shell = idx % 6
                shell_capacity = min(6 + shell * 4, max(1, count - shell * 6))
                ring_r = 75.0 + shell * 60.0
                phi = (pos_in_shell * 2 * math.pi / max(1, shell_capacity)) + (shell * 0.52)

                fx = center[0] + ring_r * math.cos(phi)
                fz = center[2] + ring_r * math.sin(phi)
                fy = center[1] + math.sin(idx * 1.7) * 20.0

                f.position = Position3D(x=round(fx, 2), y=round(fy, 2), z=round(fz, 2))
                file_pos_map[f.id] = (fx, fy, fz)

        # 3. Distribute Symbols (Classes & Functions) per File with Anti-Collision Planetary Shells
        symbols_by_file: Dict[str, List[GraphNode]] = {}
        for s in symbol_nodes:
            parent = s.parent_id or "unknown"
            symbols_by_file.setdefault(parent, []).append(s)

        for parent_id, symbols in symbols_by_file.items():
            center = file_pos_map.get(parent_id, (0.0, 0.0, 0.0))
            classes = [s for s in symbols if s.type == NodeType.CLASS]
            funcs = [s for s in symbols if s.type == NodeType.FUNCTION]

            # Place classes on inner orbit
            for c_idx, c in enumerate(classes):
                c_capacity = max(1, len(classes))
                orbit_r = 38.0
                theta = (c_idx * 2 * math.pi / c_capacity)
                cx = center[0] + orbit_r * math.cos(theta)
                cz = center[2] + orbit_r * math.sin(theta)
                cy = center[1] + ((c_idx % 2) * 2 - 1) * 6.0
                c.position = Position3D(x=round(cx, 2), y=round(cy, 2), z=round(cz, 2))

            # Place functions on expanding planetary shells
            start_radius = 52.0 if classes else 36.0
            shell_capacities = [6, 10, 14, 18, 22]

            f_placed = 0
            curr_shell = 0
            while f_placed < len(funcs):
                cap = shell_capacities[min(curr_shell, len(shell_capacities) - 1)]
                funcs_in_shell = funcs[f_placed:f_placed + cap]
                orbit_r = start_radius + curr_shell * 26.0

                for s_idx, fn in enumerate(funcs_in_shell):
                    phi = (s_idx * 2 * math.pi / max(1, len(funcs_in_shell))) + (curr_shell * 0.45)
                    sx = center[0] + orbit_r * math.cos(phi)
                    sz = center[2] + orbit_r * math.sin(phi)
                    sy = center[1] + ((s_idx % 3) - 1) * 7.0
                    fn.position = Position3D(x=round(sx, 2), y=round(sy, 2), z=round(sz, 2))

                f_placed += len(funcs_in_shell)
                curr_shell += 1

graph_builder = GraphBuilder()
