-- BELMONTS Tech Arena - Supabase Database Schema
-- Migration: Create tables for game management with multiple game sections

-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET "app.settings.jwt_secret" TO 'your-jwt-secret-here';

-- 1. Game Rooms Table (NEW)
-- Stores admin-created game sections/rooms
CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL, -- 6-digit code for participants to join
    room_name TEXT NOT NULL,
    description TEXT,
    created_by TEXT DEFAULT 'admin',
    max_participants INTEGER DEFAULT 50,
    current_participants INTEGER DEFAULT 0,
    room_status TEXT DEFAULT 'waiting' CHECK (room_status IN ('waiting', 'active', 'completed', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Game Sessions Table (Enhanced)
-- Stores overall game state and session information linked to rooms
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    room_code TEXT REFERENCES game_rooms(room_code) ON DELETE CASCADE,
    game_state JSONB NOT NULL DEFAULT '{"phase":"lobby","currentLevel":1,"currentQuestion":0,"questionStartTime":null}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Players Table (Enhanced)
-- Stores player information and current session data linked to rooms
CREATE TABLE IF NOT EXISTS players (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id TEXT NOT NULL, -- Game-generated player ID (PL-xxxxxxx)
    name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    room_code TEXT REFERENCES game_rooms(room_code) ON DELETE CASCADE,
    player_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Full player object from game
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, session_id)
);

-- 4. Player Scores Table (Enhanced)
-- Stores individual level scores and completion data linked to rooms
CREATE TABLE IF NOT EXISTS player_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id TEXT NOT NULL, -- Reference to game player ID
    player_name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    room_code TEXT REFERENCES game_rooms(room_code) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 5),
    score INTEGER DEFAULT 0,
    time_spent INTEGER, -- Time in seconds
    score_details JSONB DEFAULT '{}'::jsonb, -- Level-specific data (answers, timing, etc.)
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Game Events Table (Enhanced)
-- Stores game events for analytics and debugging linked to rooms
-- 5. Game Events Table (Enhanced)
-- Stores game events for analytics and debugging linked to rooms
CREATE TABLE IF NOT EXISTS game_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    room_code TEXT REFERENCES game_rooms(room_code) ON DELETE CASCADE,
    player_id TEXT, -- NULL for admin events
    event_type TEXT NOT NULL, -- 'level_start', 'question_answer', 'admin_action', etc.
    event_data JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
-- Game Rooms indexes
CREATE INDEX IF NOT EXISTS idx_game_rooms_room_code ON game_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(room_status);
CREATE INDEX IF NOT EXISTS idx_game_rooms_created_at ON game_rooms(created_at DESC);

-- Game Sessions indexes  
CREATE INDEX IF NOT EXISTS idx_game_sessions_session_id ON game_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_code ON game_sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_updated_at ON game_sessions(updated_at DESC);

-- Players indexes
CREATE INDEX IF NOT EXISTS idx_players_session_id ON players(session_id);
CREATE INDEX IF NOT EXISTS idx_players_room_code ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_players_player_id ON players(player_id);
CREATE INDEX IF NOT EXISTS idx_players_created_at ON players(created_at DESC);

-- Player Scores indexes
CREATE INDEX IF NOT EXISTS idx_player_scores_session_id ON player_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_room_code ON player_scores(room_code);
CREATE INDEX IF NOT EXISTS idx_player_scores_player_id ON player_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_player_scores_level ON player_scores(level);
CREATE INDEX IF NOT EXISTS idx_player_scores_completed_at ON player_scores(completed_at DESC);

-- Game Events indexes
CREATE INDEX IF NOT EXISTS idx_game_events_session_id ON game_events(session_id);
CREATE INDEX IF NOT EXISTS idx_game_events_room_code ON game_events(room_code);
CREATE INDEX IF NOT EXISTS idx_game_events_player_id ON game_events(player_id);
CREATE INDEX IF NOT EXISTS idx_game_events_timestamp ON game_events(timestamp DESC);

-- Set up Row Level Security (RLS) policies
-- For now, allow all operations (you can restrict later based on your needs)
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- Create policies to allow anonymous access (since game doesn't have user auth)
CREATE POLICY "Allow anonymous access to game_rooms" ON game_rooms
    FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to game_sessions" ON game_sessions
    FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to players" ON players
    FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to player_scores" ON player_scores
    FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to game_events" ON game_events
    FOR ALL USING (true);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to generate room codes
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        -- Ensure code doesn't already exist
        IF NOT EXISTS (SELECT 1 FROM game_rooms WHERE room_code = code) THEN
            done := TRUE;
        END IF;
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to update participant count in game rooms
CREATE OR REPLACE FUNCTION update_room_participant_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE game_rooms 
        SET current_participants = current_participants + 1
        WHERE room_code = NEW.room_code;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE game_rooms 
        SET current_participants = GREATEST(0, current_participants - 1)
        WHERE room_code = OLD.room_code;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_game_rooms_updated_at 
    BEFORE UPDATE ON game_rooms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_sessions_updated_at 
    BEFORE UPDATE ON game_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_players_updated_at 
    BEFORE UPDATE ON players 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add triggers for participant counting
CREATE TRIGGER trigger_update_participant_count_insert
    AFTER INSERT ON players
    FOR EACH ROW EXECUTE FUNCTION update_room_participant_count();

CREATE TRIGGER trigger_update_participant_count_delete
    AFTER DELETE ON players
    FOR EACH ROW EXECUTE FUNCTION update_room_participant_count();

-- Create default game room
INSERT INTO game_rooms (room_code, room_name, description)
VALUES ('DEMO01', 'Default Game Room', 'Default game room for testing')
ON CONFLICT (room_code) DO NOTHING;

-- Insert initial game session linked to default room
INSERT INTO game_sessions (session_id, room_code, game_state)
VALUES ('default', 'DEMO01', '{"phase":"lobby","currentLevel":1,"currentQuestion":0,"questionStartTime":null}')
ON CONFLICT (session_id) DO NOTHING;

-- Grant necessary permissions to anon role
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Comments for documentation
COMMENT ON TABLE game_rooms IS 'Admin-created game sections/rooms for organizing multiple game sessions';
COMMENT ON TABLE game_sessions IS 'Stores game session state and configuration linked to game rooms';
COMMENT ON TABLE players IS 'Stores player information for current game sessions in specific rooms';
COMMENT ON TABLE player_scores IS 'Stores individual level completion scores and times by room';
COMMENT ON TABLE game_events IS 'Optional event logging for analytics and debugging by room';

COMMENT ON COLUMN game_rooms.room_code IS '6-character unique code for participants to join the room';
COMMENT ON COLUMN game_rooms.room_status IS 'Current status: waiting, active, completed, or closed';
COMMENT ON COLUMN game_sessions.game_state IS 'JSON object containing current game phase, level, and question state';
COMMENT ON COLUMN players.player_data IS 'Full player object including score, answers, and metadata';
COMMENT ON COLUMN player_scores.score_details IS 'Level-specific data like answers given, timing windows, etc.';
COMMENT ON COLUMN game_events.event_data IS 'Flexible JSON data for event context and details';