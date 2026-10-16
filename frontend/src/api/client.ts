import {
  Project,
  CodeGraph,
  AnalysisReport,
  ImpactAnalysisResult,
  ChatResponse,
  ChatMessage,
  RefactorProposal,
  ApplyPatchResult
} from '../types';

const BASE_URL = '';

export const api = {
  async getHealth() {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${BASE_URL}/api/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${BASE_URL}/api/projects/${id}`);
    if (!res.ok) throw new Error('Project not found');
    return res.json();
  },

  async createProject(name: string, localPath: string): Promise<Project> {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        source_type: 'local_folder',
        local_path: localPath
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create project' }));
      throw new Error(err.detail || 'Failed to create project');
    }
    return res.json();
  },

  async uploadProjectZip(file: File, name?: string): Promise<Project> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);

    const res = await fetch(`${BASE_URL}/api/projects/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  async loadSample(type: 'python' | 'typescript'): Promise<Project> {
    const res = await fetch(`${BASE_URL}/api/projects/samples/${type}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to load sample');
    return res.json();
  },

  async reindexProject(id: string): Promise<Project> {
    const res = await fetch(`${BASE_URL}/api/projects/${id}/reindex`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to reindex project');
    return res.json();
  },

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/projects/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete project');
  },

  async getGraph(
    projectId: string,
    params?: { node_types?: string; languages?: string; search?: string; max_nodes?: number }
  ): Promise<CodeGraph> {
    const url = new URL(`${BASE_URL}/api/projects/${projectId}/graph`, window.location.origin);
    if (params?.node_types) url.searchParams.set('node_types', params.node_types);
    if (params?.languages) url.searchParams.set('languages', params.languages);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.max_nodes) url.searchParams.set('max_nodes', params.max_nodes.toString());

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch code graph');
    return res.json();
  },

  async getNodeDetails(projectId: string, nodeId: string) {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/graph/nodes/${encodeURIComponent(nodeId)}`);
    if (!res.ok) throw new Error('Failed to fetch node details');
    return res.json();
  },

  async getAnalysis(projectId: string): Promise<AnalysisReport> {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/analysis`);
    if (!res.ok) throw new Error('Failed to fetch analysis report');
    return res.json();
  },

  async getImpactAnalysis(projectId: string, targetNodeId: string): Promise<ImpactAnalysisResult> {
    const url = new URL(`${BASE_URL}/api/projects/${projectId}/impact`, window.location.origin);
    url.searchParams.set('target_node_id', targetNodeId);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to analyze impact');
    return res.json();
  },

  async sendChatMessage(
    projectId: string,
    message: string,
    conversationId?: string,
    focusedNodeId?: string
  ): Promise<ChatResponse> {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        message,
        conversation_id: conversationId,
        focused_node_id: focusedNodeId
      })
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  },

  async getConversation(projectId: string, conversationId: string): Promise<ChatMessage[]> {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/conversations/${conversationId}`);
    if (!res.ok) throw new Error('Failed to get conversation history');
    return res.json();
  },

  async proposeRefactor(
    projectId: string,
    filePath: string,
    instruction: string,
    runTests: boolean = false
  ): Promise<RefactorProposal> {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/refactor/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        file_path: filePath,
        instruction,
        run_tests: runTests
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to propose refactoring' }));
      throw new Error(err.detail || 'Failed to propose refactoring');
    }
    return res.json();
  },

  async applyRefactorPatch(
    projectId: string,
    proposalId: string,
    createBranch: boolean = true
  ): Promise<ApplyPatchResult> {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/refactor/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal_id: proposalId,
        create_git_branch: createBranch
      })
    });
    if (!res.ok) throw new Error('Failed to apply patch');
    return res.json();
  },

  async getFileContent(projectId: string, path: string): Promise<{ file_path: string; language: string; total_lines: number; content: string }> {
    const url = new URL(`${BASE_URL}/api/projects/${projectId}/files/content`, window.location.origin);
    url.searchParams.set('path', path);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch file content');
    return res.json();
  }
};
