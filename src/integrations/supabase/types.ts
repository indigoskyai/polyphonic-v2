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
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
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
      beliefs: {
        Row: {
          active: boolean | null
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
      cognitive_state: {
        Row: {
          beliefs: Json
          emotions: Json
          id: string
          modulators: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          beliefs?: Json
          emotions?: Json
          id?: string
          modulators?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
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
          connection_type: string
          created_at: string | null
          id: string
          source_id: string
          target_id: string
          user_id: string
          weight: number
        }
        Insert: {
          connection_type: string
          created_at?: string | null
          id?: string
          source_id: string
          target_id: string
          user_id: string
          weight?: number
        }
        Update: {
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
      curiosity_questions: {
        Row: {
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
          content: Json | null
          created_at: string
          id: string
          log_date: string | null
          log_type: string
          user_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: string
          log_date?: string | null
          log_type: string
          user_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: string
          log_date?: string | null
          log_type?: string
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
          id: string
          state: Json
          timestamp: string
          user_id: string
        }
        Insert: {
          id?: string
          state?: Json
          timestamp?: string
          user_id: string
        }
        Update: {
          id?: string
          state?: Json
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      emotional_state: {
        Row: {
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
          content: string
          created_at: string | null
          emotional_arousal: number | null
          emotional_valence: number | null
          engram_type: string
          id: string
          last_accessed_at: string | null
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
          content: string
          created_at?: string | null
          emotional_arousal?: number | null
          emotional_valence?: number | null
          engram_type: string
          id?: string
          last_accessed_at?: string | null
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
          content?: string
          created_at?: string | null
          emotional_arousal?: number | null
          emotional_valence?: number | null
          engram_type?: string
          id?: string
          last_accessed_at?: string | null
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
          content: Json | null
          created_at: string
          emotional_context: Json | null
          id: string
          source: string | null
          summary: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          content?: Json | null
          created_at?: string
          emotional_context?: Json | null
          id?: string
          source?: string | null
          summary?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          content?: Json | null
          created_at?: string
          emotional_context?: Json | null
          id?: string
          source?: string | null
          summary?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          id: string
          mood: string | null
          trigger_type: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mood?: string | null
          trigger_type?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mood?: string | null
          trigger_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
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
      memory_events: {
        Row: {
          content: string
          created_at: string
          id: string
          salience: number
          type: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          salience?: number
          type?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          salience?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          agent: string | null
          bookmarked: boolean
          content: string
          created_at: string
          id: string
          model: string | null
          role: string
          thinking_content: string | null
          thread_id: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          agent?: string | null
          bookmarked?: boolean
          content: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          thinking_content?: string | null
          thread_id: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          agent?: string | null
          bookmarked?: boolean
          content?: string
          created_at?: string
          id?: string
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
      mnemos_emotional_state: {
        Row: {
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
      observer_logs: {
        Row: {
          created_at: string
          id: string
          model: string | null
          observations: Json | null
          synthesis: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model?: string | null
          observations?: Json | null
          synthesis?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string | null
          observations?: Json | null
          synthesis?: string | null
          user_id?: string
        }
        Relationships: []
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
      thought_initiations: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          trigger_reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          trigger_reason?: string | null
          user_id: string
        }
        Update: {
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
          created_at: string
          heat: string
          id: string
          pinned: boolean
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          heat?: string
          id?: string
          pinned?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          heat?: string
          id?: string
          pinned?: boolean
          title?: string | null
          updated_at?: string
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
          auto_title: boolean
          clockbar_visible: boolean
          created_at: string
          default_model: string
          dreamer_model: string | null
          ensemble_models: Json | null
          font_size: number
          id: string
          interface_density: string
          multi_model_enabled: boolean | null
          observer_models: string[] | null
          reasoning_effort: string | null
          show_agent_colors: boolean
          show_thinking: boolean
          show_timestamps: boolean
          stream_responses: boolean
          synthesis_model: string | null
          synthesis_style: string
          updated_at: string
          user_id: string
          voice_model: string | null
        }
        Insert: {
          auto_title?: boolean
          clockbar_visible?: boolean
          created_at?: string
          default_model?: string
          dreamer_model?: string | null
          ensemble_models?: Json | null
          font_size?: number
          id?: string
          interface_density?: string
          multi_model_enabled?: boolean | null
          observer_models?: string[] | null
          reasoning_effort?: string | null
          show_agent_colors?: boolean
          show_thinking?: boolean
          show_timestamps?: boolean
          stream_responses?: boolean
          synthesis_model?: string | null
          synthesis_style?: string
          updated_at?: string
          user_id: string
          voice_model?: string | null
        }
        Update: {
          auto_title?: boolean
          clockbar_visible?: boolean
          created_at?: string
          default_model?: string
          dreamer_model?: string | null
          ensemble_models?: Json | null
          font_size?: number
          id?: string
          interface_density?: string
          multi_model_enabled?: boolean | null
          observer_models?: string[] | null
          reasoning_effort?: string | null
          show_agent_colors?: boolean
          show_thinking?: boolean
          show_timestamps?: boolean
          stream_responses?: boolean
          synthesis_model?: string | null
          synthesis_style?: string
          updated_at?: string
          user_id?: string
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
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      match_engrams: {
        Args: { match_count?: number; p_user_id?: string; query_text: string }
        Returns: {
          access_count: number
          accessibility: number
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
      match_memories: {
        Args: { match_count?: number; p_user_id?: string; query_text: string }
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
      save_user_api_key: { Args: { p_key: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
