# BELMONTS: Tech Arena - Supabase Integration

This project has been integrated with Supabase for cloud database functionality, providing real-time data synchronization and persistent storage for game sessions, players, and scores.

## 🚀 Setup Instructions

### 1. Supabase Project Setup

Your Supabase project is already configured with:
- **Project URL**: `https://loosnbpmmjrwnfwkqxs.supabase.co`
- **API Key**: Already embedded in the code (anon key)

### 2. Database Migration

1. Open your [Supabase Dashboard](https://supabase.com/dashboard/projects)
2. Navigate to your project: `loosnbpmmjrwnfwkqxs`
3. Go to **SQL Editor** in the left sidebar
4. Copy the entire content of `supabase_migration.sql`
5. Paste it into the SQL Editor and click **Run**

This will create:
- `game_sessions` table for game state management
- `players` table for player information
- `player_scores` table for level completion data
- `game_events` table for optional event logging
- Proper indexes and Row Level Security policies

### 3. Verification

After running the migration:
1. Go to **Table Editor** in your Supabase dashboard
2. You should see 4 new tables created
3. The `game_sessions` table should have one default entry

## 🏗️ Architecture

### Hybrid Storage System
The game uses a **hybrid storage approach**:
- **Primary**: Supabase cloud database
- **Fallback**: Local localStorage (if Supabase fails)

### Data Flow
```
Game Actions → Storage Helper → Supabase API → PostgreSQL Database
                     ↓ (if fails)
                localStorage (backup)
```

### Database Schema

#### `game_sessions`
- Stores current game state (phase, level, question)
- Each session has a unique `session_id`
- JSON storage for flexible game state

#### `players` 
- Player roster for current session
- Includes player IDs, names, and complete player data
- Linked to session via `session_id`

#### `player_scores`
- Individual level completion records
- Stores score, time spent, and detailed results
- Permanent record of all attempts

#### `game_events` (Optional)
- Event logging for analytics
- Tracks admin actions, player interactions
- Useful for debugging and insights

## 🔧 Configuration

### Environment Variables
The Supabase configuration is embedded in `script.js`:
```javascript
const SUPABASE_URL = 'https://loosnbpmmjrwnfwkqxs.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### Row Level Security (RLS)
Current policies allow **anonymous access** for simplicity. In production, consider:
- Adding user authentication
- Restricting access by session
- Implementing admin-only operations

## 📊 Features

### Real-time Synchronization
- Admin changes sync to all participants
- Player roster updates in real-time
- Game state changes propagate automatically

### Score Tracking
- Permanent storage of all level attempts
- Detailed scoring with metadata
- Time tracking and performance analytics

### Offline Resilience
- Automatic fallback to localStorage
- Graceful degradation if Supabase is unavailable
- No data loss in offline scenarios

## 🔍 Usage

### Admin Functions
All admin functions now work with Supabase:
- `AdminController.setLevel()` - Updates game state in cloud
- `AdminController.addPlayer()` - Adds players to database
- `AdminController.resetEntireGame()` - Clears cloud data

### Player Functions 
- Join game → Creates database record
- Complete level → Saves score to `player_scores`
- View lobby → Syncs with database

### Monitoring
Check your Supabase dashboard to monitor:
- Real-time database activity
- API usage and performance
- Error logs and connection status

## 🛠️ Development

### Local Testing
The app works locally with Supabase integration:
1. Serve files with any HTTP server
2. Supabase calls work from any origin (CORS enabled)
3. Check browser console for connection status

### Error Handling
The system includes comprehensive error handling:
- Connection failures fall back to localStorage
- User-friendly error messages via Toast system
- Console logging for debugging

### Adding Features
To add new database operations:
1. Add method to `Storage` object in `script.js`
2. Follow async/await pattern
3. Include fallback to localStorage
4. Update database schema if needed

## 📈 Analytics (Optional)

Enable the `game_events` table to track:
- Player join/leave events
- Level completion times
- Admin actions and timing
- Performance metrics

Add event logging:
```javascript
// Example: Log level completion
await Storage.logEvent('level_complete', {
    level: 1,
    score: 150,
    timeSpent: 300
});
```

## 🔒 Security Notes

Current setup uses **anonymous access** for simplicity. For production:

1. **Enable proper authentication**:
   - Add user login system
   - Use authenticated users instead of anon
   
2. **Tighten RLS policies**:
   - Restrict access by user/session
   - Add admin role checks
   
3. **Environment variables**:
   - Move sensitive keys to environment
   - Use different keys for dev/prod

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify Supabase dashboard shows your data
3. Test with localStorage fallback by disabling network
4. Check Supabase project status and API limits

---

**Your game now has cloud persistence! 🚀**

All player data, scores, and game state automatically sync across all connected devices.