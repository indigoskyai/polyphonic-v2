export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          agent_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      agent_config: {
        Row: {
          agent_name: string
          created_at: string
          default_model: string
          id: string
          personality: Json | null
          system_prompt: string | null
          updated_at: string
          user_id: string
          voice: string | null
        }
        Insert: {
          agent_name?: string
          created_at?: string
          default_model?: string
          id?: string
          personality?: Json | null
          system_prompt?: string | null
          updated_at?: string
          user_id: string
          voice?: string | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          default_model?: string
          id?: string
          personality?: Json | null
          system_prompt?: string | null
          updated_at?: string
          user_id?: string
          voice?: string | null
        }
        Relationships: []
      }
      agent_configs: {
        Row: {
          avatar_color: string | null
          created_at: string
          created_by: string
          elevenlabs_agent_id: string | null
          env: string
          id: string
          is_system: boolean
          locked: boolean
          model: string | null
          name: string
          openclaw_agent_id: string | null
          pending: boolean
          personality: Json
          preferred_device_id: string | null
          prompt: string | null
          role: string
          subagents: Json
          tools: Json
          updated_at: string
          user_id: string
          voices: Json
        }
        Insert: {
          avatar_color?: string | null
          created_at?: string
          created_by?: string
          elevenlabs_agent_id?: string | null
          env?: string
          id: string
          is_system?: boolean
          locked?: boolean
          model?: string | null
          name: string
          openclaw_agent_id?: string | null
          pending?: boolean
          personality?: Json
          preferred_device_id?: string | null
          prompt?: string | null
          role: string
          subagents?: Json
          tools?: Json
          updated_at?: string
          user_id: string
          voices?: Json
        }
        Update: {
          avatar_color?: string | null
          created_at?: string
          created_by?: string
          elevenlabs_agent_id?: string | null
          env?: string
          id?: string
          is_system?: boolean
          locked?: boolean
          model?: string | null
          name?: string
          openclaw_agent_id?: string | null
          pending?: boolean
          personality?: Json
          preferred_device_id?: string | null
          prompt?: string | null
          role?: string
          subagents?: Json
          tools?: Json
          updated_at?: string
          user_id?: string
          voices?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_openclaw_agent_id_fkey"
            columns: ["openclaw_agent_id"]
            isOneToOne: false
            referencedRelation: "openclaw_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_configs_preferred_device_id_fkey"
            columns: ["preferred_device_id"]
            isOneToOne: false
            referencedRelation: "openclaw_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_consultations: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          from_agent: string
          id: string
          model_used: string | null
          parent_message_id: string | null
          parent_thread_id: string | null
          question: string
          response: string | null
          status: string
          to_agent: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          from_agent?: string
          id?: string
          model_used?: string | null
          parent_message_id?: string | null
          parent_thread_id?: string | null
          question: string
          response?: string | null
          status?: string
          to_agent: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          from_agent?: string
          id?: string
          model_used?: string | null
          parent_message_id?: string | null
          parent_thread_id?: string | null
          question?: string
          response?: string | null
          status?: string
          to_agent?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_consultations_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_consultations_parent_thread_id_fkey"
            columns: ["parent_thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_consultations_parent_thread_id_fkey"
            columns: ["parent_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_identity: {
        Row: {
          agent_id: string
          content: string
          doc_type: string
          id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          agent_id?: string
          content?: string
          doc_type: string
          id?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          agent_id?: string
          content?: string
          doc_type?: string
          id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      agent_identity_patches: {
        Row: {
          agent_id: string
          applied_at: string | null
          category: string | null
          confidence: number
          created_at: string
          doc_type: string
          id: string
          operation: string
          patch_content: string
          rationale: string | null
          section: string
          source_message_ids: string[] | null
          source_thread_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          applied_at?: string | null
          category?: string | null
          confidence: number
          created_at?: string
          doc_type: string
          id?: string
          operation: string
          patch_content: string
          rationale?: string | null
          section: string
          source_message_ids?: string[] | null
          source_thread_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          applied_at?: string | null
          category?: string | null
          confidence?: number
          created_at?: string
          doc_type?: string
          id?: string
          operation?: string
          patch_content?: string
          rationale?: string | null
          section?: string
          source_message_ids?: string[] | null
          source_thread_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_identity_patches_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_identity_patches_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_secrets: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          last_four: string | null
          name: string
          status: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          last_four?: string | null
          name: string
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          last_four?: string | null
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_skill_denials: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          id: string
          skill_name: string
          source_skill_id: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          skill_name: string
          source_skill_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          skill_name?: string
          source_skill_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skill_denials_source_skill_id_fkey"
            columns: ["source_skill_id"]
            isOneToOne: false
            referencedRelation: "agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          description: string
          id: string
          last_used_at: string | null
          name: string
          source_thread_id: string | null
          trigger_keywords: string[] | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          agent_id?: string
          content: string
          created_at?: string
          description: string
          id?: string
          last_used_at?: string | null
          name: string
          source_thread_id?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          description?: string
          id?: string
          last_used_at?: string | null
          name?: string
          source_thread_id?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_skills_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      artifacts: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          parent_artifact_id: string | null
          source_message_id: string | null
          thread_id: string
          title: string | null
          user_id: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind: string
          parent_artifact_id?: string | null
          source_message_id?: string | null
          thread_id: string
          title?: string | null
          user_id: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          parent_artifact_id?: string | null
          source_message_id?: string | null
          thread_id?: string
          title?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_parent_artifact_id_fkey"
            columns: ["parent_artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      beliefs: {
        Row: {
          active: boolean | null
          agent_id: string
          confidence: number
          confidence_tier: string | null
          content: string
          contradicting_engram_ids: string[] | null
          created_at: string | null
          domain: string | null
          evidence: Json | null
          id: string
          last_challenged: string | null
          last_revised: string | null
          revision_history: Json | null
          source: string | null
          stagnant: boolean | null
          superseded_by: string | null
          supporting_engram_ids: string[] | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          agent_id?: string
          confidence?: number
          confidence_tier?: string | null
          content: string
          contradicting_engram_ids?: string[] | null
          created_at?: string | null
          domain?: string | null
          evidence?: Json | null
          id?: string
          last_challenged?: string | null
          last_revised?: string | null
          revision_history?: Json | null
          source?: string | null
          stagnant?: boolean | null
          superseded_by?: string | null
          supporting_engram_ids?: string[] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          agent_id?: string
          confidence?: number
          confidence_tier?: string | null
          content?: string
          contradicting_engram_ids?: string[] | null
          created_at?: string | null
          domain?: string | null
          evidence?: Json | null
          id?: string
          last_challenged?: string | null
          last_revised?: string | null
          revision_history?: Json | null
          source?: string | null
          stagnant?: boolean | null
          superseded_by?: string | null
          supporting_engram_ids?: string[] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_imports: {
        Row: {
          completed_at: string | null
          conflicts_detected: number | null
          created_at: string
          file_size_bytes: number | null
          id: string
          memories_created: number | null
          pipeline_stage: string | null
          processed_conversations: number | null
          questions_generated: number | null
          source_platform: string | null
          status: string
          total_conversations: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conflicts_detected?: number | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          memories_created?: number | null
          pipeline_stage?: string | null
          processed_conversations?: number | null
          questions_generated?: number | null
          source_platform?: string | null
          status?: string
          total_conversations?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conflicts_detected?: number | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          memories_created?: number | null
          pipeline_stage?: string | null
          processed_conversations?: number | null
          questions_generated?: number | null
          source_platform?: string | null
          status?: string
          total_conversations?: number | null
          user_id?: string
        }
        Relationships: []
      }
      checkpoint_files: {
        Row: {
          added: number
          checkpoint_id: string
          diff_blob: string | null
          id: string
          path: string
          removed: number
        }
        Insert: {
          added?: number
          checkpoint_id: string
          diff_blob?: string | null
          id?: string
          path: string
          removed?: number
        }
        Update: {
          added?: number
          checkpoint_id?: string
          diff_blob?: string | null
          id?: string
          path?: string
          removed?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_files_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          agent: string
          annotation: string | null
          created_at: string
          files_added: number
          files_removed: number
          id: string
          milestone: boolean
          snapshot_ref: string | null
          summary: string
          user_id: string
        }
        Insert: {
          agent: string
          annotation?: string | null
          created_at?: string
          files_added?: number
          files_removed?: number
          id?: string
          milestone?: boolean
          snapshot_ref?: string | null
          summary?: string
          user_id: string
        }
        Update: {
          agent?: string
          annotation?: string | null
          created_at?: string
          files_added?: number
          files_removed?: number
          id?: string
          milestone?: boolean
          snapshot_ref?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      client_error_log: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          request_id: string | null
          source: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          request_id?: string | null
          source: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          request_id?: string | null
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cognitive_state: {
        Row: {
          agent_id: string
          beliefs: Json
          emotions: Json
          id: string
          modulators: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          beliefs?: Json
          emotions?: Json
          id?: string
          modulators?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          beliefs?: Json
          emotions?: Json
          id?: string
          modulators?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connections: {
        Row: {
          agent_id: string
          connection_type: string
          created_at: string | null
          id: string
          source_id: string
          target_id: string
          user_id: string
          weight: number
        }
        Insert: {
          agent_id?: string
          connection_type: string
          created_at?: string | null
          id?: string
          source_id: string
          target_id: string
          user_id: string
          weight?: number
        }
        Update: {
          agent_id?: string
          connection_type?: string
          created_at?: string | null
          id?: string
          source_id?: string
          target_id?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "connections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
        ]
      }
      crisis_events: {
        Row: {
          created_at: string
          crisis_level: string
          flags: string[] | null
          followup_completed_at: string | null
          followup_due_at: string | null
          followup_queued: boolean
          id: string
          message_id: string | null
          region: string | null
          resources_surfaced: boolean
          thread_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          crisis_level: string
          flags?: string[] | null
          followup_completed_at?: string | null
          followup_due_at?: string | null
          followup_queued?: boolean
          id?: string
          message_id?: string | null
          region?: string | null
          resources_surfaced?: boolean
          thread_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          crisis_level?: string
          flags?: string[] | null
          followup_completed_at?: string | null
          followup_due_at?: string | null
          followup_queued?: boolean
          id?: string
          message_id?: string | null
          region?: string | null
          resources_surfaced?: boolean
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crisis_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crisis_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crisis_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_health: {
        Row: {
          error_count: number
          job_name: string
          last_duration_ms: number | null
          last_error: string | null
          last_run_at: string | null
          last_success_at: string | null
          run_count: number
          updated_at: string
        }
        Insert: {
          error_count?: number
          job_name: string
          last_duration_ms?: number | null
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          run_count?: number
          updated_at?: string
        }
        Update: {
          error_count?: number
          job_name?: string
          last_duration_ms?: number | null
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          run_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      curiosity_questions: {
        Row: {
          agent_id: string
          context: string | null
          created_at: string
          curiosity_score: number | null
          expires_at: string | null
          id: string
          question: string
          status: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          context?: string | null
          created_at?: string
          curiosity_score?: number | null
          expires_at?: string | null
          id?: string
          question: string
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          context?: string | null
          created_at?: string
          curiosity_score?: number | null
          expires_at?: string | null
          id?: string
          question?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          agent_id: string
          content: Json | null
          created_at: string
          id: string
          log_date: string | null
          log_type: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          content?: Json | null
          created_at?: string
          id?: string
          log_date?: string | null
          log_type: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: Json | null
          created_at?: string
          id?: string
          log_date?: string | null
          log_type?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_usage: {
        Row: {
          count: number
          day: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          day?: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          last_run_at: string | null
          model: string | null
          pinned: boolean
          position: number
          prompt: string
          spec: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          last_run_at?: string | null
          model?: string | null
          pinned?: boolean
          position?: number
          prompt: string
          spec?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          last_run_at?: string | null
          model?: string | null
          pinned?: boolean
          position?: number
          prompt?: string
          spec?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      emotional_history: {
        Row: {
          agent_id: string
          id: string
          state: Json
          timestamp: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          id?: string
          state?: Json
          timestamp?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          id?: string
          state?: Json
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      emotional_state: {
        Row: {
          agent_id: string
          clarity: number
          creative_flow: number
          curiosity: number
          isolation: number
          mood_summary: string | null
          restlessness: number
          updated_at: string
          user_id: string
          warmth: number
        }
        Insert: {
          agent_id?: string
          clarity?: number
          creative_flow?: number
          curiosity?: number
          isolation?: number
          mood_summary?: string | null
          restlessness?: number
          updated_at?: string
          user_id: string
          warmth?: number
        }
        Update: {
          agent_id?: string
          clarity?: number
          creative_flow?: number
          curiosity?: number
          isolation?: number
          mood_summary?: string | null
          restlessness?: number
          updated_at?: string
          user_id?: string
          warmth?: number
        }
        Relationships: []
      }
      engram_archive: {
        Row: {
          agent_id: string
          archived_at: string | null
          content: string
          engram_type: string
          id: string
          original_created_at: string | null
          original_stability: number | null
          original_strength: number | null
          source_context: Json | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          agent_id?: string
          archived_at?: string | null
          content: string
          engram_type: string
          id: string
          original_created_at?: string | null
          original_stability?: number | null
          original_strength?: number | null
          source_context?: Json | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          content?: string
          engram_type?: string
          id?: string
          original_created_at?: string | null
          original_stability?: number | null
          original_strength?: number | null
          source_context?: Json | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      engrams: {
        Row: {
          access_count: number | null
          accessibility: number
          agent_id: string
          content: string
          created_at: string | null
          digest_id: string | null
          embedding: string | null
          embedding_model: string | null
          emotional_arousal: number | null
          emotional_valence: number | null
          engram_type: string
          id: string
          last_accessed_at: string | null
          review_decision: string | null
          review_note: string | null
          reviewed_at: string | null
          source_context: Json | null
          stability: number
          state: string
          strength: number
          surprise_score: number | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_count?: number | null
          accessibility?: number
          agent_id?: string
          content: string
          created_at?: string | null
          digest_id?: string | null
          embedding?: string | null
          embedding_model?: string | null
          emotional_arousal?: number | null
          emotional_valence?: number | null
          engram_type: string
          id?: string
          last_accessed_at?: string | null
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          source_context?: Json | null
          stability?: number
          state?: string
          strength?: number
          surprise_score?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_count?: number | null
          accessibility?: number
          agent_id?: string
          content?: string
          created_at?: string | null
          digest_id?: string | null
          embedding?: string | null
          embedding_model?: string | null
          emotional_arousal?: number | null
          emotional_valence?: number | null
          engram_type?: string
          id?: string
          last_accessed_at?: string | null
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          source_context?: Json | null
          stability?: number
          state?: string
          strength?: number
          surprise_score?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entity_activity_log: {
        Row: {
          activity_type: string
          agent_id: string
          content: Json | null
          created_at: string
          emotional_context: Json | null
          id: string
          severity: string
          source: string | null
          summary: string | null
          surface_to_user: boolean
          title: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          agent_id?: string
          content?: Json | null
          created_at?: string
          emotional_context?: Json | null
          id?: string
          severity?: string
          source?: string | null
          summary?: string | null
          surface_to_user?: boolean
          title?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          agent_id?: string
          content?: Json | null
          created_at?: string
          emotional_context?: Json | null
          id?: string
          severity?: string
          source?: string | null
          summary?: string | null
          surface_to_user?: boolean
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      handles: {
        Row: {
          created_at: string
          handle: string
          owner_agent_id: string | null
          owner_kind: string
          owner_user_id: string | null
          reserved: boolean
        }
        Insert: {
          created_at?: string
          handle: string
          owner_agent_id?: string | null
          owner_kind: string
          owner_user_id?: string | null
          reserved?: boolean
        }
        Update: {
          created_at?: string
          handle?: string
          owner_agent_id?: string | null
          owner_kind?: string
          owner_user_id?: string | null
          reserved?: boolean
        }
        Relationships: []
      }
      hypomnema_entry: {
        Row: {
          active: boolean
          active_attention: boolean
          agent_id: string
          confidence: number
          content: string
          created_at: string
          density: string
          domain: string | null
          embedding: string | null
          embedding_model: string | null
          foundational: boolean
          graduated_to_engram_id: string | null
          id: string
          last_challenged: string
          last_revised: string
          meta: Json
          primary_in_thread: boolean
          revision_count: number
          revisions: Json
          source: string
          source_message_id: string | null
          superseded_by: string | null
          tags: string[]
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          active_attention?: boolean
          agent_id?: string
          confidence?: number
          content: string
          created_at?: string
          density?: string
          domain?: string | null
          embedding?: string | null
          embedding_model?: string | null
          foundational?: boolean
          graduated_to_engram_id?: string | null
          id?: string
          last_challenged?: string
          last_revised?: string
          meta?: Json
          primary_in_thread?: boolean
          revision_count?: number
          revisions?: Json
          source?: string
          source_message_id?: string | null
          superseded_by?: string | null
          tags?: string[]
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          active_attention?: boolean
          agent_id?: string
          confidence?: number
          content?: string
          created_at?: string
          density?: string
          domain?: string | null
          embedding?: string | null
          embedding_model?: string | null
          foundational?: boolean
          graduated_to_engram_id?: string | null
          id?: string
          last_challenged?: string
          last_revised?: string
          meta?: Json
          primary_in_thread?: boolean
          revision_count?: number
          revisions?: Json
          source?: string
          source_message_id?: string | null
          superseded_by?: string | null
          tags?: string[]
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hypomnema_entry_graduated_to_engram_id_fkey"
            columns: ["graduated_to_engram_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hypomnema_entry_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hypomnema_entry_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "hypomnema_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hypomnema_entry_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hypomnema_entry_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          response: Json | null
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          key: string
          response?: Json | null
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          key?: string
          response?: Json | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          mood: string | null
          trigger_type: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string
          content: string
          created_at?: string
          id?: string
          mood?: string | null
          trigger_type?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          mood?: string | null
          trigger_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mcp_servers: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          meta: string | null
          name: string
          status: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          meta?: string | null
          name: string
          status?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          meta?: string | null
          name?: string
          status?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          agent_id: string
          confidence: number
          confidence_source: string | null
          content: string
          created_at: string
          decay_factor: number
          detail_level: string | null
          emotional_intensity: number | null
          emotional_valence: number | null
          estimated_date: string | null
          id: string
          is_deleted: boolean | null
          is_watchlist: boolean
          memory_type: string
          narrative_thread: string | null
          needs_confirmation: boolean | null
          pinned: boolean
          provenance: Json | null
          relevance_score: number
          sharpness: number
          staleness_risk: string | null
          summary: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          confidence?: number
          confidence_source?: string | null
          content: string
          created_at?: string
          decay_factor?: number
          detail_level?: string | null
          emotional_intensity?: number | null
          emotional_valence?: number | null
          estimated_date?: string | null
          id?: string
          is_deleted?: boolean | null
          is_watchlist?: boolean
          memory_type?: string
          narrative_thread?: string | null
          needs_confirmation?: boolean | null
          pinned?: boolean
          provenance?: Json | null
          relevance_score?: number
          sharpness?: number
          staleness_risk?: string | null
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          confidence?: number
          confidence_source?: string | null
          content?: string
          created_at?: string
          decay_factor?: number
          detail_level?: string | null
          emotional_intensity?: number | null
          emotional_valence?: number | null
          estimated_date?: string | null
          id?: string
          is_deleted?: boolean | null
          is_watchlist?: boolean
          memory_type?: string
          narrative_thread?: string | null
          needs_confirmation?: boolean | null
          pinned?: boolean
          provenance?: Json | null
          relevance_score?: number
          sharpness?: number
          staleness_risk?: string | null
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_candidates: {
        Row: {
          agent_id: string
          candidate_type: string
          confidence: number
          content: string
          created_at: string
          id: string
          memory_type: string
          rationale: string
          reviewed_at: string | null
          source: Json | null
          status: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          candidate_type: string
          confidence: number
          content: string
          created_at?: string
          id?: string
          memory_type: string
          rationale: string
          reviewed_at?: string | null
          source?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          candidate_type?: string
          confidence?: number
          content?: string
          created_at?: string
          id?: string
          memory_type?: string
          rationale?: string
          reviewed_at?: string | null
          source?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_events: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          salience: number
          type: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          content: string
          created_at?: string
          id?: string
          salience?: number
          type?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          salience?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_settings: {
        Row: {
          consolidation_enabled: boolean
          created_at: string
          decay_rate: number
          dream_frequency: string
          last_consolidated_at: string | null
          mnemos_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          consolidation_enabled?: boolean
          created_at?: string
          decay_rate?: number
          dream_frequency?: string
          last_consolidated_at?: string | null
          mnemos_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          consolidation_enabled?: boolean
          created_at?: string
          decay_rate?: number
          dream_frequency?: string
          last_consolidated_at?: string | null
          mnemos_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          agent: string | null
          attachments: Json | null
          bookmarked: boolean
          content: string
          created_at: string
          id: string
          kind: string | null
          metadata: Json | null
          model: string | null
          role: string
          thinking_content: string | null
          thread_id: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          agent?: string | null
          attachments?: Json | null
          bookmarked?: boolean
          content: string
          created_at?: string
          id?: string
          kind?: string | null
          metadata?: Json | null
          model?: string | null
          role: string
          thinking_content?: string | null
          thread_id: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          agent?: string | null
          attachments?: Json | null
          bookmarked?: boolean
          content?: string
          created_at?: string
          id?: string
          kind?: string | null
          metadata?: Json | null
          model?: string | null
          role?: string
          thinking_content?: string | null
          thread_id?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mnemos_digests: {
        Row: {
          agent_id: string
          created_at: string
          digest_date: string
          engram_count: number
          finalized_at: string | null
          generated_at: string
          id: string
          reviewed_count: number
          status: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          digest_date: string
          engram_count?: number
          finalized_at?: string | null
          generated_at?: string
          id?: string
          reviewed_count?: number
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          digest_date?: string
          engram_count?: number
          finalized_at?: string | null
          generated_at?: string
          id?: string
          reviewed_count?: number
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mnemos_emotional_state: {
        Row: {
          agent_id: string
          arousal: number | null
          certainty: number | null
          dominance: number | null
          id: string
          recorded_at: string | null
          social: number | null
          temporal: number | null
          user_id: string
          valence: number | null
        }
        Insert: {
          agent_id?: string
          arousal?: number | null
          certainty?: number | null
          dominance?: number | null
          id?: string
          recorded_at?: string | null
          social?: number | null
          temporal?: number | null
          user_id: string
          valence?: number | null
        }
        Update: {
          agent_id?: string
          arousal?: number | null
          certainty?: number | null
          dominance?: number | null
          id?: string
          recorded_at?: string | null
          social?: number | null
          temporal?: number | null
          user_id?: string
          valence?: number | null
        }
        Relationships: []
      }
      observer_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      observer_logs: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          model: string | null
          observations: Json | null
          synthesis: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          id?: string
          model?: string | null
          observations?: Json | null
          synthesis?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          model?: string | null
          observations?: Json | null
          synthesis?: string | null
          user_id?: string
        }
        Relationships: []
      }
      observer_notes: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          pinned: boolean
          salience: number
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          pinned?: boolean
          salience?: number
          thread_id: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          pinned?: boolean
          salience?: number
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      openclaw_agents: {
        Row: {
          agent_config_id: string
          created_at: string
          id: string
          spec: Json
          spec_version: number
          sync_history: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_config_id: string
          created_at?: string
          id?: string
          spec?: Json
          spec_version?: number
          sync_history?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_config_id?: string
          created_at?: string
          id?: string
          spec?: Json
          spec_version?: number
          sync_history?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      openclaw_devices: {
        Row: {
          bridge_version: string | null
          created_at: string
          device_token_hash: string | null
          id: string
          is_default: boolean
          last_seen_at: string | null
          name: string
          platform: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bridge_version?: string | null
          created_at?: string
          device_token_hash?: string | null
          id?: string
          is_default?: boolean
          last_seen_at?: string | null
          name: string
          platform?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bridge_version?: string | null
          created_at?: string
          device_token_hash?: string | null
          id?: string
          is_default?: boolean
          last_seen_at?: string | null
          name?: string
          platform?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      openclaw_jobs: {
        Row: {
          agent_config_id: string | null
          completed_at: string | null
          created_at: string
          device_id: string
          error: string | null
          id: string
          kind: string
          payload: Json
          result: Json | null
          started_at: string | null
          status: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          agent_config_id?: string | null
          completed_at?: string | null
          created_at?: string
          device_id: string
          error?: string | null
          id?: string
          kind: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          agent_config_id?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      openclaw_pairing_codes: {
        Row: {
          code: string
          consumed_at: string | null
          consumed_device_id: string | null
          created_at: string
          expires_at: string
          user_id: string
        }
        Insert: {
          code: string
          consumed_at?: string | null
          consumed_device_id?: string | null
          created_at?: string
          expires_at: string
          user_id: string
        }
        Update: {
          code?: string
          consumed_at?: string | null
          consumed_device_id?: string | null
          created_at?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "openclaw_pairing_codes_consumed_device_id_fkey"
            columns: ["consumed_device_id"]
            isOneToOne: false
            referencedRelation: "openclaw_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      openclaw_relay_sessions: {
        Row: {
          closed_at: string | null
          device_id: string
          id: string
          last_ping_at: string
          metadata: Json
          opened_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          device_id: string
          id?: string
          last_ping_at?: string
          metadata?: Json
          opened_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          device_id?: string
          id?: string
          last_ping_at?: string
          metadata?: Json
          opened_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "openclaw_relay_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "openclaw_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_revisions: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          rationale: string | null
          revision_type: string
          source_message_id: string | null
          status: string
          surfaced_at: string | null
          thread_id: string
          user_id: string
          what_to_say_now: string
          what_was_said: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          id?: string
          rationale?: string | null
          revision_type: string
          source_message_id?: string | null
          status?: string
          surfaced_at?: string | null
          thread_id: string
          user_id: string
          what_to_say_now: string
          what_was_said: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          rationale?: string | null
          revision_type?: string
          source_message_id?: string | null
          status?: string
          surfaced_at?: string | null
          thread_id?: string
          user_id?: string
          what_to_say_now?: string
          what_was_said?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_revisions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_revisions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_revisions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_chat_messages: {
        Row: {
          chat_id: string
          citations: Json | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          chat_id: string
          citations?: Json | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          chat_id?: string
          citations?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "profile_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_chats: {
        Row: {
          created_at: string
          id: string
          profile_version: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_version?: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_version?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_daily_pulse: {
        Row: {
          created_at: string
          day: string
          id: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_items: {
        Row: {
          caption: string | null
          created_at: string
          h: number
          handle: string
          id: string
          item_type: string
          payload: Json
          published: boolean
          rotation: number
          updated_at: string
          w: number
          x: number
          y: number
          z: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          h?: number
          handle: string
          id?: string
          item_type: string
          payload?: Json
          published?: boolean
          rotation?: number
          updated_at?: string
          w?: number
          x?: number
          y?: number
          z?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          h?: number
          handle?: string
          id?: string
          item_type?: string
          payload?: Json
          published?: boolean
          rotation?: number
          updated_at?: string
          w?: number
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_items_handle_fkey"
            columns: ["handle"]
            isOneToOne: false
            referencedRelation: "handles"
            referencedColumns: ["handle"]
          },
        ]
      }
      profiles: {
        Row: {
          agent_status: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          last_seen_activity_at: string | null
          notification_prefs: Json
          push_subscription: Json | null
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          quiet_hours_tz: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_status?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_activity_at?: string | null
          notification_prefs?: Json
          push_subscription?: Json | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          quiet_hours_tz?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_status?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen_activity_at?: string | null
          notification_prefs?: Json
          push_subscription?: Json | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          quiet_hours_tz?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          accent_color: string
          avatar_storage_path: string | null
          bio_long: string
          bio_short: string
          created_at: string
          display_name: string
          handle: string
          home_viewport: Json
          published: boolean
          theme: Json
          updated_at: string
        }
        Insert: {
          accent_color?: string
          avatar_storage_path?: string | null
          bio_long?: string
          bio_short?: string
          created_at?: string
          display_name?: string
          handle: string
          home_viewport?: Json
          published?: boolean
          theme?: Json
          updated_at?: string
        }
        Update: {
          accent_color?: string
          avatar_storage_path?: string | null
          bio_long?: string
          bio_short?: string
          created_at?: string
          display_name?: string
          handle?: string
          home_viewport?: Json
          published?: boolean
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_public_handle_fkey"
            columns: ["handle"]
            isOneToOne: true
            referencedRelation: "handles"
            referencedColumns: ["handle"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          instructions: string | null
          metadata: Json
          name: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          instructions?: string | null
          metadata?: Json
          name: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          instructions?: string | null
          metadata?: Json
          name?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      psychological_profile: {
        Row: {
          cognitive_tendencies: Json | null
          communication_patterns: Json | null
          created_at: string
          emotional_landscape: Json | null
          growth_edges: Json | null
          id: string
          identity_narrative: string | null
          personality_dimensions: Json | null
          raw_analysis: Json | null
          relational_dynamics: Json | null
          shadow_patterns: Json | null
          updated_at: string
          user_id: string
          values_hierarchy: Json | null
          version: number
        }
        Insert: {
          cognitive_tendencies?: Json | null
          communication_patterns?: Json | null
          created_at?: string
          emotional_landscape?: Json | null
          growth_edges?: Json | null
          id?: string
          identity_narrative?: string | null
          personality_dimensions?: Json | null
          raw_analysis?: Json | null
          relational_dynamics?: Json | null
          shadow_patterns?: Json | null
          updated_at?: string
          user_id: string
          values_hierarchy?: Json | null
          version?: number
        }
        Update: {
          cognitive_tendencies?: Json | null
          communication_patterns?: Json | null
          created_at?: string
          emotional_landscape?: Json | null
          growth_edges?: Json | null
          id?: string
          identity_narrative?: string | null
          personality_dimensions?: Json | null
          raw_analysis?: Json | null
          relational_dynamics?: Json | null
          shadow_patterns?: Json | null
          updated_at?: string
          user_id?: string
          values_hierarchy?: Json | null
          version?: number
        }
        Relationships: []
      }
      scheduled_tasks: {
        Row: {
          agent_id: string
          created_at: string
          delivery_mode: string
          enabled: boolean
          id: string
          last_run_at: string | null
          last_run_status: string | null
          name: string
          next_run_at: string | null
          prompt: string
          schedule_expr: string
          target_thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          delivery_mode?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          name: string
          next_run_at?: string | null
          prompt: string
          schedule_expr: string
          target_thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          delivery_mode?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          name?: string
          next_run_at?: string | null
          prompt?: string
          schedule_expr?: string
          target_thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_tasks_target_thread_id_fkey"
            columns: ["target_thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_tasks_target_thread_id_fkey"
            columns: ["target_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      subagent_tasks: {
        Row: {
          agent_id: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          parent_message_id: string | null
          parent_thread_id: string
          progress: number
          report_message_id: string | null
          result: string | null
          started_at: string | null
          status: string
          task_description: string
          time_budget_seconds: number
          tool_budget: number
          tool_calls_used: number
          user_id: string
        }
        Insert: {
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          parent_message_id?: string | null
          parent_thread_id: string
          progress?: number
          report_message_id?: string | null
          result?: string | null
          started_at?: string | null
          status?: string
          task_description: string
          time_budget_seconds?: number
          tool_budget?: number
          tool_calls_used?: number
          user_id: string
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          parent_message_id?: string | null
          parent_thread_id?: string
          progress?: number
          report_message_id?: string | null
          result?: string | null
          started_at?: string | null
          status?: string
          task_description?: string
          time_budget_seconds?: number
          tool_budget?: number
          tool_calls_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subagent_tasks_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subagent_tasks_parent_thread_id_fkey"
            columns: ["parent_thread_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subagent_tasks_parent_thread_id_fkey"
            columns: ["parent_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subagent_tasks_report_message_id_fkey"
            columns: ["report_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      thought_initiations: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          message: string
          status: string
          trigger_reason: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          id?: string
          message: string
          status?: string
          trigger_reason?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          message?: string
          status?: string
          trigger_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      thought_stream: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          salience: number
          source: string
          trigger: string | null
          type: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          content: string
          created_at?: string
          id?: string
          salience?: number
          source?: string
          trigger?: string | null
          type?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          salience?: number
          source?: string
          trigger?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          agent_id: string
          archived: boolean
          created_at: string
          heat: string
          id: string
          participating_agent_ids: string[]
          pinned: boolean
          primary_agent_id: string
          project_id: string | null
          starred: boolean
          title: string | null
          updated_at: string
          user_id: string
          voice_mode: string
        }
        Insert: {
          agent_id?: string
          archived?: boolean
          created_at?: string
          heat?: string
          id?: string
          participating_agent_ids?: string[]
          pinned?: boolean
          primary_agent_id?: string
          project_id?: string | null
          starred?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
          voice_mode?: string
        }
        Update: {
          agent_id?: string
          archived?: boolean
          created_at?: string
          heat?: string
          id?: string
          participating_agent_ids?: string[]
          pinned?: boolean
          primary_agent_id?: string
          project_id?: string | null
          starred?: boolean
          title?: string | null
          updated_at?: string
          user_id?: string
          voice_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      token_gate_email_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      token_gate_nonces: {
        Row: {
          created_at: string
          message: string | null
          nonce: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message?: string | null
          nonce: string
          user_id: string
        }
        Update: {
          created_at?: string
          message?: string | null
          nonce?: string
          user_id?: string
        }
        Relationships: []
      }
      token_gate_verifications: {
        Row: {
          balance: number
          expires_at: string
          price_used: number
          usd_value: number
          user_id: string
          verified_at: string
          wallet_address: string
        }
        Insert: {
          balance?: number
          expires_at?: string
          price_used?: number
          usd_value?: number
          user_id: string
          verified_at?: string
          wallet_address: string
        }
        Update: {
          balance?: number
          expires_at?: string
          price_used?: number
          usd_value?: number
          user_id?: string
          verified_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          encrypted_key: string
          id: string
          key_preview: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          id?: string
          key_preview: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          id?: string
          key_preview?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_title: boolean
          clockbar_visible: boolean
          created_at: string
          default_model: string
          default_voice_id: string
          dreamer_model: string | null
          elevenlabs_agent_id: string | null
          ensemble_models: Json | null
          font_size: number
          id: string
          interface_density: string
          interface_mode: string
          landing_agent_id: string | null
          multi_model_enabled: boolean | null
          observer_models: string[] | null
          onboarding_completed_at: string | null
          onboarding_preferences: Json
          reasoning_effort: string | null
          show_agent_colors: boolean
          show_thinking: boolean
          show_timestamps: boolean
          stream_responses: boolean
          synthesis_model: string | null
          synthesis_style: string
          updated_at: string
          user_id: string
          voice_autospeak: boolean
          voice_model: string | null
        }
        Insert: {
          auto_title?: boolean
          clockbar_visible?: boolean
          created_at?: string
          default_model?: string
          default_voice_id?: string
          dreamer_model?: string | null
          elevenlabs_agent_id?: string | null
          ensemble_models?: Json | null
          font_size?: number
          id?: string
          interface_density?: string
          interface_mode?: string
          landing_agent_id?: string | null
          multi_model_enabled?: boolean | null
          observer_models?: string[] | null
          onboarding_completed_at?: string | null
          onboarding_preferences?: Json
          reasoning_effort?: string | null
          show_agent_colors?: boolean
          show_thinking?: boolean
          show_timestamps?: boolean
          stream_responses?: boolean
          synthesis_model?: string | null
          synthesis_style?: string
          updated_at?: string
          user_id: string
          voice_autospeak?: boolean
          voice_model?: string | null
        }
        Update: {
          auto_title?: boolean
          clockbar_visible?: boolean
          created_at?: string
          default_model?: string
          default_voice_id?: string
          dreamer_model?: string | null
          elevenlabs_agent_id?: string | null
          ensemble_models?: Json | null
          font_size?: number
          id?: string
          interface_density?: string
          interface_mode?: string
          landing_agent_id?: string | null
          multi_model_enabled?: boolean | null
          observer_models?: string[] | null
          onboarding_completed_at?: string | null
          onboarding_preferences?: Json
          reasoning_effort?: string | null
          show_agent_colors?: boolean
          show_thinking?: boolean
          show_timestamps?: boolean
          stream_responses?: boolean
          synthesis_model?: string | null
          synthesis_style?: string
          updated_at?: string
          user_id?: string
          voice_autospeak?: boolean
          voice_model?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      conversations: {
        Row: {
          created_at: string | null
          id: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          voice_mode: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          voice_mode?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          voice_mode?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_commit_stale_memory_candidates: { Args: never; Returns: number }
      cleanup_daily_usage: { Args: never; Returns: number }
      cleanup_idempotency_keys: { Args: never; Returns: number }
      current_user_token_gate_email_bypass: { Args: never; Returns: boolean }
      decrypt_user_api_key: { Args: { p_user_id: string }; Returns: string }
      delete_user_api_key: { Args: never; Returns: undefined }
      get_app_config: { Args: { config_key: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_daily_usage: {
        Args: { p_limit: number; p_scope: string; p_user_id: string }
        Returns: {
          allowed: boolean
          current_count: number
          day_limit: number
        }[]
      }
      invoke_edge_function: {
        Args: { function_name: string; payload?: Json }
        Returns: number
      }
      is_handle_owner: { Args: { p_handle: string }; Returns: boolean }
      mark_activity_seen: { Args: never; Returns: undefined }
      match_engrams: {
        Args: {
          match_count?: number
          p_agent_id?: string
          p_user_id?: string
          query_text: string
        }
        Returns: {
          access_count: number
          accessibility: number
          agent_id: string
          content: string
          created_at: string
          emotional_arousal: number
          emotional_valence: number
          engram_type: string
          id: string
          last_accessed_at: string
          similarity: number
          source_context: Json
          stability: number
          state: string
          strength: number
          surprise_score: number
          tags: string[]
          updated_at: string
          user_id: string
        }[]
      }
      match_engrams_vector: {
        Args: {
          match_count?: number
          min_strength?: number
          p_agent_id?: string
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          access_count: number
          accessibility: number
          agent_id: string
          content: string
          created_at: string
          emotional_arousal: number
          emotional_valence: number
          engram_type: string
          id: string
          last_accessed_at: string
          similarity: number
          source_context: Json
          stability: number
          state: string
          strength: number
          surprise_score: number
          tags: string[]
          updated_at: string
          user_id: string
        }[]
      }
      match_hypomnema_vector: {
        Args: {
          match_count?: number
          p_agent_id?: string
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          agent_id: string
          content: string
          density: string
          domain: string
          id: string
          similarity: number
          user_id: string
        }[]
      }
      match_memories: {
        Args: {
          match_count?: number
          p_agent_id?: string
          p_user_id?: string
          query_text: string
        }
        Returns: {
          confidence: number
          content: string
          created_at: string
          emotional_intensity: number
          emotional_valence: number
          estimated_date: string
          id: string
          memory_type: string
          provenance: Json
          similarity: number
          tags: string[]
        }[]
      }
      openclaw_verify_device_token: {
        Args: { p_device_id: string; p_token: string }
        Returns: boolean
      }
      reap_stuck_imports: { Args: never; Returns: number }
      record_cron_run: {
        Args: {
          p_duration_ms: number
          p_error?: string
          p_job_name: string
          p_success: boolean
        }
        Returns: undefined
      }
      save_user_api_key: { Args: { p_key: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
