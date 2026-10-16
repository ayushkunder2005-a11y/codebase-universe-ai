export type NodeType = 'directory' | 'file' | 'class' | 'function';
export type EdgeType = 'contains' | 'imports' | 'calls' | 'inherits_from' | 'depends_on';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface NodeMetrics {
  loc: number;
  complexity: number;
  in_degree: number;
  out_degree: number;
  coupling_score: number;
  risk_score: number;
}

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  language?: string;
  parent_id?: string;
  metrics: NodeMetrics;
  position: Position3D;
  metadata: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  line_number?: number;
  metadata: Record<string, any>;
}

export interface CodeGraph {
  project_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    unfiltered_total_nodes?: number;
    density?: number;
  };
}

export interface ProjectStats {
  total_files: number;
  total_directories: number;
  total_lines_of_code: number;
  total_functions: number;
  total_classes: number;
  total_modules: number;
  languages: Record<string, number>;
  average_complexity: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  source_type: 'local_folder' | 'zip_archive' | 'git_repo' | 'sample';
  source_path: string;
  status: 'initialized' | 'indexing' | 'parsing' | 'graph_building' | 'analyzing' | 'ready' | 'failed';
  status_message?: string;
  created_at: string;
  updated_at: string;
  stats: ProjectStats;
}

export type FindingSeverity = 'info' | 'warning' | 'error' | 'critical';
export type FindingCategory = 'circular_dependency' | 'unused_import' | 'high_coupling' | 'high_complexity' | 'god_component' | 'orphan_module' | 'missing_docstring';

export interface AnalysisFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  affected_nodes: string[];
  recommendation?: string;
  evidence_type: string;
}

export interface ComponentRisk {
  node_id: string;
  name: string;
  file_path: string;
  risk_score: number;
  factors: string[];
  blast_radius_size: number;
  complexity: number;
  coupling: number;
}

export interface ImpactAnalysisResult {
  target_node_id: string;
  target_name: string;
  target_type: string;
  file_path?: string;
  direct_dependencies: Array<{ id: string; name: string; type: string; file_path?: string }>;
  direct_dependents: Array<{ id: string; name: string; type: string; file_path?: string }>;
  total_blast_radius: Array<{ id: string; name: string; type: string; file_path?: string }>;
  related_tests: string[];
  suggested_test_commands: string[];
  risk_assessment: string;
  potential_impact_summary: string;
}

export interface AnalysisReport {
  project_id: string;
  generated_at: string;
  overall_health_score: number;
  findings: AnalysisFinding[];
  circular_dependencies: string[][];
  top_risks: ComponentRisk[];
  summary: Record<string, any>;
}

export interface ChatCitation {
  file_path: string;
  line_start?: number;
  line_end?: number;
  snippet?: string;
  entity_name?: string;
  entity_type?: string;
  verified: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: ChatCitation[];
  relevant_nodes?: string[];
}

export interface ChatResponse {
  conversation_id: string;
  reply: string;
  citations: ChatCitation[];
  relevant_nodes: string[];
  evidence_status: 'grounded' | 'hypothetical' | 'insufficient_evidence';
  answer_source?: 'llm' | 'static_fallback' | 'error';
}

export interface RefactorProposal {
  id: string;
  project_id: string;
  file_path: string;
  title: string;
  explanation: string;
  original_code: string;
  proposed_code: string;
  unified_diff: string;
  affected_tests?: string[];
  test_validation_status: 'not_run' | 'passed' | 'failed' | 'skipped';
  test_output?: string;
  created_at?: string;
}

export interface ApplyPatchResult {
  success: boolean;
  message: string;
  applied_file: string;
  git_branch?: string;
  diff_applied: string;
}
