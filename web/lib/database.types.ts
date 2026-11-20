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
      model_run: {
        Row: {
          model: string | null;
          team_slug: string | null;
          status: string | null;
          n: number | null;
          metrics: Json | null;
          params: Json | null;
          message: string | null;
          trained_at: string | null;
        };
        Relationships: [];
      };
      market_value_prediction: {
        Row: {
          team_slug: string | null;
          player_id: number | null;
          player_name: string | null;
          position_group: string | null;
          actual_eur: number | null;
          predicted_eur: number | null;
          low_eur: number | null;
          high_eur: number | null;
          residual_pct: number | null;
          features: Json | null;
          detail: Json | null;
        };
        Relationships: [];
      };
      market_value_coef: {
        Row: {
          team_slug: string | null;
          feature: string | null;
          coef: number | null;
          std_err: number | null;
          t_stat: number | null;
          p_value: number | null;
          ci_low: number | null;
          ci_high: number | null;
        };
        Relationships: [];
      };
      player_style: {
        Row: {
          team_slug: string | null;
          player_id: number | null;
          player_name: string | null;
          position_group: string | null;
          cluster: number | null;
          cluster_label: string | null;
          pc1: number | null;
          pc2: number | null;
          features: Json | null;
          z: Json | null;
          percentiles: Json | null;
        };
        Relationships: [];
      };
      player_alternative: {
        Row: {
          team_slug: string | null;
          player_id: number | null;
          section: string | null;
          rank: number | null;
          members: Json | null;
          similarity: number | null;
          total_value_eur: number | null;
          savings_eur: number | null;
        };
        Relationships: [];
      };
      match_prediction: {
        Row: {
          team_slug: string | null;
          kind: string | null;
          match_date: string | null;
          home_team: string | null;
          away_team: string | null;
          pts_home: number | null;
          pts_away: number | null;
          p_home: number | null;
          p_away: number | null;
          margin_sd: number | null;
          detail: Json | null;
          actual_home: number | null;
          actual_away: number | null;
          competition: string | null;
          neutral: boolean | null;
        };
        Relationships: [];
      };
      team_strength: {
        Row: {
          team_slug: string | null;
          team_name: string | null;
          competition: string | null;
          country: string | null;
          league: string | null;
          estimated: boolean | null;
          games: number | null;
          points_for: number | null;
          points_against: number | null;
          profile: Json | null;
          elo: number | null;
          form: number | null;
        };
        Relationships: [];
      };
      stat_test: {
        Row: {
          team_slug: string | null;
          test_id: string | null;
          title_es: string | null;
          statistic: number | null;
          df: number | null;
          p_value: number | null;
          decision_es: string | null;
          detail: Json | null;
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
          short_name: string | null;
          reading_es: string | null;
          estimated: boolean | null;
          per_unit: boolean | null;
          rule: string | null;
          arg1: string | null;
          arg2: string | null;
          factor: number | null;
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
      chart_catalog: {
        Row: {
          chart_id: string | null;
          category: string | null;
          title_es: string | null;
          chart_type: string | null;
          required_data: string | null;
          origin_ref: string | null;
          powerbi: string | null;
          excel: string | null;
          available: boolean | null;
          reason_es: string | null;
          sort_order: number | null;
        };
        Relationships: [];
      };
      chart_source_map: {
        Row: {
          chart_id: string | null;
          target_type: string | null;
          target_ref: string | null;
          params: string | null;
          label_es: string | null;
        };
        Relationships: [];
      };
      situational_catalog: {
        Row: {
          card_id: string | null;
          category: string | null;
          title_es: string | null;
          condition_es: string | null;
          params_es: string | null;
          measured_es: string | null;
          required_data: string | null;
          level: string | null;
          available: boolean | null;
          estimated: boolean | null;
          reason_es: string | null;
          sort_order: number | null;
          main_metric: string | null;
          extra_metrics: string | null;
        };
        Relationships: [];
      };
      situational_result: {
        Row: {
          card_id: string | null;
          param_value: string | null;
          param_order: number | null;
          n: number | null;
          w: number | null;
          d: number | null;
          l: number | null;
          win_pct: number | null;
          pf_avg: number | null;
          pa_avg: number | null;
          margin: number | null;
          base_win_pct: number | null;
          delta: number | null;
          base_pf: number | null;
          base_pa: number | null;
          base_margin: number | null;
          stats: Json | null;
          base_stats: Json | null;
          computed_at: string | null;
        };
        Relationships: [];
      };
      situational_match: {
        Row: {
          card_id: string | null;
          param_value: string | null;
          match_id: number | null;
          match_date: string | null;
          opponent: string | null;
          home: boolean | null;
          points_for: number | null;
          points_against: number | null;
          result: string | null;
        };
        Relationships: [];
      };
      league_game: {
        Row: {
          game_id: number | null;
          game_date: string | null;
          home: string | null;
          away: string | null;
          home_points: number | null;
          away_points: number | null;
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
      stat_series: {
        Args: { p_stat: string; p_entity: string; p_id?: number | null };
        Returns: {
          match_id: number;
          match_date: string;
          competition_code: string;
          competition_name: string;
          opponent: string;
          home: boolean;
          result: string;
          points_for: number;
          points_against: number;
          minutes: number | null;
          num: number | null;
          den: number | null;
          factor: number;
          value: number | null;
        }[];
      };
      stat_windows: {
        Args: { p_stat: string; p_entity: string; p_id?: number | null };
        Returns: {
          window_key: string;
          label: string;
          sort_order: number;
          n: number;
          value: number | null;
          total: number | null;
          best: number | null;
          worst: number | null;
          season: number | null;
          delta: number | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
