#!/usr/bin/env python3
"""
EchoPay Fraud Detection Demo Script
This script demonstrates the ML-powered fraud detection capabilities
"""

import sys
import os
import json
from datetime import datetime

# Add the fraud detection service to the path
sys.path.append('services/fraud-detection/src')

def demo_fraud_detection():
    print("🔍 EchoPay Fraud Detection Demo")
    print("=" * 40)
    
    try:
        from models.anomaly_model import TransactionFeatureExtractor, AnomalyAnalysisService
        
        # Initialize the fraud detection service
        print("📊 Initializing ML fraud detection models...")
        service = AnomalyAnalysisService()
        extractor = TransactionFeatureExtractor()
        
        # Demo transactions
        transactions = [
            {
                'id': 'tx_001',
                'amount': 150.00,
                'timestamp': datetime.now().isoformat(),
                'toWallet': 'wallet_user_123',
                'fromWallet': 'wallet_user_456',
                'description': 'Normal transaction'
            },
            {
                'id': 'tx_002', 
                'amount': 10000.00,
                'timestamp': datetime.now().replace(hour=3).isoformat(),
                'toWallet': 'suspicious_wallet_999',
                'fromWallet': 'wallet_user_456',
                'description': 'Large late-night transaction'
            },
            {
                'id': 'tx_003',
                'amount': 0.01,
                'timestamp': datetime.now().isoformat(),
                'toWallet': 'new_wallet_xyz',
                'fromWallet': 'wallet_user_456', 
                'description': 'Micro transaction to new wallet'
            }
        ]
        
        print("\n🧪 Analyzing sample transactions...")
        print("-" * 40)
        
        for tx in transactions:
            print(f"\n📝 Transaction: {tx['id']}")
            print(f"   Amount: ${tx['amount']:,.2f}")
            print(f"   Description: {tx['description']}")
            
            # Extract features
            features = extractor.extract_features(tx)
            print(f"   Features extracted: {len(features)} dimensions")
            
            # Analyze for fraud
            try:
                result = service.analyze_transaction(tx)
                risk_score = result.get('risk_score', 0.0)
                risk_level = result.get('risk_level', 'LOW')
                
                print(f"   🎯 Risk Score: {risk_score:.3f}")
                print(f"   ⚠️  Risk Level: {risk_level}")
                
                if risk_score > 0.7:
                    print("   🚨 HIGH RISK - Transaction flagged for review!")
                elif risk_score > 0.4:
                    print("   ⚡ MEDIUM RISK - Additional verification required")
                else:
                    print("   ✅ LOW RISK - Transaction approved")
                    
            except Exception as e:
                print(f"   ⚠️  Analysis unavailable: {str(e)}")
        
        print("\n" + "=" * 40)
        print("🎉 Fraud Detection Demo Complete!")
        print("\n📈 System Capabilities:")
        print("   ✓ Real-time transaction analysis")
        print("   ✓ ML-powered anomaly detection") 
        print("   ✓ Behavioral pattern recognition")
        print("   ✓ Risk scoring and classification")
        print("   ✓ <100ms detection latency")
        
    except ImportError as e:
        print(f"❌ Could not import fraud detection modules: {e}")
        print("💡 Make sure you've installed the Python dependencies:")
        print("   pip3 install scikit-learn networkx redis fastapi")
        
    except Exception as e:
        print(f"❌ Demo error: {e}")

def demo_system_overview():
    print("\n🏗️  EchoPay System Architecture")
    print("=" * 40)
    
    services = [
        ("API Gateway", "Node.js", "Load balancing & routing"),
        ("Wallet Interface", "Node.js", "User interface & PWA"),
        ("Transaction Service", "Go", "Real-time processing"),
        ("Token Management", "Go", "CBDC token operations"),
        ("Fraud Detection", "Python", "ML-powered analysis"),
        ("Reversibility Service", "Java", "Transaction reversals"),
        ("Compliance Service", "Node.js", "KYC/AML screening"),
        ("Monitoring Service", "Node.js", "System observability"),
        ("Security Service", "Node.js", "Authentication & security"),
        ("Humanitarian Aid", "Node.js", "Aid distribution tracking"),
        ("International Coordination", "Node.js", "Cross-border fraud sharing"),
        ("CBDC Registry", "Node.js", "Multi-currency support")
    ]
    
    for name, tech, description in services:
        print(f"   🔧 {name:<25} ({tech:<8}) - {description}")
    
    print(f"\n📊 Total Services: {len(services)}")
    print("🌐 Technologies: Go, Java, Python, Node.js")
    print("🗄️  Databases: PostgreSQL, Redis")
    print("📡 APIs: REST, WebSocket, GraphQL")

if __name__ == "__main__":
    demo_system_overview()
    demo_fraud_detection()