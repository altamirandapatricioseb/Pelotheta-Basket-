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
      ingest_history: {
        Row: {
          db_size_mb: number | null;
          duration_s: number | null;
          finished_at: string | null;
          games_added: number | null;
          rows_loaded: number | null;
          started_at: string | null;
          status: string | null;
          trigger: string | null;
        };
        Relationships: [];
      };
      boca_lineup: {
        Row: {
          lineup_key: string | null;
          players: string | null;
          small_sample: boolean | null;
          stats: Json | null;
        };
        Relationships: [];
      };
      boca_game: {
        Row: {
          game_date: string | null;
          game_id: number | null;
          is_home: boolean | null;
          opponent: string | null;
          points_against: number | null;
          points_for: number | null;
          stats: Json | null;
          tip_off_at: string | null;
        };
        Relationships: [];
      };
      player_stat: {
        Row: {
          full_name: string | null;
          is_estimated: boolean | null;
          player_id: number | null;
          stat_id: string | null;
          value: number | null;
        };
        Relationships: [];
      };
      stat_catalog: {
        Row: {
          available: boolean | null;
          description_es: string | null;
          entity: string | null;
          formula: string | null;
          higher_is_better: boolean | null;
          level: string | null;
          name_es: string | null;
          source: string | null;
          stat_group: string | null;
          stat_id: string | null;
          unit: string | null;
        };
        Relationships: [];
      };
      stat_set_column: {
        Row: {
          entity: string | null;
          scope: string | null;
          set_id: string | null;
          set_name: string | null;
          set_order: number | null;
          sort_order: number | null;
          stat_id: string | null;
        };
        Relationships: [];
      };
      team_stat: {
        Row: {
          is_boca: boolean | null;
          is_estimated: boolean | null;
          stat_id: string | null;
          team: string | null;
          team_id: number | null;
          value: number | null;
        };
        Relationships: [];
      };
      game_line: {
        Row: {
          game_id: number | null;
          game_date: string | null;
          team_id: number | null;
          team: string | null;
          is_boca: boolean | null;
          player_id: number | null;
          player: string | null;
          shirt_number: number | null;
          started: boolean | null;
          minutes: number | null;
          pts: number | null;
          fg2m: number | null;
          fg2a: number | null;
          fg3m: number | null;
          fg3a: number | null;
          ftm: number | null;
          fta: number | null;
          orb: number | null;
          drb: number | null;
          reb: number | null;
          ast: number | null;
          stl: number | null;
          tov: number | null;
          blk: number | null;
          pf: number | null;
          pf_drawn: number | null;
          efficiency: number | null;
          plus_minus: number | null;
        };
        Relationships: [];
      };
      game_period: {
        Row: {
          game_id: number | null;
          period: number | null;
          points_for: number | null;
          points_against: number | null;
        };
        Relationships: [];
      };
      player_bio: {
        Row: {
          player_id: number | null;
          full_name: string | null;
          known_as: string | null;
          position_raw: string | null;
          nationality: string | null;
          height_cm: number | null;
          weight_kg: number | null;
        };
        Relationships: [];
      };
      player_summary: {
        Row: {
          ast: number | null;
          efficiency: number | null;
          full_name: string | null;
          height_cm: number | null;
          known_as: string | null;
          matches: number | null;
          minutes: number | null;
          player_id: number | null;
          position_raw: string | null;
          pts: number | null;
          reb: number | null;
          shirt_number: number | null;
          starts: number | null;
        };
        Relationships: [];
      };
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
