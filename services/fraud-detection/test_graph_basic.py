#!/usr/bin/env python3
"""
Basic test runner for graph model functionality
Tests core functionality without requiring external dependencies
"""

import sys
import os
import traceback
from datetime import datetime, timedelta

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_basic_functionality():
    """Test basic graph model functionality"""
    print("Testing basic graph model functionality...")
    
    try:
        from models.graph_model import TransactionGraph, CommunityDetector, GraphAnalysisService
        print("✓ Successfully imported graph model classes")
    except ImportError as e:
        print(f"✗ Failed to import graph model classes: {e}")
        return False
    
    # Test TransactionGraph
    try:
        graph = TransactionGraph(max_nodes=100, time_window_hours=24)
        print("✓ TransactionGraph initialized successfully")
        
        # Test adding transactions
        timestamp = datetime.utcnow()
        graph.add_transaction("wallet_1", "wallet_2", 100.0, timestamp, "tx_001")
        
        if graph.graph.number_of_nodes() == 2 and graph.graph.number_of_edges() == 1:
            print("✓ Transaction added successfully")
        else:
            print("✗ Transaction not added correctly")
            return False
            
        # Test node features
        if "wallet_1" in graph.node_features and "wallet_2" in graph.node_features:
            print("✓ Node features created successfully")
        else:
            print("✗ Node features not created")
            return False
            
    except Exception as e:
        print(f"✗ TransactionGraph test failed: {e}")
        traceback.print_exc()
        return False
    
    # Test CommunityDetector
    try:
        detector = CommunityDetector()
        print("✓ CommunityDetector initialized successfully")
        
        # Test with simple graph
        communities = detector.detect_communities(graph.graph)
        if isinstance(communities, dict):
            print("✓ Community detection completed")
        else:
            print("✗ Community detection failed")
            return False
            
    except Exception as e:
        print(f"✗ CommunityDetector test failed: {e}")
        traceback.print_exc()
        return False
    
    # Test GraphAnalysisService
    try:
        service = GraphAnalysisService(max_graph_size=100)
        print("✓ GraphAnalysisService initialized successfully")
        
        # Test transaction analysis
        transaction_data = {
            'fromWallet': 'user_1',
            'toWallet': 'user_2',
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'transactionId': 'tx_001',
            'metadata': {'category': 'payment'}
        }
        
        score = service.analyze_transaction_network('user_1', transaction_data)
        
        if isinstance(score, float) and 0.0 <= score <= 1.0:
            print(f"✓ Transaction analysis completed (score: {score:.3f})")
        else:
            print(f"✗ Transaction analysis returned invalid score: {score}")
            return False
            
    except Exception as e:
        print(f"✗ GraphAnalysisService test failed: {e}")
        traceback.print_exc()
        return False
    
    return True

def test_suspicious_pattern_detection():
    """Test suspicious pattern detection"""
    print("\nTesting suspicious pattern detection...")
    
    try:
        from models.graph_model import GraphAnalysisService
        
        service = GraphAnalysisService(max_graph_size=100)
        
        # Create a suspicious transaction pattern (money laundering ring)
        ring_transactions = [
            ('launderer_1', 'launderer_2', 10000.0),
            ('launderer_2', 'launderer_3', 9500.0),
            ('launderer_3', 'launderer_4', 9000.0),
            ('launderer_4', 'launderer_1', 8500.0),  # Complete the ring
        ]
        
        scores = []
        for i, (from_w, to_w, amount) in enumerate(ring_transactions):
            transaction_data = {
                'fromWallet': from_w,
                'toWallet': to_w,
                'amount': amount,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'transactionId': f'ring_tx_{i:03d}',
                'metadata': {'category': 'transfer'}
            }
            
            score = service.analyze_transaction_network(from_w, transaction_data)
            scores.append(score)
        
        # Later transactions in the ring should have higher scores
        if any(score > 0.3 for score in scores):
            print("✓ Suspicious pattern detection working (detected high-risk transactions)")
        else:
            print(f"✗ Suspicious pattern detection may not be working (max score: {max(scores):.3f})")
            return False
            
        # Test pattern detection methods
        patterns = service.detect_suspicious_patterns('launderer_1', ring_transactions[0])
        if isinstance(patterns, dict) and len(patterns) > 0:
            print("✓ Pattern detection methods working")
            print(f"  Detected patterns: {list(patterns.keys())}")
        else:
            print("✗ Pattern detection methods not working")
            return False
            
    except Exception as e:
        print(f"✗ Suspicious pattern detection test failed: {e}")
        traceback.print_exc()
        return False
    
    return True

def test_real_time_monitoring():
    """Test real-time monitoring functionality"""
    print("\nTesting real-time monitoring...")
    
    try:
        from models.graph_model import GraphAnalysisService
        
        service = GraphAnalysisService(max_graph_size=100)
        
        # Add some transactions
        for i in range(5):
            transaction_data = {
                'fromWallet': f'user_{i}',
                'toWallet': f'user_{i+1}',
                'amount': 100.0 + i * 50,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'transactionId': f'monitor_tx_{i:03d}',
                'metadata': {'category': 'test'}
            }
            
            service.analyze_transaction_network(f'user_{i}', transaction_data)
        
        # Test real-time monitoring
        monitoring_result = service.monitor_real_time_patterns()
        
        if isinstance(monitoring_result, dict) and 'timestamp' in monitoring_result:
            print("✓ Real-time monitoring working")
            print(f"  Graph stats: {monitoring_result.get('graph_stats', {})}")
            print(f"  Alerts: {len(monitoring_result.get('alerts', []))}")
        else:
            print("✗ Real-time monitoring not working")
            return False
            
    except Exception as e:
        print(f"✗ Real-time monitoring test failed: {e}")
        traceback.print_exc()
        return False
    
    return True

def main():
    """Run all tests"""
    print("=" * 60)
    print("Graph Model Basic Functionality Tests")
    print("=" * 60)
    
    tests = [
        test_basic_functionality,
        test_suspicious_pattern_detection,
        test_real_time_monitoring
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
                print("✓ Test passed\n")
            else:
                print("✗ Test failed\n")
        except Exception as e:
            print(f"✗ Test crashed: {e}\n")
            traceback.print_exc()
    
    print("=" * 60)
    print(f"Test Results: {passed}/{total} tests passed")
    print("=" * 60)
    
    if passed == total:
        print("🎉 All tests passed!")
        return True
    else:
        print("❌ Some tests failed")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)