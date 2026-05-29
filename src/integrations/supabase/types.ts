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
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          expense_date: string
          household_id: string
          id: string
          merchant: string | null
          note: string | null
          paid_by_member: string
          paid_by_user: string
          receipt_path: string | null
          source: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          currency?: string
          expense_date?: string
          household_id: string
          id?: string
          merchant?: string | null
          note?: string | null
          paid_by_member: string
          paid_by_user: string
          receipt_path?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          expense_date?: string
          household_id?: string
          id?: string
          merchant?: string | null
          note?: string | null
          paid_by_member?: string
          paid_by_user?: string
          receipt_path?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_budgets: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by_member: string
          created_by_user: string
          currency: string
          household_id: string
          id: string
          month: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by_member: string
          created_by_user: string
          currency?: string
          household_id: string
          id?: string
          month: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by_member?: string
          created_by_user?: string
          currency?: string
          household_id?: string
          id?: string
          month?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_expense_weights: {
        Row: {
          created_at: string
          household_id: string
          id: string
          member_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "household_expense_weights_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_expense_weights_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          avatar_emoji: string
          birthday: string | null
          chat_last_read_at: string
          color: string
          display_name: string
          household_id: string
          id: string
          is_admin: boolean
          joined_at: string
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Insert: {
          avatar_emoji?: string
          birthday?: string | null
          chat_last_read_at?: string
          color?: string
          display_name: string
          household_id: string
          id?: string
          is_admin?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Update: {
          avatar_emoji?: string
          birthday?: string | null
          chat_last_read_at?: string
          color?: string
          display_name?: string
          household_id?: string
          id?: string
          is_admin?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_messages: {
        Row: {
          body: string
          created_at: string
          household_id: string
          id: string
          member_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_messages_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          accent_color: string
          created_at: string
          created_by: string
          emoji: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          created_by: string
          emoji?: string
          id?: string
          invite_code: string
          name: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          created_by?: string
          emoji?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_household_id: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_household_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_household_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          added_by_member: string
          added_by_user: string
          category: string
          checked: boolean
          checked_at: string | null
          checked_by_member: string | null
          created_at: string
          household_id: string
          id: string
          name: string
          note: string | null
          quantity: string | null
          updated_at: string
        }
        Insert: {
          added_by_member: string
          added_by_user: string
          category?: string
          checked?: boolean
          checked_at?: string | null
          checked_by_member?: string | null
          created_at?: string
          household_id: string
          id?: string
          name: string
          note?: string | null
          quantity?: string | null
          updated_at?: string
        }
        Update: {
          added_by_member?: string
          added_by_user?: string
          category?: string
          checked?: boolean
          checked_at?: string | null
          checked_by_member?: string | null
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          note?: string | null
          quantity?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          member_id: string
          task_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          member_id: string
          task_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          member_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["task_category"]
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          household_id: string
          id: string
          photo_url: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_type: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          household_id: string
          id?: string
          photo_url?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          household_id?: string
          id?: string
          photo_url?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household_with_owner: {
        Args: {
          _accent_color: string
          _display_name: string
          _emoji: string
          _name: string
          _role: Database["public"]["Enums"]["household_role"]
        }
        Returns: {
          accent_color: string
          created_at: string
          created_by: string
          emoji: string
          id: string
          invite_code: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_invite_code: { Args: never; Returns: string }
      is_household_admin: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
      is_household_member: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
      join_household_by_code: {
        Args: {
          _avatar_emoji?: string
          _code: string
          _color?: string
          _display_name: string
          _role: Database["public"]["Enums"]["household_role"]
        }
        Returns: {
          accent_color: string
          created_at: string
          created_by: string
          emoji: string
          id: string
          invite_code: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      household_role: "parent" | "adult" | "teen" | "kid"
      task_category: "chore" | "errand" | "repair" | "admin" | "other"
      task_priority: "low" | "medium" | "high"
      task_status: "open" | "in_progress" | "done"
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
      household_role: ["parent", "adult", "teen", "kid"],
      task_category: ["chore", "errand", "repair", "admin", "other"],
      task_priority: ["low", "medium", "high"],
      task_status: ["open", "in_progress", "done"],
    },
  },
} as const
