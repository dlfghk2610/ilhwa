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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bid_participations: {
        Row: {
          bid_date: string | null
          client: string | null
          created_at: string
          created_by: string
          estimated_amount: number | null
          id: string
          notes: string | null
          project_name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          bid_date?: string | null
          client?: string | null
          created_at?: string
          created_by: string
          estimated_amount?: number | null
          id?: string
          notes?: string | null
          project_name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          bid_date?: string | null
          client?: string | null
          created_at?: string
          created_by?: string
          estimated_amount?: number | null
          id?: string
          notes?: string | null
          project_name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      career_entries: {
        Row: {
          client: string | null
          created_at: string
          created_by: string
          duties: string | null
          evaluation_category: string | null
          id: string
          notes: string | null
          participation_company: string | null
          participation_position: string | null
          period_end_text: string | null
          period_start: string | null
          project_name: string | null
          recognized_days: number | null
          service_field: string | null
          specialty: string | null
          technician_id: string
          updated_at: string
        }
        Insert: {
          client?: string | null
          created_at?: string
          created_by: string
          duties?: string | null
          evaluation_category?: string | null
          id?: string
          notes?: string | null
          participation_company?: string | null
          participation_position?: string | null
          period_end_text?: string | null
          period_start?: string | null
          project_name?: string | null
          recognized_days?: number | null
          service_field?: string | null
          specialty?: string | null
          technician_id: string
          updated_at?: string
        }
        Update: {
          client?: string | null
          created_at?: string
          created_by?: string
          duties?: string | null
          evaluation_category?: string | null
          id?: string
          notes?: string | null
          participation_company?: string | null
          participation_position?: string | null
          period_end_text?: string | null
          period_start?: string | null
          project_name?: string | null
          recognized_days?: number | null
          service_field?: string | null
          specialty?: string | null
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_entries_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_careers: {
        Row: {
          company: string
          created_at: string
          created_by: string
          department: string | null
          duties: string | null
          hire_date: string | null
          id: string
          notes: string | null
          position: string | null
          resign_date: string | null
          technician_name: string
          updated_at: string
        }
        Insert: {
          company: string
          created_at?: string
          created_by: string
          department?: string | null
          duties?: string | null
          hire_date?: string | null
          id?: string
          notes?: string | null
          position?: string | null
          resign_date?: string | null
          technician_name: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          created_by?: string
          department?: string | null
          duties?: string | null
          hire_date?: string | null
          id?: string
          notes?: string | null
          position?: string | null
          resign_date?: string | null
          technician_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      personal_performances: {
        Row: {
          cert_pdf_path: string | null
          client: string | null
          company_share_rate: string | null
          contract_amount: number | null
          contract_end_date: string | null
          contract_periods: Json
          contract_start_date: string | null
          created_at: string
          created_by: string
          end_date: string | null
          evaluation_types: string[]
          id: string
          is_private: boolean
          notes: string | null
          participant_file_path: string | null
          participants: Json
          performance_amount: number | null
          project_name: string
          role: string | null
          service_overview: string | null
          service_types: string[]
          share_amount: number | null
          share_rate: number | null
          start_date: string | null
          technician_name: string
          updated_at: string
        }
        Insert: {
          cert_pdf_path?: string | null
          client?: string | null
          company_share_rate?: string | null
          contract_amount?: number | null
          contract_end_date?: string | null
          contract_periods?: Json
          contract_start_date?: string | null
          created_at?: string
          created_by: string
          end_date?: string | null
          evaluation_types?: string[]
          id?: string
          is_private?: boolean
          notes?: string | null
          participant_file_path?: string | null
          participants?: Json
          performance_amount?: number | null
          project_name: string
          role?: string | null
          service_overview?: string | null
          service_types?: string[]
          share_amount?: number | null
          share_rate?: number | null
          start_date?: string | null
          technician_name: string
          updated_at?: string
        }
        Update: {
          cert_pdf_path?: string | null
          client?: string | null
          company_share_rate?: string | null
          contract_amount?: number | null
          contract_end_date?: string | null
          contract_periods?: Json
          contract_start_date?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          evaluation_types?: string[]
          id?: string
          is_private?: boolean
          notes?: string | null
          participant_file_path?: string | null
          participants?: Json
          performance_amount?: number | null
          project_name?: string
          role?: string | null
          service_overview?: string | null
          service_types?: string[]
          share_amount?: number | null
          share_rate?: number | null
          start_date?: string | null
          technician_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          display_name: string | null
          id: string
          position: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          position?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      similar_services: {
        Row: {
          announcement_date: string | null
          cert_pdf_path: string | null
          client: string | null
          company_share_rate: string | null
          completion_date: string | null
          contract_amount: number | null
          contract_date: string | null
          created_at: string
          created_by: string
          evaluation_type: string | null
          id: string
          is_dual_participation: boolean
          is_lh_completion: boolean
          is_private: boolean
          is_under_90days: boolean
          notes: string | null
          participation_rate: number | null
          phases: Json
          project_name: string
          service_overview: string | null
          service_type: string | null
          share_amount: number | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          announcement_date?: string | null
          cert_pdf_path?: string | null
          client?: string | null
          company_share_rate?: string | null
          completion_date?: string | null
          contract_amount?: number | null
          contract_date?: string | null
          created_at?: string
          created_by: string
          evaluation_type?: string | null
          id?: string
          is_dual_participation?: boolean
          is_lh_completion?: boolean
          is_private?: boolean
          is_under_90days?: boolean
          notes?: string | null
          participation_rate?: number | null
          phases?: Json
          project_name: string
          service_overview?: string | null
          service_type?: string | null
          share_amount?: number | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          announcement_date?: string | null
          cert_pdf_path?: string | null
          client?: string | null
          company_share_rate?: string | null
          completion_date?: string | null
          contract_amount?: number | null
          contract_date?: string | null
          created_at?: string
          created_by?: string
          evaluation_type?: string | null
          id?: string
          is_dual_participation?: boolean
          is_lh_completion?: boolean
          is_private?: boolean
          is_under_90days?: boolean
          notes?: string | null
          participation_rate?: number | null
          phases?: Json
          project_name?: string
          service_overview?: string | null
          service_type?: string | null
          share_amount?: number | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      technician_overlaps: {
        Row: {
          created_at: string
          created_by: string
          end_date: string
          id: string
          notes: string | null
          participation_rate: number | null
          project_name: string
          start_date: string
          technician_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          notes?: string | null
          participation_rate?: number | null
          project_name: string
          start_date: string
          technician_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          notes?: string | null
          participation_rate?: number | null
          project_name?: string
          start_date?: string
          technician_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      technicians: {
        Row: {
          birth_date: string | null
          company: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          notes: string | null
          position: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          company?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          notes?: string | null
          position?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          company?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          notes?: string | null
          position?: string | null
          specialty?: string | null
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
