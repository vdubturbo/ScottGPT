#!/bin/bash

# Start both frontend and backend servers
echo "🚀 Starting ScottGPT development servers..."

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend server
echo "📡 Starting backend server on port 3005..."
node server.js > backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start and check if it's running
echo "⏳ Waiting for backend to start..."
for i in {1..10}; do
    if lsof -i:3005 > /dev/null 2>&1; then
        echo "✅ Backend server started successfully on port 3005"
        break
    fi
    sleep 1
done

# Check if backend started successfully
if ! lsof -i:3005 > /dev/null 2>&1; then
    echo "❌ Backend server failed to start. Check backend.log for errors."
    cat backend.log
    exit 1
fi

# Start frontend server
echo "🌐 Starting frontend server on port 3004..."
cd client && npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
echo "⏳ Waiting for frontend to start..."
for i in {1..15}; do
    if lsof -i:3004 > /dev/null 2>&1; then
        echo "✅ Frontend server started successfully on port 3004"
        break
    fi
    sleep 1
done

echo "🎉 Both servers are running!"
echo "📡 Backend: http://localhost:3005"
echo "🌐 Frontend: http://localhost:3004"
echo "Press Ctrl+C to stop both servers"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
