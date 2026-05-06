import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { useThreadStore, type Thread } from '@/stores/threadStore';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string;
  icon: string;
  pinned: boolean;
  archived: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ProjectState {
  projects: Project[];
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  createProject: (userId: string, input: { name: string; description?: string; instructions?: string }) => Promise<Project>;
  updateProject: (projectId: string, patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'pinned' | 'archived'>>) => Promise<void>;
  archiveProject: (projectId: string) => Promise<void>;
  createProjectThread: (userId: string, projectId: string, agentId?: string) => Promise<string>;
  assignThread: (threadId: string, projectId: string | null) => Promise<void>;
}

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function threadsForProject(threads: Thread[], projectId: string): Thread[] {
  return threads
    .filter((thread) => thread.project_id === projectId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) {
      set({ projects: [], loading: false, error: error.message });
      return;
    }

    set({ projects: sortProjects((data || []) as Project[]), loading: false, error: null });
  },

  createProject: async (userId, input) => {
    const name = input.name.trim();
    if (!name) throw new Error('Project name is required');

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name,
        description: input.description?.trim() || null,
        instructions: input.instructions?.trim() || null,
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to create project');
    const project = data as Project;
    set((state) => ({ projects: sortProjects([project, ...state.projects]) }));
    return project;
  },

  updateProject: async (projectId, patch) => {
    const cleanPatch: Record<string, unknown> = {};
    if ('name' in patch) cleanPatch.name = patch.name?.trim();
    if ('description' in patch) cleanPatch.description = patch.description?.trim() || null;
    if ('instructions' in patch) cleanPatch.instructions = patch.instructions?.trim() || null;
    if ('pinned' in patch) cleanPatch.pinned = patch.pinned;
    if ('archived' in patch) cleanPatch.archived = patch.archived;

    const { data, error } = await supabase
      .from('projects')
      .update(cleanPatch)
      .eq('id', projectId)
      .select()
      .single();

    if (error || !data) throw new Error(error?.message || 'Failed to update project');
    const project = data as Project;
    set((state) => ({
      projects: sortProjects(state.projects.map((item) => (item.id === projectId ? project : item))),
    }));
  },

  archiveProject: async (projectId) => {
    await get().updateProject(projectId, { archived: true });
    set((state) => ({ projects: state.projects.filter((item) => item.id !== projectId) }));
  },

  createProjectThread: async (userId, projectId, agentId = 'luca') => {
    return await useThreadStore.getState().createThread(userId, agentId, projectId);
  },

  assignThread: async (threadId, projectId) => {
    await useThreadStore.getState().updateThreadProject(threadId, projectId);
  },
}));
