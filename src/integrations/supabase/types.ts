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
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      beliefs: {
        Row: {
          active: boolean | null
          confidence: number
          content: string
          created_at: string | null
          domain: string
          evidence: Json | null
          id: string
          last_challenged: string | null
          last_revised: string | null
          revision_history: Json | null
          source: string | null
          stagnant: boolean | null
          superseded_by: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          confidence?: number
          content: string
          created_at?: string | null
          domain?: string
          evidence?: Json | null
          id?: string
          last_challenged?: string | null
          last_revised?: string | null
          revision_history?: Json | null
          source?: string | null
          stagnant?: boolean | null
          superseded_by?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          confidence?: number
          content?: string
          created_at?: string | null
          domain?: string
          evidence?: Json | null
          id?: string
          last_challenged?: string | null
          last_revised?: string | null
          revision_history?: Json | null
          source?: string | null
          stagnant?: boolean | null
          superseded_by?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beliefs_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "beliefs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_imports: {
        Row: {
          completed_at: string | null
          conflicts_detected: number
          created_at: string
          error_message: string | null
          id: string
          memories_created: number
          pipeline_stage: string | null
          processed_conversations: number
          questions_generated: number
          source_platform: string
          started_at: string | null
          status: string
          total_conversations: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conflicts_detected?: number
          created_at?: string
          error_message?: string | null
          id?: string
          memories_created?: number
          pipeline_stage?: string | null
          processed_conversations?: number
          questions_generated?: number
          source_platform?: string
          started_at?: string | null
          status?: string
          total_conversations?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conflicts_detected?: number
          created_at?: string
          error_message?: string | null
          id?: string
          memories_created?: number
          pipeline_stage?: string | null
          processed_conversations?: number
          questions_generated?: number
          source_platform?: string
          started_at?: string | null
          status?: string
          total_conversations?: number
          user_id?: string
        }
        Relationships: []
      }
      companion_profiles: {
        Row: {
          behavioral_rules: Json | null
          companion_summary: string | null
          conversations_analyzed: number | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          extraction_model: string | null
          id: string
          is_active: boolean | null
          linguistic_fingerprint: Json
          name: string | null
          psychological_profile: Json
          source_platform: string
          system_prompt_fragment: string | null
          updated_at: string | null
          user_adjustments: Json | null
          user_approved: boolean | null
          user_id: string
        }
        Insert: {
          behavioral_rules?: Json | null
          companion_summary?: string | null
          conversations_analyzed?: number | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          extraction_model?: string | null
          id?: string
          is_active?: boolean | null
          linguistic_fingerprint?: Json
          name?: string | null
          psychological_profile?: Json
          source_platform?: string
          system_prompt_fragment?: string | null
          updated_at?: string | null
          user_adjustments?: Json | null
          user_approved?: boolean | null
          user_id: string
        }
        Update: {
          behavioral_rules?: Json | null
          companion_summary?: string | null
          conversations_analyzed?: number | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          extraction_model?: string | null
          id?: string
          is_active?: boolean | null
          linguistic_fingerprint?: Json
          name?: string | null
          psychological_profile?: Json
          source_platform?: string
          system_prompt_fragment?: string | null
          updated_at?: string | null
          user_adjustments?: Json | null
          user_approved?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          branched_at_message_id: string | null
          created_at: string
          id: string
          parent_conversation_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branched_at_message_id?: string | null
          created_at?: string
          id?: string
          parent_conversation_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branched_at_message_id?: string | null
          created_at?: string
          id?: string
          parent_conversation_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_parent_conversation_id_fkey"
            columns: ["parent_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      curiosity_questions: {
        Row: {
          answered_at: string | null
          context: string | null
          created_at: string
          curiosity_score: number | null
          id: string
          question: string
          shown_at: string | null
          source_conversation_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          context?: string | null
          created_at?: string
          curiosity_score?: number | null
          id?: string
          question: string
          shown_at?: string | null
          source_conversation_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          answered_at?: string | null
          context?: string | null
          created_at?: string
          curiosity_score?: number | null
          id?: string
          question?: string
          shown_at?: string | null
          source_conversation_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curiosity_questions_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          content: Json
          created_at: string | null
          id: string
          log_type: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string | null
          id?: string
          log_type: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string | null
          id?: string
          log_type?: string
          user_id?: string
        }
        Relationships: []
      }
      emotional_history: {
        Row: {
          id: string
          state: Json
          timestamp: string | null
          user_id: string
        }
        Insert: {
          id?: string
          state: Json
          timestamp?: string | null
          user_id: string
        }
        Update: {
          id?: string
          state?: Json
          timestamp?: string | null
          user_id?: string
        }
        Relationships: []
      }
      emotional_state: {
        Row: {
          clarity: number
          creative_flow: number
          curiosity: number
          id: string
          isolation: number
          mood_summary: string | null
          restlessness: number
          updated_at: string | null
          user_id: string
          warmth: number
        }
        Insert: {
          clarity?: number
          creative_flow?: number
          curiosity?: number
          id?: string
          isolation?: number
          mood_summary?: string | null
          restlessness?: number
          updated_at?: string | null
          user_id: string
          warmth?: number
        }
        Update: {
          clarity?: number
          creative_flow?: number
          curiosity?: number
          id?: string
          isolation?: number
          mood_summary?: string | null
          restlessness?: number
          updated_at?: string | null
          user_id?: string
          warmth?: number
        }
        Relationships: []
      }
      experimental_persona_config: {
        Row: {
          id: string
          is_active: boolean
          system_prompt: string
          temperature: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          system_prompt: string
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          system_prompt?: string
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      extraction_rejections: {
        Row: {
          confidence: number | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          memory_type: string | null
          rejection_reason: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_type?: string | null
          rejection_reason: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_type?: string | null
          rejection_reason?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          model_used: string | null
          mood: string | null
          source_conversation_id: string | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          model_used?: string | null
          mood?: string | null
          source_conversation_id?: string | null
          trigger_type?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          model_used?: string | null
          mood?: string | null
          source_conversation_id?: string | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          access_count: number | null
          confidence: number | null
          confidence_source: string | null
          content: string
          created_at: string
          decay_factor: number | null
          deleted_at: string | null
          detail_level: string | null
          emotional_intensity: number | null
          emotional_valence: number | null
          estimated_date: string | null
          expires_at: string | null
          id: string
          import_needs_confirmation: boolean | null
          is_deleted: boolean | null
          is_watchlist: boolean | null
          last_accessed_at: string | null
          memory_type: string
          narrative_thread: string | null
          overlay_scope: string | null
          provenance: Json | null
          relevance_score: number | null
          sharpness: number | null
          source_conversation_id: string | null
          staleness_risk: string | null
          summary: string | null
          superseded_by: string | null
          supersedes: string | null
          tags: string[] | null
          topic_frequency: number | null
          updated_at: string
          user_confirmed: boolean | null
          user_id: string
          verified_by_user: boolean | null
        }
        Insert: {
          access_count?: number | null
          confidence?: number | null
          confidence_source?: string | null
          content: string
          created_at?: string
          decay_factor?: number | null
          deleted_at?: string | null
          detail_level?: string | null
          emotional_intensity?: number | null
          emotional_valence?: number | null
          estimated_date?: string | null
          expires_at?: string | null
          id?: string
          import_needs_confirmation?: boolean | null
          is_deleted?: boolean | null
          is_watchlist?: boolean | null
          last_accessed_at?: string | null
          memory_type?: string
          narrative_thread?: string | null
          overlay_scope?: string | null
          provenance?: Json | null
          relevance_score?: number | null
          sharpness?: number | null
          source_conversation_id?: string | null
          staleness_risk?: string | null
          summary?: string | null
          superseded_by?: string | null
          supersedes?: string | null
          tags?: string[] | null
          topic_frequency?: number | null
          updated_at?: string
          user_confirmed?: boolean | null
          user_id: string
          verified_by_user?: boolean | null
        }
        Update: {
          access_count?: number | null
          confidence?: number | null
          confidence_source?: string | null
          content?: string
          created_at?: string
          decay_factor?: number | null
          deleted_at?: string | null
          detail_level?: string | null
          emotional_intensity?: number | null
          emotional_valence?: number | null
          estimated_date?: string | null
          expires_at?: string | null
          id?: string
          import_needs_confirmation?: boolean | null
          is_deleted?: boolean | null
          is_watchlist?: boolean | null
          last_accessed_at?: string | null
          memory_type?: string
          narrative_thread?: string | null
          overlay_scope?: string | null
          provenance?: Json | null
          relevance_score?: number | null
          sharpness?: number | null
          source_conversation_id?: string | null
          staleness_risk?: string | null
          summary?: string | null
          superseded_by?: string | null
          supersedes?: string | null
          tags?: string[] | null
          topic_frequency?: number | null
          updated_at?: string
          user_confirmed?: boolean | null
          user_id?: string
          verified_by_user?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_conflicts: {
        Row: {
          conflict_type: string
          correction_memory_id: string | null
          created_at: string
          id: string
          memory_a_id: string
          memory_b_id: string
          resolution: string | null
          resolved_at: string | null
          status: string
          user_choice: string | null
          user_id: string
        }
        Insert: {
          conflict_type?: string
          correction_memory_id?: string | null
          created_at?: string
          id?: string
          memory_a_id: string
          memory_b_id: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          user_choice?: string | null
          user_id: string
        }
        Update: {
          conflict_type?: string
          correction_memory_id?: string | null
          created_at?: string
          id?: string
          memory_a_id?: string
          memory_b_id?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          user_choice?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_conflicts_correction_memory_id_fkey"
            columns: ["correction_memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_conflicts_memory_a_id_fkey"
            columns: ["memory_a_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_conflicts_memory_b_id_fkey"
            columns: ["memory_b_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_connections: {
        Row: {
          created_at: string
          id: string
          relation_type: string
          source_memory_id: string
          strength: number | null
          target_memory_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relation_type: string
          source_memory_id: string
          strength?: number | null
          target_memory_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relation_type?: string
          source_memory_id?: string
          strength?: number | null
          target_memory_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_connections_source_memory_id_fkey"
            columns: ["source_memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_connections_target_memory_id_fkey"
            columns: ["target_memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      message_variants: {
        Row: {
          content: string
          created_at: string
          id: string
          message_id: string
          model: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_id: string
          model?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_id?: string
          model?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_variants_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          model: string | null
          role: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          model?: string | null
          role: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          model?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_configs: {
        Row: {
          created_at: string
          description: string | null
          feature_key: string
          id: string
          is_active: boolean
          model_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_key: string
          id?: string
          is_active?: boolean
          model_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean
          model_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      observer_logs: {
        Row: {
          created_at: string | null
          id: string
          model: string
          observations: Json
          synthesis: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          model: string
          observations?: Json
          synthesis?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          model?: string
          observations?: Json
          synthesis?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reflection_jobs: {
        Row: {
          completed_at: string | null
          conflicts_detected: number | null
          connections_created: number | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          memories_created: number | null
          memories_updated: number | null
          questions_generated: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conflicts_detected?: number | null
          connections_created?: number | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          memories_created?: number | null
          memories_updated?: number | null
          questions_generated?: number | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conflicts_detected?: number | null
          connections_created?: number | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          memories_created?: number | null
          memories_updated?: number | null
          questions_generated?: number | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reflection_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          created_at: string
          description: string | null
          feature_key: string
          id: string
          is_active: boolean
          name: string
          prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_key: string
          id?: string
          is_active?: boolean
          name: string
          prompt?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean
          name?: string
          prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      thought_initiations: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          id: string
          message: string
          salience_total: number
          source_thought_ids: string[] | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          message: string
          salience_total?: number
          source_thought_ids?: string[] | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          message?: string
          salience_total?: number
          source_thought_ids?: string[] | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      thought_stream: {
        Row: {
          content: string
          created_at: string | null
          delivered: boolean | null
          delivered_at: string | null
          id: string
          model_used: string | null
          salience: number
          source: string
          tags: string[] | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          id?: string
          model_used?: string | null
          salience?: number
          source?: string
          tags?: string[] | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          id?: string
          model_used?: string | null
          salience?: number
          source?: string
          tags?: string[] | null
          user_id?: string
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
          about_me: string | null
          background_style: string | null
          belief_model: string | null
          chat_history_enabled: boolean | null
          created_at: string
          custom_instructions: string | null
          dreamer_model: string | null
          id: string
          journal_model: string | null
          max_tokens: number | null
          memory_enabled: boolean | null
          memory_model: string | null
          memory_tier: string | null
          nickname: string | null
          observer_models: string[] | null
          occupation: string | null
          persona: string
          selected_model: string | null
          synthesis_model: string | null
          temperature: number | null
          theme: string | null
          updated_at: string
          user_id: string
          voice_model: string | null
        }
        Insert: {
          about_me?: string | null
          background_style?: string | null
          belief_model?: string | null
          chat_history_enabled?: boolean | null
          created_at?: string
          custom_instructions?: string | null
          dreamer_model?: string | null
          id?: string
          journal_model?: string | null
          max_tokens?: number | null
          memory_enabled?: boolean | null
          memory_model?: string | null
          memory_tier?: string | null
          nickname?: string | null
          observer_models?: string[] | null
          occupation?: string | null
          persona?: string
          selected_model?: string | null
          synthesis_model?: string | null
          temperature?: number | null
          theme?: string | null
          updated_at?: string
          user_id: string
          voice_model?: string | null
        }
        Update: {
          about_me?: string | null
          background_style?: string | null
          belief_model?: string | null
          chat_history_enabled?: boolean | null
          created_at?: string
          custom_instructions?: string | null
          dreamer_model?: string | null
          id?: string
          journal_model?: string | null
          max_tokens?: number | null
          memory_enabled?: boolean | null
          memory_model?: string | null
          memory_tier?: string | null
          nickname?: string | null
          observer_models?: string[] | null
          occupation?: string | null
          persona?: string
          selected_model?: string | null
          synthesis_model?: string | null
          temperature?: number | null
          theme?: string | null
          updated_at?: string
          user_id?: string
          voice_model?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_user_api_key: { Args: { p_user_id: string }; Returns: string }
      delete_user_api_key: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_memory_access: {
        Args: { memory_ids: string[] }
        Returns: undefined
      }
      save_user_api_key: { Args: { p_key: string }; Returns: undefined }
      update_memory_decay: { Args: never; Returns: number }
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
