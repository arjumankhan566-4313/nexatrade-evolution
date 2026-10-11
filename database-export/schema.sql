--
-- PostgreSQL database dump
--

\restrict X2pjo7uQ1CXGfEdLrGh6TG0eNn0l6E1ewXPvNe0TD8ILcFBL07qBNu5pFmB5Y3D

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: affiliate_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_applications (
    id text NOT NULL,
    user_id text NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    country text DEFAULT ''::text NOT NULL,
    experience text DEFAULT ''::text NOT NULL,
    platform text DEFAULT ''::text NOT NULL,
    audience_size text DEFAULT ''::text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    admin_note text DEFAULT ''::text NOT NULL,
    processed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: affiliate_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_clicks (
    id text NOT NULL,
    referrer_id text NOT NULL,
    ip text DEFAULT ''::text NOT NULL,
    user_agent text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: affiliate_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_commissions (
    id text NOT NULL,
    referrer_id text NOT NULL,
    referred_user_id text NOT NULL,
    source_type text DEFAULT 'DEPOSIT'::text NOT NULL,
    source_id text DEFAULT ''::text NOT NULL,
    gross_amount numeric(18,2) DEFAULT 0 NOT NULL,
    commission_rate numeric(6,2) DEFAULT 40.00 NOT NULL,
    commission_amount numeric(18,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'CREDITED'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: affiliate_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affiliate_payouts (
    id text NOT NULL,
    user_id text NOT NULL,
    amount numeric(18,2) NOT NULL,
    payout_method text DEFAULT 'CRYPTO_TRC20'::text NOT NULL,
    payout_details text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    admin_note text DEFAULT ''::text NOT NULL,
    processed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    symbol text NOT NULL,
    display_name text NOT NULL,
    category text NOT NULL,
    feed_provider text NOT NULL,
    feed_symbol text NOT NULL,
    payout_rate numeric(6,2) DEFAULT 85 NOT NULL,
    price_digits integer DEFAULT 2 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: copy_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copy_links (
    id text NOT NULL,
    follower_id text NOT NULL,
    leader_id text NOT NULL,
    mode text DEFAULT 'RATIO'::text NOT NULL,
    ratio numeric(6,2) DEFAULT 100 NOT NULL,
    fixed_stake numeric(18,2) DEFAULT 5 NOT NULL,
    max_stake numeric(18,2) DEFAULT 50 NOT NULL,
    account_type text DEFAULT 'DEMO'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    copied integer DEFAULT 0 NOT NULL,
    pnl numeric(18,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_fingerprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_fingerprints (
    id text NOT NULL,
    user_id text NOT NULL,
    fingerprint text NOT NULL,
    ip text DEFAULT ''::text NOT NULL,
    user_agent text DEFAULT ''::text NOT NULL,
    hits integer DEFAULT 1 NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kyc_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_submissions (
    id text NOT NULL,
    user_id text NOT NULL,
    country text NOT NULL,
    doc_type text NOT NULL,
    doc_number text DEFAULT ''::text NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    date_of_birth text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    doc_front text DEFAULT ''::text NOT NULL,
    doc_back text DEFAULT ''::text NOT NULL,
    selfie text DEFAULT ''::text NOT NULL,
    face_match_score numeric(6,2) DEFAULT 0 NOT NULL,
    liveness_score numeric(6,2) DEFAULT 0 NOT NULL,
    liveness_report text DEFAULT '{}'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    reviewer_note text DEFAULT ''::text NOT NULL,
    reviewed_by text,
    submitted_ip text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


--
-- Name: market_ticks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_ticks (
    id bigint NOT NULL,
    symbol text NOT NULL,
    price numeric(20,8) NOT NULL,
    source text DEFAULT 'CLIENT'::text NOT NULL,
    user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: market_ticks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.market_ticks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: market_ticks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.market_ticks_id_seq OWNED BY public.market_ticks.id;


--
-- Name: markets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.markets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    symbol text NOT NULL,
    display_name text NOT NULL,
    category text DEFAULT 'CRYPTO'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    payout_percentage numeric(6,2) DEFAULT 85 NOT NULL,
    provider text DEFAULT 'BINANCE'::text NOT NULL,
    feed_symbol text DEFAULT ''::text NOT NULL,
    price_digits integer DEFAULT 2 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    kind text DEFAULT 'INFO'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_candles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otc_candles (
    id bigint NOT NULL,
    symbol text NOT NULL,
    timeframe text NOT NULL,
    start_time bigint NOT NULL,
    end_time bigint NOT NULL,
    open numeric(20,8) NOT NULL,
    high numeric(20,8) NOT NULL,
    low numeric(20,8) NOT NULL,
    close numeric(20,8) NOT NULL,
    tick_count integer DEFAULT 0 NOT NULL,
    finalized boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_candles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otc_candles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otc_candles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otc_candles_id_seq OWNED BY public.otc_candles.id;


--
-- Name: otc_engine_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otc_engine_config (
    id integer NOT NULL,
    engine_enabled boolean DEFAULT true NOT NULL,
    tick_retention_days integer DEFAULT 14 NOT NULL,
    checkpoint_interval_ms bigint DEFAULT 5000 NOT NULL,
    replay_buffer_size integer DEFAULT 5000 NOT NULL,
    batch_flush_ms integer DEFAULT 250 NOT NULL,
    auto_recover boolean DEFAULT true NOT NULL,
    gap_policy text DEFAULT 'RESUME_WITH_GAP'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_engine_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otc_engine_events (
    id bigint NOT NULL,
    symbol text DEFAULT ''::text NOT NULL,
    kind text NOT NULL,
    severity text DEFAULT 'INFO'::text NOT NULL,
    actor_id text,
    actor_role text DEFAULT ''::text NOT NULL,
    old_value text DEFAULT ''::text NOT NULL,
    new_value text DEFAULT ''::text NOT NULL,
    detail text DEFAULT '{}'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_engine_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otc_engine_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otc_engine_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otc_engine_events_id_seq OWNED BY public.otc_engine_events.id;


--
-- Name: otc_instruments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otc_instruments (
    id text NOT NULL,
    symbol text NOT NULL,
    display_name text NOT NULL,
    market_type text DEFAULT 'OTC'::text NOT NULL,
    base_asset text DEFAULT ''::text NOT NULL,
    quote_asset text DEFAULT ''::text NOT NULL,
    starting_price numeric(20,8) DEFAULT 1 NOT NULL,
    decimal_precision integer DEFAULT 5 NOT NULL,
    tick_interval_ms integer DEFAULT 1000 NOT NULL,
    volatility numeric(20,10) DEFAULT 0.00005 NOT NULL,
    spread numeric(20,10) DEFAULT 0.00004 NOT NULL,
    minimum_price_step numeric(20,10) DEFAULT 0.00001 NOT NULL,
    min_tick_move numeric(20,10) DEFAULT 0.00001 NOT NULL,
    max_tick_move numeric(20,10) DEFAULT 0.004 NOT NULL,
    mean_reversion numeric(20,10) DEFAULT 0.015 NOT NULL,
    payout_percentage numeric(6,2) DEFAULT 85 NOT NULL,
    min_stake numeric(18,2) DEFAULT 1 NOT NULL,
    max_stake numeric(18,2) DEFAULT 5000 NOT NULL,
    exposure_limit numeric(18,2) DEFAULT 0 NOT NULL,
    trading_status text DEFAULT 'ENABLED'::text NOT NULL,
    session_status text DEFAULT 'OPEN'::text NOT NULL,
    price_engine_status text DEFAULT 'STOPPED'::text NOT NULL,
    candle_status text DEFAULT 'IDLE'::text NOT NULL,
    seed_reference text DEFAULT ''::text NOT NULL,
    retention_days integer DEFAULT 14 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_market_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otc_market_state (
    symbol text NOT NULL,
    current_price numeric(20,8) DEFAULT 0 NOT NULL,
    bid numeric(20,8) DEFAULT 0 NOT NULL,
    ask numeric(20,8) DEFAULT 0 NOT NULL,
    sequence_number bigint DEFAULT 0 NOT NULL,
    regime_state text DEFAULT 'normal'::text NOT NULL,
    volatility_state numeric(20,10) DEFAULT 0 NOT NULL,
    prng_state text DEFAULT ''::text NOT NULL,
    seed_reference text DEFAULT ''::text NOT NULL,
    seed_rotated_at timestamp with time zone,
    last_tick_time bigint,
    engine_status text DEFAULT 'STOPPED'::text NOT NULL,
    leader_id text DEFAULT ''::text NOT NULL,
    leader_heartbeat timestamp with time zone,
    current_candle text DEFAULT '{}'::text NOT NULL,
    checkpoint_time timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_price_ticks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otc_price_ticks (
    id bigint NOT NULL,
    symbol text NOT NULL,
    "timestamp" bigint NOT NULL,
    sequence_number bigint NOT NULL,
    price numeric(20,8) NOT NULL,
    bid numeric(20,8) NOT NULL,
    ask numeric(20,8) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otc_price_ticks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otc_price_ticks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otc_price_ticks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otc_price_ticks_id_seq OWNED BY public.otc_price_ticks.id;


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id text NOT NULL,
    kind text DEFAULT 'CRYPTO'::text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    extra text DEFAULT ''::text NOT NULL,
    qr_data text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_events (
    id bigint NOT NULL,
    topic text NOT NULL,
    user_id text,
    payload text DEFAULT '{}'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_events_id_seq OWNED BY public.platform_events.id;


--
-- Name: security_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_logs (
    id text NOT NULL,
    user_id text,
    email text DEFAULT ''::text NOT NULL,
    event text NOT NULL,
    severity text DEFAULT 'INFO'::text NOT NULL,
    ip text DEFAULT ''::text NOT NULL,
    device text DEFAULT ''::text NOT NULL,
    user_agent text DEFAULT ''::text NOT NULL,
    meta text DEFAULT '{}'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    target_win_rate numeric(6,2) DEFAULT 30 NOT NULL,
    enable_force_loss boolean DEFAULT false NOT NULL,
    risk_engine_enabled boolean DEFAULT true NOT NULL,
    max_stake numeric(18,2) DEFAULT 5000 NOT NULL,
    min_stake numeric(18,2) DEFAULT 1 NOT NULL,
    min_deposit numeric(18,2) DEFAULT 10 NOT NULL,
    min_withdrawal numeric(18,2) DEFAULT 20 NOT NULL,
    withdrawal_needs_kyc boolean DEFAULT true NOT NULL,
    maintenance_mode boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    copy_trading_enabled boolean DEFAULT true NOT NULL,
    tournaments_enabled boolean DEFAULT true NOT NULL,
    leaderboard_enabled boolean DEFAULT true NOT NULL,
    sharp_trader_threshold numeric(6,2) DEFAULT 65 NOT NULL,
    settings_version integer DEFAULT 1 NOT NULL,
    asset_catalog_version integer DEFAULT 0 NOT NULL,
    affiliate_default_rate numeric(6,2) DEFAULT 40.00 NOT NULL,
    affiliate_enabled boolean DEFAULT true NOT NULL,
    gateway_providers jsonb DEFAULT '[]'::jsonb NOT NULL,
    auto_deposits_enabled boolean DEFAULT true NOT NULL,
    demo_gateway_enabled boolean DEFAULT true NOT NULL,
    chart_timer_bg text DEFAULT '#FFFFFF'::text NOT NULL
);


--
-- Name: tournament_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_entries (
    id text NOT NULL,
    tournament_id text NOT NULL,
    user_id text NOT NULL,
    pnl numeric(18,2) DEFAULT 0 NOT NULL,
    volume numeric(18,2) DEFAULT 0 NOT NULL,
    trades integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    prize numeric(18,2) DEFAULT 0 NOT NULL,
    final_rank integer,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    entry_fee numeric(18,2) DEFAULT 0 NOT NULL,
    prize_pool numeric(18,2) DEFAULT 0 NOT NULL,
    guaranteed numeric(18,2) DEFAULT 0 NOT NULL,
    account_type text DEFAULT 'DEMO'::text NOT NULL,
    status text DEFAULT 'SCHEDULED'::text NOT NULL,
    prize_split text DEFAULT '[50,30,20]'::text NOT NULL,
    max_players integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trades (
    id text NOT NULL,
    user_id text NOT NULL,
    symbol text NOT NULL,
    direction text NOT NULL,
    stake numeric(18,2) NOT NULL,
    payout_rate numeric(6,2) NOT NULL,
    duration_seconds integer NOT NULL,
    account_type text DEFAULT 'DEMO'::text NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    exit_price numeric(20,8),
    market_price numeric(20,8),
    status text DEFAULT 'OPEN'::text NOT NULL,
    profit numeric(18,2),
    is_adjusted boolean DEFAULT false NOT NULL,
    adjust_reason text DEFAULT ''::text NOT NULL,
    price_source text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    settled_at timestamp with time zone,
    copied_from text,
    tournament_id text,
    market_type text DEFAULT 'REAL'::text NOT NULL,
    entry_sequence bigint,
    settlement_sequence bigint,
    idempotency_key text
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    amount numeric(18,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    method text NOT NULL,
    reference text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    admin_note text DEFAULT ''::text NOT NULL,
    processed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    mode text DEFAULT 'MANUAL'::text NOT NULL,
    sender_account text DEFAULT ''::text NOT NULL,
    proof_image text DEFAULT ''::text NOT NULL,
    payment_method_id text,
    gateway_ref text DEFAULT ''::text NOT NULL,
    provider text DEFAULT ''::text NOT NULL,
    provider_order_id text DEFAULT ''::text NOT NULL,
    provider_event_id text DEFAULT ''::text NOT NULL,
    provider_status text DEFAULT ''::text NOT NULL,
    provider_payout_id text DEFAULT ''::text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    country text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'USER'::text NOT NULL,
    balance_real numeric(18,2) DEFAULT 0 NOT NULL,
    balance_demo numeric(18,2) DEFAULT 10000 NOT NULL,
    kyc_status text DEFAULT 'NONE'::text NOT NULL,
    custom_yield_ratio numeric(6,2),
    force_loss_user boolean DEFAULT false NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    token_version integer DEFAULT 1 NOT NULL,
    last_login_at timestamp with time zone,
    last_login_ip text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_leader boolean DEFAULT false NOT NULL,
    alias text DEFAULT ''::text NOT NULL,
    vip_tier text DEFAULT 'Standard'::text NOT NULL,
    risk_flag text DEFAULT ''::text NOT NULL,
    referral_code text,
    referred_by text,
    commission_rate numeric(6,2) DEFAULT 40.00 NOT NULL,
    affiliate_status text DEFAULT 'ACTIVE'::text NOT NULL,
    affiliate_balance numeric(18,2) DEFAULT 0.00 NOT NULL,
    affiliate_applied boolean DEFAULT false NOT NULL,
    gateway_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    totp_secret text DEFAULT ''::text NOT NULL,
    totp_enabled boolean DEFAULT false NOT NULL,
    totp_backup_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    login_alerts boolean DEFAULT false NOT NULL,
    deposit_limit numeric(18,2),
    self_exclusion_until timestamp with time zone,
    reality_check_minutes integer DEFAULT 0 NOT NULL
);


--
-- Name: vip_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vip_tiers (
    id text NOT NULL,
    name text NOT NULL,
    min_volume numeric(18,2) DEFAULT 0 NOT NULL,
    payout_bonus numeric(6,2) DEFAULT 0 NOT NULL,
    cashback_pct numeric(6,2) DEFAULT 0 NOT NULL,
    color text DEFAULT '#8892a6'::text NOT NULL,
    perks text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: market_ticks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_ticks ALTER COLUMN id SET DEFAULT nextval('market_ticks_id_seq'::regclass);


--
-- Name: otc_candles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_candles ALTER COLUMN id SET DEFAULT nextval('otc_candles_id_seq'::regclass);


--
-- Name: otc_engine_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_engine_events ALTER COLUMN id SET DEFAULT nextval('otc_engine_events_id_seq'::regclass);


--
-- Name: otc_price_ticks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_price_ticks ALTER COLUMN id SET DEFAULT nextval('otc_price_ticks_id_seq'::regclass);


--
-- Name: platform_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_events ALTER COLUMN id SET DEFAULT nextval('platform_events_id_seq'::regclass);


--
-- Name: affiliate_applications affiliate_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_applications
    ADD CONSTRAINT affiliate_applications_pkey PRIMARY KEY (id);


--
-- Name: affiliate_clicks affiliate_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_pkey PRIMARY KEY (id);


--
-- Name: affiliate_commissions affiliate_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_commissions
    ADD CONSTRAINT affiliate_commissions_pkey PRIMARY KEY (id);


--
-- Name: affiliate_payouts affiliate_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_payouts
    ADD CONSTRAINT affiliate_payouts_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (symbol);


--
-- Name: copy_links copy_links_follower_id_leader_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_links
    ADD CONSTRAINT copy_links_follower_id_leader_id_key UNIQUE (follower_id, leader_id);


--
-- Name: copy_links copy_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_links
    ADD CONSTRAINT copy_links_pkey PRIMARY KEY (id);


--
-- Name: device_fingerprints device_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_pkey PRIMARY KEY (id);


--
-- Name: device_fingerprints device_fingerprints_user_id_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_user_id_fingerprint_key UNIQUE (user_id, fingerprint);


--
-- Name: kyc_submissions kyc_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_submissions
    ADD CONSTRAINT kyc_submissions_pkey PRIMARY KEY (id);


--
-- Name: market_ticks market_ticks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_ticks
    ADD CONSTRAINT market_ticks_pkey PRIMARY KEY (id);


--
-- Name: markets markets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markets
    ADD CONSTRAINT markets_pkey PRIMARY KEY (id);


--
-- Name: markets markets_symbol_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markets
    ADD CONSTRAINT markets_symbol_key UNIQUE (symbol);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: otc_candles otc_candles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_candles
    ADD CONSTRAINT otc_candles_pkey PRIMARY KEY (id);


--
-- Name: otc_engine_config otc_engine_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_engine_config
    ADD CONSTRAINT otc_engine_config_pkey PRIMARY KEY (id);


--
-- Name: otc_engine_events otc_engine_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_engine_events
    ADD CONSTRAINT otc_engine_events_pkey PRIMARY KEY (id);


--
-- Name: otc_instruments otc_instruments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_instruments
    ADD CONSTRAINT otc_instruments_pkey PRIMARY KEY (id);


--
-- Name: otc_instruments otc_instruments_symbol_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_instruments
    ADD CONSTRAINT otc_instruments_symbol_key UNIQUE (symbol);


--
-- Name: otc_market_state otc_market_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_market_state
    ADD CONSTRAINT otc_market_state_pkey PRIMARY KEY (symbol);


--
-- Name: otc_price_ticks otc_price_ticks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otc_price_ticks
    ADD CONSTRAINT otc_price_ticks_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_code_key UNIQUE (code);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: platform_events platform_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_events
    ADD CONSTRAINT platform_events_pkey PRIMARY KEY (id);


--
-- Name: security_logs security_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_logs
    ADD CONSTRAINT security_logs_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tournament_entries tournament_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_entries
    ADD CONSTRAINT tournament_entries_pkey PRIMARY KEY (id);


--
-- Name: tournament_entries tournament_entries_tournament_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_entries
    ADD CONSTRAINT tournament_entries_tournament_id_user_id_key UNIQUE (tournament_id, user_id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vip_tiers vip_tiers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_tiers
    ADD CONSTRAINT vip_tiers_name_key UNIQUE (name);


--
-- Name: vip_tiers vip_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_tiers
    ADD CONSTRAINT vip_tiers_pkey PRIMARY KEY (id);


--
-- Name: idx_aff_apps; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aff_apps ON public.affiliate_applications USING btree (status, created_at DESC);


--
-- Name: idx_aff_clicks; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aff_clicks ON public.affiliate_clicks USING btree (referrer_id, created_at DESC);


--
-- Name: idx_aff_comm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aff_comm ON public.affiliate_commissions USING btree (referrer_id, created_at DESC);


--
-- Name: idx_aff_payouts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aff_payouts ON public.affiliate_payouts USING btree (status, created_at DESC);


--
-- Name: idx_copy_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_copy_leader ON public.copy_links USING btree (leader_id, is_active);


--
-- Name: idx_events_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_id ON public.platform_events USING btree (id DESC);


--
-- Name: idx_fp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fp ON public.device_fingerprints USING btree (fingerprint);


--
-- Name: idx_kyc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_status ON public.kyc_submissions USING btree (status, created_at DESC);


--
-- Name: idx_logs_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_time ON public.security_logs USING btree (created_at DESC);


--
-- Name: idx_markets_active_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markets_active_category ON public.markets USING btree (is_active, category, sort_order);


--
-- Name: idx_notif; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_otc_candles_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otc_candles_lookup ON public.otc_candles USING btree (symbol, timeframe, start_time DESC);


--
-- Name: idx_otc_candles_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_otc_candles_unique ON public.otc_candles USING btree (symbol, timeframe, start_time);


--
-- Name: idx_otc_events_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otc_events_symbol ON public.otc_engine_events USING btree (symbol, created_at DESC);


--
-- Name: idx_otc_events_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otc_events_time ON public.otc_engine_events USING btree (created_at DESC);


--
-- Name: idx_otc_instruments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otc_instruments_active ON public.otc_instruments USING btree (is_active, sort_order);


--
-- Name: idx_otc_ticks_symbol_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_otc_ticks_symbol_seq ON public.otc_price_ticks USING btree (symbol, sequence_number);


--
-- Name: idx_otc_ticks_symbol_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otc_ticks_symbol_ts ON public.otc_price_ticks USING btree (symbol, "timestamp" DESC);


--
-- Name: idx_ticks; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticks ON public.market_ticks USING btree (symbol, created_at DESC);


--
-- Name: idx_tour_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_status ON public.tournaments USING btree (status, starts_at DESC);


--
-- Name: idx_trades_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_trades_idempotency ON public.trades USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_trades_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_open ON public.trades USING btree (status, expires_at);


--
-- Name: idx_trades_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_symbol ON public.trades USING btree (symbol, created_at DESC);


--
-- Name: idx_trades_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trades_user ON public.trades USING btree (user_id, created_at DESC);


--
-- Name: idx_transactions_provider_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transactions_provider_event ON public.transactions USING btree (provider, provider_event_id) WHERE (provider_event_id <> ''::text);


--
-- Name: idx_transactions_provider_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transactions_provider_order ON public.transactions USING btree (provider, provider_order_id) WHERE (provider_order_id <> ''::text);


--
-- Name: idx_tx_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_status ON public.transactions USING btree (status, created_at DESC);


--
-- Name: affiliate_applications affiliate_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_applications
    ADD CONSTRAINT affiliate_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: affiliate_clicks affiliate_clicks_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: affiliate_commissions affiliate_commissions_referred_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_commissions
    ADD CONSTRAINT affiliate_commissions_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: affiliate_commissions affiliate_commissions_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_commissions
    ADD CONSTRAINT affiliate_commissions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: affiliate_payouts affiliate_payouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affiliate_payouts
    ADD CONSTRAINT affiliate_payouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: copy_links copy_links_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_links
    ADD CONSTRAINT copy_links_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: copy_links copy_links_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_links
    ADD CONSTRAINT copy_links_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: device_fingerprints device_fingerprints_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: kyc_submissions kyc_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_submissions
    ADD CONSTRAINT kyc_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: tournament_entries tournament_entries_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_entries
    ADD CONSTRAINT tournament_entries_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_entries tournament_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_entries
    ADD CONSTRAINT tournament_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: trades trades_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: affiliate_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: affiliate_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: copy_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.copy_links ENABLE ROW LEVEL SECURITY;

--
-- Name: device_fingerprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

--
-- Name: kyc_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: market_ticks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_ticks ENABLE ROW LEVEL SECURITY;

--
-- Name: markets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: otc_candles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otc_candles ENABLE ROW LEVEL SECURITY;

--
-- Name: otc_engine_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otc_engine_config ENABLE ROW LEVEL SECURITY;

--
-- Name: otc_engine_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otc_engine_events ENABLE ROW LEVEL SECURITY;

--
-- Name: otc_instruments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otc_instruments ENABLE ROW LEVEL SECURITY;

--
-- Name: otc_market_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otc_market_state ENABLE ROW LEVEL SECURITY;

--
-- Name: otc_price_ticks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otc_price_ticks ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

--
-- Name: security_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: tournaments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

--
-- Name: trades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: vip_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict X2pjo7uQ1CXGfEdLrGh6TG0eNn0l6E1ewXPvNe0TD8ILcFBL07qBNu5pFmB5Y3D

