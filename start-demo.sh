#!/bin/bash

echo "🚀 Starting EchoPay Demo Environment"
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing wallet interface dependencies..."
cd services/wallet-interface
npm install

echo "🌐 Starting wallet interface on http://localhost:3000"
echo ""
echo "🎥 Demo URLs for your video:"
echo "   Main Wallet: http://localhost:3000/index.html"
echo "   Login Page: http://localhost:3000/login.html"
echo "   Multi-Wallet: http://localhost:3000/multi-wallet.html"
echo "   Device Management: http://localhost:3000/device-management.html"
echo "   Fraud Reporting: http://localhost:3000/fraud-report.html"
echo "   Fraud Tracker: http://localhost:3000/fraud-case-tracker.html"
echo "   Reversal History: http://localhost:3000/reversal-history.html"
echo ""
echo "📝 Press Ctrl+C to stop the demo"
echo ""

# Start the wallet interface
npm start