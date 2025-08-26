#!/bin/bash

echo "🚀 Starting EchoPay Simple Demo"
echo "==============================="

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python is not installed. Please install Python first."
    exit 1
fi

echo "📁 Serving wallet interface files..."
cd services/wallet-interface/src/public

echo ""
echo "🌐 EchoPay Demo is now running at:"
echo "   http://localhost:8000"
echo ""
echo "🎥 Demo URLs for your video (NO LOGIN REQUIRED):"
echo "   Main Dashboard: http://localhost:8000/demo-index.html"
echo "   Multi-Wallet: http://localhost:8000/demo-multi-wallet.html"
echo "   Fraud Reporting: http://localhost:8000/demo-fraud-report.html"
echo "   Fraud Case Tracker: http://localhost:8000/demo-fraud-case-tracker.html"
echo "   Device Management: http://localhost:8000/device-management.html"
echo "   Reversal History: http://localhost:8000/reversal-history.html"
echo ""
echo "📝 Press Ctrl+C to stop the demo"
echo ""

# Start simple HTTP server
$PYTHON_CMD -m http.server 8000