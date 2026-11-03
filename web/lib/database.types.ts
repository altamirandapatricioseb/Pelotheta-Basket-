// Tipos de la base para @supabase/supabase-js.
//
// Se regeneran con `just types`, que corre:
//   supabase gen types typescript --project-id jztmmfdkbajdrmzilxlt --schema api
// Esta versión sigue el mismo formato que produce ese comando, escrita a partir de las
// migraciones de supabase/migrations/, porque el generador del MCP de Supabase solo cubre el
// esquema `public` y la web solo consulta el esquema `api`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  api: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      system_status: {
        Row: {
          key: string | null;
          updated_at: string | null;
          value: string | null;
        };
        Relationships: [];
      };
      v_last_update: {
        Row: {
          duration_s: number | null;
          games_added: number | null;
          is_global: boolean | null;
          last_run_finished_at: string | null;
          last_run_started_at: string | null;
          last_status: string | null;
          last_success_at: string | null;
          rows_loaded: number | null;
          source: string | null;
          trigger: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
