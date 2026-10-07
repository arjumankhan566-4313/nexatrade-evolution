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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      affiliate_applications: {
        Row: {
          admin_note: string
          audience_size: string
          country: string
          created_at: string
          email: string
          experience: string
          full_name: string
          id: string
          phone: string
          platform: string
          processed_at: string | null
          processed_by: string | null
          reason: string
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string
          audience_size?: string
          country?: string
          created_at?: string
          email?: string
          experience?: string
          full_name?: string
          id: string
          phone?: string
          platform?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string
          audience_size?: string
          country?: string
          created_at?: string
          email?: string
          experience?: string
          full_name?: string
          id?: string
          phone?: string
          platform?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_clicks: {
        Row: {
          created_at: string
          id: string
          ip: string
          referrer_id: string
          user_agent: string
        }
        Insert: {
          created_at?: string
          id: string
          ip?: string
          referrer_id: string
          user_agent?: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          referrer_id?: string
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          gross_amount: number
          id: string
          referred_user_id: string
          referrer_id: string
          source_id: string
          source_type: string
          status: string
        }
        Insert: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          gross_amount?: number
          id: string
          referred_user_id: string
          referrer_id: string
          source_id?: string
          source_type?: string
          status?: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          gross_amount?: number
          id?: string
          referred_user_id?: string
          referrer_id?: string
          source_id?: string
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          admin_note: string
          amount: number
          created_at: string
          id: string
          payout_details: string
          payout_method: string
          processed_at: string | null
          processed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string
          amount: number
          created_at?: string
          id: string
          payout_details?: string
          payout_method?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string
          amount?: number
          created_at?: string
          id?: string
          payout_details?: string
          payout_method?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          category: string
          display_name: string
          feed_provider: string
          feed_symbol: string
          is_active: boolean
          payout_rate: number
          price_digits: number
          sort_order: number
          symbol: string
        }
        Insert: {
          category: string
          display_name: string
          feed_provider: string
          feed_symbol: string
          is_active?: boolean
          payout_rate?: number
          price_digits?: number
          sort_order?: number
          symbol: string
        }
        Update: {
          category?: string
          display_name?: string
          feed_provider?: string
          feed_symbol?: string
          is_active?: boolean
          payout_rate?: number
          price_digits?: number
          sort_order?: number
          symbol?: string
        }
        Relationships: []
      }
      copy_links: {
        Row: {
          account_type: string
          copied: number
          created_at: string
          fixed_stake: number
          follower_id: string
          id: string
          is_active: boolean
          leader_id: string
          max_stake: number
          mode: string
          pnl: number
          ratio: number
        }
        Insert: {
          account_type?: string
          copied?: number
          created_at?: string
          fixed_stake?: number
          follower_id: string
          id: string
          is_active?: boolean
          leader_id: string
          max_stake?: number
          mode?: string
          pnl?: number
          ratio?: number
        }
        Update: {
          account_type?: string
          copied?: number
          created_at?: string
          fixed_stake?: number
          follower_id?: string
          id?: string
          is_active?: boolean
          leader_id?: string
          max_stake?: number
          mode?: string
          pnl?: number
          ratio?: number
        }
        Relationships: [
          {
            foreignKeyName: "copy_links_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_links_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      device_fingerprints: {
        Row: {
          fingerprint: string
          first_seen: string
          hits: number
          id: string
          ip: string
          last_seen: string
          user_agent: string
          user_id: string
        }
        Insert: {
          fingerprint: string
          first_seen?: string
          hits?: number
          id: string
          ip?: string
          last_seen?: string
          user_agent?: string
          user_id: string
        }
        Update: {
          fingerprint?: string
          first_seen?: string
          hits?: number
          id?: string
          ip?: string
          last_seen?: string
          user_agent?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_fingerprints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_submissions: {
        Row: {
          address: string
          country: string
          created_at: string
          date_of_birth: string
          doc_back: string
          doc_front: string
          doc_number: string
          doc_type: string
          face_match_score: number
          full_name: string
          id: string
          liveness_report: string
          liveness_score: number
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string
          selfie: string
          status: string
          submitted_ip: string
          user_id: string
        }
        Insert: {
          address?: string
          country: string
          created_at?: string
          date_of_birth?: string
          doc_back?: string
          doc_front?: string
          doc_number?: string
          doc_type: string
          face_match_score?: number
          full_name?: string
          id: string
          liveness_report?: string
          liveness_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string
          selfie?: string
          status?: string
          submitted_ip?: string
          user_id: string
        }
        Update: {
          address?: string
          country?: string
          created_at?: string
          date_of_birth?: string
          doc_back?: string
          doc_front?: string
          doc_number?: string
          doc_type?: string
          face_match_score?: number
          full_name?: string
          id?: string
          liveness_report?: string
          liveness_score?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string
          selfie?: string
          status?: string
          submitted_ip?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      market_ticks: {
        Row: {
          created_at: string
          id: number
          price: number
          source: string
          symbol: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          price: number
          source?: string
          symbol: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          price?: number
          source?: string
          symbol?: string
          user_id?: string | null
        }
        Relationships: []
      }
      markets: {
        Row: {
          category: string
          created_at: string
          display_name: string
          feed_symbol: string
          id: string
          is_active: boolean
          payout_percentage: number
          price_digits: number
          provider: string
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          display_name: string
          feed_symbol?: string
          id?: string
          is_active?: boolean
          payout_percentage?: number
          price_digits?: number
          provider?: string
          sort_order?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          display_name?: string
          feed_symbol?: string
          id?: string
          is_active?: boolean
          payout_percentage?: number
          price_digits?: number
          provider?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          kind: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id: string
          is_read?: boolean
          kind?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      otc_candles: {
        Row: {
          close: number
          created_at: string
          end_time: number
          finalized: boolean
          high: number
          id: number
          low: number
          open: number
          start_time: number
          symbol: string
          tick_count: number
          timeframe: string
        }
        Insert: {
          close: number
          created_at?: string
          end_time: number
          finalized?: boolean
          high: number
          id?: number
          low: number
          open: number
          start_time: number
          symbol: string
          tick_count?: number
          timeframe: string
        }
        Update: {
          close?: number
          created_at?: string
          end_time?: number
          finalized?: boolean
          high?: number
          id?: number
          low?: number
          open?: number
          start_time?: number
          symbol?: string
          tick_count?: number
          timeframe?: string
        }
        Relationships: []
      }
      otc_engine_config: {
        Row: {
          auto_recover: boolean
          batch_flush_ms: number
          checkpoint_interval_ms: number
          engine_enabled: boolean
          gap_policy: string
          id: number
          replay_buffer_size: number
          tick_retention_days: number
          updated_at: string
        }
        Insert: {
          auto_recover?: boolean
          batch_flush_ms?: number
          checkpoint_interval_ms?: number
          engine_enabled?: boolean
          gap_policy?: string
          id: number
          replay_buffer_size?: number
          tick_retention_days?: number
          updated_at?: string
        }
        Update: {
          auto_recover?: boolean
          batch_flush_ms?: number
          checkpoint_interval_ms?: number
          engine_enabled?: boolean
          gap_policy?: string
          id?: number
          replay_buffer_size?: number
          tick_retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      otc_engine_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          detail: string
          id: number
          kind: string
          new_value: string
          old_value: string
          severity: string
          symbol: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          detail?: string
          id?: number
          kind: string
          new_value?: string
          old_value?: string
          severity?: string
          symbol?: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          detail?: string
          id?: number
          kind?: string
          new_value?: string
          old_value?: string
          severity?: string
          symbol?: string
        }
        Relationships: []
      }
      otc_instruments: {
        Row: {
          base_asset: string
          candle_status: string
          created_at: string
          decimal_precision: number
          display_name: string
          exposure_limit: number
          id: string
          is_active: boolean
          market_type: string
          max_stake: number
          max_tick_move: number
          mean_reversion: number
          min_stake: number
          min_tick_move: number
          minimum_price_step: number
          payout_percentage: number
          price_engine_status: string
          quote_asset: string
          retention_days: number
          seed_reference: string
          session_status: string
          sort_order: number
          spread: number
          starting_price: number
          symbol: string
          tick_interval_ms: number
          trading_status: string
          updated_at: string
          volatility: number
        }
        Insert: {
          base_asset?: string
          candle_status?: string
          created_at?: string
          decimal_precision?: number
          display_name: string
          exposure_limit?: number
          id: string
          is_active?: boolean
          market_type?: string
          max_stake?: number
          max_tick_move?: number
          mean_reversion?: number
          min_stake?: number
          min_tick_move?: number
          minimum_price_step?: number
          payout_percentage?: number
          price_engine_status?: string
          quote_asset?: string
          retention_days?: number
          seed_reference?: string
          session_status?: string
          sort_order?: number
          spread?: number
          starting_price?: number
          symbol: string
          tick_interval_ms?: number
          trading_status?: string
          updated_at?: string
          volatility?: number
        }
        Update: {
          base_asset?: string
          candle_status?: string
          created_at?: string
          decimal_precision?: number
          display_name?: string
          exposure_limit?: number
          id?: string
          is_active?: boolean
          market_type?: string
          max_stake?: number
          max_tick_move?: number
          mean_reversion?: number
          min_stake?: number
          min_tick_move?: number
          minimum_price_step?: number
          payout_percentage?: number
          price_engine_status?: string
          quote_asset?: string
          retention_days?: number
          seed_reference?: string
          session_status?: string
          sort_order?: number
          spread?: number
          starting_price?: number
          symbol?: string
          tick_interval_ms?: number
          trading_status?: string
          updated_at?: string
          volatility?: number
        }
        Relationships: []
      }
      otc_market_state: {
        Row: {
          ask: number
          bid: number
          checkpoint_time: string | null
          current_candle: string
          current_price: number
          engine_status: string
          last_tick_time: number | null
          leader_heartbeat: string | null
          leader_id: string
          prng_state: string
          regime_state: string
          seed_reference: string
          seed_rotated_at: string | null
          sequence_number: number
          symbol: string
          updated_at: string
          volatility_state: number
        }
        Insert: {
          ask?: number
          bid?: number
          checkpoint_time?: string | null
          current_candle?: string
          current_price?: number
          engine_status?: string
          last_tick_time?: number | null
          leader_heartbeat?: string | null
          leader_id?: string
          prng_state?: string
          regime_state?: string
          seed_reference?: string
          seed_rotated_at?: string | null
          sequence_number?: number
          symbol: string
          updated_at?: string
          volatility_state?: number
        }
        Update: {
          ask?: number
          bid?: number
          checkpoint_time?: string | null
          current_candle?: string
          current_price?: number
          engine_status?: string
          last_tick_time?: number | null
          leader_heartbeat?: string | null
          leader_id?: string
          prng_state?: string
          regime_state?: string
          seed_reference?: string
          seed_rotated_at?: string | null
          sequence_number?: number
          symbol?: string
          updated_at?: string
          volatility_state?: number
        }
        Relationships: []
      }
      otc_price_ticks: {
        Row: {
          ask: number
          bid: number
          created_at: string
          id: number
          price: number
          sequence_number: number
          symbol: string
          timestamp: number
        }
        Insert: {
          ask: number
          bid: number
          created_at?: string
          id?: number
          price: number
          sequence_number: number
          symbol: string
          timestamp: number
        }
        Update: {
          ask?: number
          bid?: number
          created_at?: string
          id?: number
          price?: number
          sequence_number?: number
          symbol?: string
          timestamp?: number
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          address: string
          code: string
          created_at: string
          extra: string
          id: string
          instructions: string
          is_active: boolean
          kind: string
          name: string
          qr_data: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          address?: string
          code: string
          created_at?: string
          extra?: string
          id: string
          instructions?: string
          is_active?: boolean
          kind?: string
          name: string
          qr_data?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address?: string
          code?: string
          created_at?: string
          extra?: string
          id?: string
          instructions?: string
          is_active?: boolean
          kind?: string
          name?: string
          qr_data?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_events: {
        Row: {
          created_at: string
          id: number
          payload: string
          topic: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          payload?: string
          topic: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          payload?: string
          topic?: string
          user_id?: string | null
        }
        Relationships: []
      }
      security_logs: {
        Row: {
          created_at: string
          device: string
          email: string
          event: string
          id: string
          ip: string
          meta: string
          severity: string
          user_agent: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device?: string
          email?: string
          event: string
          id: string
          ip?: string
          meta?: string
          severity?: string
          user_agent?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device?: string
          email?: string
          event?: string
          id?: string
          ip?: string
          meta?: string
          severity?: string
          user_agent?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          affiliate_default_rate: number
          affiliate_enabled: boolean
          asset_catalog_version: number
          auto_deposits_enabled: boolean
          chart_timer_bg: string
          copy_trading_enabled: boolean
          demo_gateway_enabled: boolean
          enable_force_loss: boolean
          gateway_providers: Json
          id: number
          leaderboard_enabled: boolean
          maintenance_mode: boolean
          max_stake: number
          min_deposit: number
          min_stake: number
          min_withdrawal: number
          risk_engine_enabled: boolean
          settings_version: number
          sharp_trader_threshold: number
          target_win_rate: number
          tournaments_enabled: boolean
          updated_at: string
          withdrawal_needs_kyc: boolean
        }
        Insert: {
          affiliate_default_rate?: number
          affiliate_enabled?: boolean
          asset_catalog_version?: number
          auto_deposits_enabled?: boolean
          chart_timer_bg?: string
          copy_trading_enabled?: boolean
          demo_gateway_enabled?: boolean
          enable_force_loss?: boolean
          gateway_providers?: Json
          id: number
          leaderboard_enabled?: boolean
          maintenance_mode?: boolean
          max_stake?: number
          min_deposit?: number
          min_stake?: number
          min_withdrawal?: number
          risk_engine_enabled?: boolean
          settings_version?: number
          sharp_trader_threshold?: number
          target_win_rate?: number
          tournaments_enabled?: boolean
          updated_at?: string
          withdrawal_needs_kyc?: boolean
        }
        Update: {
          affiliate_default_rate?: number
          affiliate_enabled?: boolean
          asset_catalog_version?: number
          auto_deposits_enabled?: boolean
          chart_timer_bg?: string
          copy_trading_enabled?: boolean
          demo_gateway_enabled?: boolean
          enable_force_loss?: boolean
          gateway_providers?: Json
          id?: number
          leaderboard_enabled?: boolean
          maintenance_mode?: boolean
          max_stake?: number
          min_deposit?: number
          min_stake?: number
          min_withdrawal?: number
          risk_engine_enabled?: boolean
          settings_version?: number
          sharp_trader_threshold?: number
          target_win_rate?: number
          tournaments_enabled?: boolean
          updated_at?: string
          withdrawal_needs_kyc?: boolean
        }
        Relationships: []
      }
      tournament_entries: {
        Row: {
          final_rank: number | null
          id: string
          joined_at: string
          pnl: number
          prize: number
          tournament_id: string
          trades: number
          user_id: string
          volume: number
          wins: number
        }
        Insert: {
          final_rank?: number | null
          id: string
          joined_at?: string
          pnl?: number
          prize?: number
          tournament_id: string
          trades?: number
          user_id: string
          volume?: number
          wins?: number
        }
        Update: {
          final_rank?: number | null
          id?: string
          joined_at?: string
          pnl?: number
          prize?: number
          tournament_id?: string
          trades?: number
          user_id?: string
          volume?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          account_type: string
          created_at: string
          description: string
          ends_at: string
          entry_fee: number
          guaranteed: number
          id: string
          max_players: number
          name: string
          prize_pool: number
          prize_split: string
          starts_at: string
          status: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          description?: string
          ends_at?: string
          entry_fee?: number
          guaranteed?: number
          id: string
          max_players?: number
          name: string
          prize_pool?: number
          prize_split?: string
          starts_at?: string
          status?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          description?: string
          ends_at?: string
          entry_fee?: number
          guaranteed?: number
          id?: string
          max_players?: number
          name?: string
          prize_pool?: number
          prize_split?: string
          starts_at?: string
          status?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          account_type: string
          adjust_reason: string
          copied_from: string | null
          created_at: string
          direction: string
          duration_seconds: number
          entry_price: number
          entry_sequence: number | null
          exit_price: number | null
          expires_at: string
          id: string
          idempotency_key: string | null
          is_adjusted: boolean
          market_price: number | null
          market_type: string
          payout_rate: number
          price_source: string
          profit: number | null
          settled_at: string | null
          settlement_sequence: number | null
          stake: number
          status: string
          symbol: string
          tournament_id: string | null
          user_id: string
        }
        Insert: {
          account_type?: string
          adjust_reason?: string
          copied_from?: string | null
          created_at?: string
          direction: string
          duration_seconds: number
          entry_price: number
          entry_sequence?: number | null
          exit_price?: number | null
          expires_at: string
          id: string
          idempotency_key?: string | null
          is_adjusted?: boolean
          market_price?: number | null
          market_type?: string
          payout_rate: number
          price_source?: string
          profit?: number | null
          settled_at?: string | null
          settlement_sequence?: number | null
          stake: number
          status?: string
          symbol: string
          tournament_id?: string | null
          user_id: string
        }
        Update: {
          account_type?: string
          adjust_reason?: string
          copied_from?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number
          entry_price?: number
          entry_sequence?: number | null
          exit_price?: number | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          is_adjusted?: boolean
          market_price?: number | null
          market_type?: string
          payout_rate?: number
          price_source?: string
          profit?: number | null
          settled_at?: string | null
          settlement_sequence?: number | null
          stake?: number
          status?: string
          symbol?: string
          tournament_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          admin_note: string
          amount: number
          created_at: string
          currency: string
          gateway_ref: string
          id: string
          method: string
          mode: string
          payment_method_id: string | null
          processed_at: string | null
          processed_by: string | null
          proof_image: string
          provider: string
          provider_event_id: string
          provider_order_id: string
          provider_payout_id: string
          provider_status: string
          reference: string
          sender_account: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          admin_note?: string
          amount: number
          created_at?: string
          currency?: string
          gateway_ref?: string
          id: string
          method: string
          mode?: string
          payment_method_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          proof_image?: string
          provider?: string
          provider_event_id?: string
          provider_order_id?: string
          provider_payout_id?: string
          provider_status?: string
          reference?: string
          sender_account?: string
          status?: string
          type: string
          user_id: string
        }
        Update: {
          admin_note?: string
          amount?: number
          created_at?: string
          currency?: string
          gateway_ref?: string
          id?: string
          method?: string
          mode?: string
          payment_method_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          proof_image?: string
          provider?: string
          provider_event_id?: string
          provider_order_id?: string
          provider_payout_id?: string
          provider_status?: string
          reference?: string
          sender_account?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          affiliate_applied: boolean
          affiliate_balance: number
          affiliate_status: string
          alias: string
          balance_demo: number
          balance_real: number
          commission_rate: number
          country: string
          created_at: string
          custom_yield_ratio: number | null
          deposit_limit: number | null
          email: string
          force_loss_user: boolean
          full_name: string
          gateway_config: Json
          id: string
          is_blocked: boolean
          is_leader: boolean
          kyc_status: string
          last_login_at: string | null
          last_login_ip: string
          login_alerts: boolean
          password_hash: string
          phone: string
          reality_check_minutes: number
          referral_code: string | null
          referred_by: string | null
          risk_flag: string
          role: string
          self_exclusion_until: string | null
          token_version: number
          totp_backup_codes: Json
          totp_enabled: boolean
          totp_secret: string
          vip_tier: string
        }
        Insert: {
          affiliate_applied?: boolean
          affiliate_balance?: number
          affiliate_status?: string
          alias?: string
          balance_demo?: number
          balance_real?: number
          commission_rate?: number
          country?: string
          created_at?: string
          custom_yield_ratio?: number | null
          deposit_limit?: number | null
          email: string
          force_loss_user?: boolean
          full_name: string
          gateway_config?: Json
          id: string
          is_blocked?: boolean
          is_leader?: boolean
          kyc_status?: string
          last_login_at?: string | null
          last_login_ip?: string
          login_alerts?: boolean
          password_hash: string
          phone?: string
          reality_check_minutes?: number
          referral_code?: string | null
          referred_by?: string | null
          risk_flag?: string
          role?: string
          self_exclusion_until?: string | null
          token_version?: number
          totp_backup_codes?: Json
          totp_enabled?: boolean
          totp_secret?: string
          vip_tier?: string
        }
        Update: {
          affiliate_applied?: boolean
          affiliate_balance?: number
          affiliate_status?: string
          alias?: string
          balance_demo?: number
          balance_real?: number
          commission_rate?: number
          country?: string
          created_at?: string
          custom_yield_ratio?: number | null
          deposit_limit?: number | null
          email?: string
          force_loss_user?: boolean
          full_name?: string
          gateway_config?: Json
          id?: string
          is_blocked?: boolean
          is_leader?: boolean
          kyc_status?: string
          last_login_at?: string | null
          last_login_ip?: string
          login_alerts?: boolean
          password_hash?: string
          phone?: string
          reality_check_minutes?: number
          referral_code?: string | null
          referred_by?: string | null
          risk_flag?: string
          role?: string
          self_exclusion_until?: string | null
          token_version?: number
          totp_backup_codes?: Json
          totp_enabled?: boolean
          totp_secret?: string
          vip_tier?: string
        }
        Relationships: []
      }
      vip_tiers: {
        Row: {
          cashback_pct: number
          color: string
          id: string
          is_active: boolean
          min_volume: number
          name: string
          payout_bonus: number
          perks: string
          sort_order: number
        }
        Insert: {
          cashback_pct?: number
          color?: string
          id: string
          is_active?: boolean
          min_volume?: number
          name: string
          payout_bonus?: number
          perks?: string
          sort_order?: number
        }
        Update: {
          cashback_pct?: number
          color?: string
          id?: string
          is_active?: boolean
          min_volume?: number
          name?: string
          payout_bonus?: number
          perks?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
