#!/bin/bash
# WiseRavenShare Desktop Players Setup Script
# Installs dependencies and runs the players

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎵 WiseRavenShare Desktop Players Setup"
echo "========================================"

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "   Install from https://www.python.org/"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "✅ Python $PYTHON_VERSION found"

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate || . venv/Scripts/activate 2>/dev/null || true

# Install/upgrade dependencies
echo "📚 Installing dependencies..."
pip install --upgrade pip setuptools wheel > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1

# Check VLC installation
echo "🎬 Checking VLC installation..."
if ! command -v vlc &> /dev/null; then
    echo "⚠️  VLC is not installed. Install it for full codec support:"
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "   Ubuntu/Debian: sudo apt-get install vlc"
        echo "   Fedora/RHEL: sudo dnf install vlc"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   macOS: brew install vlc"
    elif [[ "$OSTYPE" == "msys" ]]; then
        echo "   Windows: Download from https://www.videolan.org/vlc/"
    fi
fi

# Show player options
echo ""
echo "🎮 Select player to run:"
echo "  1) Audio Player"
echo "  2) Video Player"
echo "  3) Both (in separate windows)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo "🎵 Starting Audio Player..."
        python3 audio_player.py
        ;;
    2)
        echo "🎬 Starting Video Player..."
        python3 video_player.py
        ;;
    3)
        echo "🎵 Starting Audio Player..."
        python3 audio_player.py &
        AUDIO_PID=$!
        sleep 1
        echo "🎬 Starting Video Player..."
        python3 video_player.py &
        VIDEO_PID=$!
        echo ""
        echo "Both players started in background."
        echo "Press Ctrl+C to stop all players."
        wait
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
