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
          ensemble_models: Json | null
          font_size: number
          id: string
          interface_density: string
          multi_model_enabled: boolean | null
          reasoning_effort: string | null
          show_agent_colors: boolean
          show_thinking: boolean
          show_timestamps: boolean
          stream_responses: boolean
          synthesis_model: string | null
          synthesis_style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_title?: boolean
          clockbar_visible?: boolean
          created_at?: string
          default_model?: string
          ensemble_models?: Json | null
          font_size?: number
          id?: string
          interface_density?: string
          multi_model_enabled?: boolean | null
          reasoning_effort?: string | null
          show_agent_colors?: boolean
          show_thinking?: boolean
          show_timestamps?: boolean
          stream_responses?: boolean
          synthesis_model?: string | null
          synthesis_style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_title?: boolean
          clockbar_visible?: boolean
          created_at?: string
          default_model?: string
          ensemble_models?: Json | null
          font_size?: number
          id?: string
          interface_density?: string
          multi_model_enabled?: boolean | null
          reasoning_effort?: string | null
          show_agent_colors?: boolean
          show_thinking?: boolean
          show_timestamps?: boolean
          stream_responses?: boolean
          synthesis_model?: string | null
          synthesis_style?: string
          updated_at?: string
          user_id?: string
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
