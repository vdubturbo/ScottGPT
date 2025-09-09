#!/bin/bash

# Kill any processes using port 3005 (backend)
echo "🔍 Checking for processes on port 3005..."
if lsof -ti :3005 > /dev/null 2>&1; then
    echo "⚠️  Found process on port 3005, killing it..."
    lsof -ti :3005 | xargs kill -9 2>/dev/null
    echo "✅ Port 3005 cleared"
else
    echo "✅ Port 3005 is available"
fi

# Kill any processes using port 3004 (frontend)
echo "🔍 Checking for processes on port 3004..."
if lsof -ti :3004 > /dev/null 2>&1; then
    echo "⚠️  Found process on port 3004, killing it..."
    lsof -ti :3004 | xargs kill -9 2>/dev/null
    echo "✅ Port 3004 cleared"
else
    echo "✅ Port 3004 is available"
fi

# Small delay to ensure ports are fully released
sleep 1

echo "🚀 Starting development servers..."
npx concurrently "nodemon server.js" "cd client && npm start"