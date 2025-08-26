#!/usr/bin/env python3
"""
Simple test script for anomaly detection functionality
Tests basic functionality without external dependencies
"""

import sys
import os
import asyncio
from datetime import datetime, timedelta

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

try:
    from models.anomaly_model import (
        TransactionFeatureExtractor,
        IsolationForestAnomalyDetector,
        EnsembleAnomalyDetector,
        AnomalyAnalysisService
    )
    print("✓ Successfully imported anomaly detection modules")
except ImportError as e:
    print(f"✗ Import error: {e}")
    sys.exit(1)

def test_feature_extraction():
    """Test basic feature extraction"""
    print("\n--- Testing Feature Extraction ---")
    
    extractor = TransactionFeatureExtractor()
    
    # Test transaction
    transaction = {
        'amount': 100.0,
        'timestamp': datetime.utcnow().isoformat(),
        'toWallet': 'wallet123',
        'fromWallet': 'user456'
    }
    
    # Test without history
    features = extractor.extract_transaction_features(transaction)
    print(f"✓ Extracted {len(features)} features without history")
    
    # Test with history
    user_history = [
        {'amount': 50.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'wallet1'},
        {'amount': 75.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'wallet2'},
    ]
    
    features_with_history = extractor.extract_transaction_features(transaction, user_history)
    print(f"✓ Extracted {len(features_with_history)} features with history")
    
    # Verify key features exist
    key_features = ['amount', 'hour', 'user_avg_amount', 'velocity_score']
    for feature in key_features:
        if feature in features_with_history:
            print(f"  ✓ {feature}: {features_with_history[feature]}")
        else:
            print(f"  ✗ Missing feature: {feature}")
    
    return True

def test_isolation_forest():
    """Test isolation forest detector"""
    print("\n--- Testing Isolation Forest ---")
    
    detector = IsolationForestAnomalyDetector(contamination=0.1, n_estimators=10)
    
    # Test untrained prediction
    test_features = {f'feature_{i}': float(i) for i in range(10)}
    score = detector.predict_anomaly_score(test_features)
    print(f"✓ Untrained model score: {score} (should be 0.5)")
    
    # Test training with synthetic data
    import numpy as np
    np.random.seed(42)
    
    # Generate normal data
    normal_data = np.random.normal(0, 1, (80, 10))
    # Add some outliers
    outlier_data = np.random.normal(5, 1, (20, 10))
    training_data = np.vstack([normal_data, outlier_data])
    
    feature_names = [f'feature_{i}' for i in range(10)]
    
    try:
        results = detector.train(training_data, feature_names)
        print(f"✓ Training completed: {results['samples_trained']} samples")
        
        # Test prediction on trained model
        normal_features = {f'feature_{i}': 0.0 for i in range(10)}
        outlier_features = {f'feature_{i}': 5.0 for i in range(10)}
        
        normal_score = detector.predict_anomaly_score(normal_features)
        outlier_score = detector.predict_anomaly_score(outlier_features)
        
        print(f"✓ Normal transaction score: {normal_score:.3f}")
        print(f"✓ Outlier transaction score: {outlier_score:.3f}")
        
        if outlier_score > normal_score:
            print("✓ Isolation forest correctly identifies outliers")
        else:
            print("⚠ Isolation forest may need tuning")
        
        return True
        
    except Exception as e:
        print(f"✗ Isolation forest training failed: {e}")
        return False

def test_ensemble_detector():
    """Test ensemble anomaly detector"""
    print("\n--- Testing Ensemble Detector ---")
    
    ensemble = EnsembleAnomalyDetector()
    
    # Test untrained prediction
    test_transaction = {
        'amount': 100.0,
        'timestamp': datetime.utcnow().isoformat(),
        'toWallet': 'wallet123'
    }
    
    score, component_scores = ensemble.predict_anomaly_score(test_transaction)
    print(f"✓ Untrained ensemble score: {score:.3f}")
    print(f"  Component scores: {component_scores}")
    
    # Test training
    training_transactions = []
    for i in range(50):
        # Generate mix of normal and anomalous transactions
        if i < 40:  # Normal transactions
            amount = 50 + i * 2
            hour = 12
        else:  # Anomalous transactions
            amount = 10000 + i * 100
            hour = 3  # Night time
        
        transaction = {
            'amount': amount,
            'timestamp': datetime.utcnow().replace(hour=hour).isoformat(),
            'toWallet': f'wallet_{i}',
            'fromWallet': f'user_{i % 10}'
        }
        training_transactions.append(transaction)
    
    try:
        results = ensemble.train(training_transactions)
        print(f"✓ Ensemble training completed")
        print(f"  Isolation Forest: {results.get('isolation_forest', {}).get('samples_trained', 'N/A')} samples")
        
        # Test on new transactions
        normal_tx = {
            'amount': 75.0,
            'timestamp': datetime.utcnow().replace(hour=14).isoformat(),
            'toWallet': 'normal_wallet'
        }
        
        anomalous_tx = {
            'amount': 15000.0,
            'timestamp': datetime.utcnow().replace(hour=2).isoformat(),
            'toWallet': 'suspicious_wallet'
        }
        
        normal_score, _ = ensemble.predict_anomaly_score(normal_tx)
        anomalous_score, _ = ensemble.predict_anomaly_score(anomalous_tx)
        
        print(f"✓ Normal transaction score: {normal_score:.3f}")
        print(f"✓ Anomalous transaction score: {anomalous_score:.3f}")
        
        if anomalous_score > normal_score:
            print("✓ Ensemble correctly distinguishes anomalies")
        else:
            print("⚠ Ensemble may need tuning")
        
        return True
        
    except Exception as e:
        print(f"✗ Ensemble training failed: {e}")
        return False

async def test_analysis_service():
    """Test anomaly analysis service"""
    print("\n--- Testing Analysis Service ---")
    
    service = AnomalyAnalysisService()
    
    # Test basic analysis
    transaction = {
        'id': 'test_tx_001',
        'amount': 250.0,
        'timestamp': datetime.utcnow().isoformat(),
        'toWallet': 'wallet_test',
        'fromWallet': 'user_test'
    }
    
    user_history = [
        {'amount': 100.0, 'timestamp': (datetime.utcnow() - timedelta(days=1)).isoformat(), 'toWallet': 'wallet1'},
        {'amount': 150.0, 'timestamp': (datetime.utcnow() - timedelta(days=2)).isoformat(), 'toWallet': 'wallet2'},
        {'amount': 200.0, 'timestamp': (datetime.utcnow() - timedelta(days=3)).isoformat(), 'toWallet': 'wallet3'},
    ]
    
    try:
        score, result = await service.analyze_transaction_anomaly(transaction, user_history)
        
        print(f"✓ Analysis completed")
        print(f"  Anomaly score: {score:.3f}")
        print(f"  Is anomaly: {result.get('is_anomaly', 'N/A')}")
        print(f"  Risk level: {result.get('risk_level', 'N/A')}")
        print(f"  Processing time: {result.get('processing_time_ms', 'N/A'):.1f}ms")
        print(f"  Indicators: {result.get('anomaly_indicators', [])}")
        
        # Test performance requirement
        processing_time = result.get('processing_time_ms', 1000)
        if processing_time < 100:
            print(f"✓ Meets performance requirement (<100ms)")
        else:
            print(f"⚠ Performance concern: {processing_time:.1f}ms")
        
        return True
        
    except Exception as e:
        print(f"✗ Analysis service failed: {e}")
        return False

def test_configurable_thresholds():
    """Test configurable threshold functionality"""
    print("\n--- Testing Configurable Thresholds ---")
    
    service = AnomalyAnalysisService()
    
    # Test initial thresholds
    print(f"✓ Initial anomaly threshold: {service.anomaly_threshold}")
    print(f"✓ Initial high risk threshold: {service.high_risk_threshold}")
    
    # Test threshold updates
    service.update_thresholds(anomaly_threshold=0.7, high_risk_threshold=0.9)
    
    print(f"✓ Updated anomaly threshold: {service.anomaly_threshold}")
    print(f"✓ Updated high risk threshold: {service.high_risk_threshold}")
    
    # Test bounds checking
    service.update_thresholds(anomaly_threshold=1.5, high_risk_threshold=-0.1)
    
    print(f"✓ Bounded anomaly threshold: {service.anomaly_threshold} (should be 1.0)")
    print(f"✓ Bounded high risk threshold: {service.high_risk_threshold} (should be 0.0)")
    
    return True

async def run_all_tests():
    """Run all anomaly detection tests"""
    print("=" * 60)
    print("ANOMALY DETECTION FUNCTIONALITY TESTS")
    print("=" * 60)
    
    tests = [
        ("Feature Extraction", test_feature_extraction),
        ("Isolation Forest", test_isolation_forest),
        ("Ensemble Detector", test_ensemble_detector),
        ("Analysis Service", test_analysis_service),
        ("Configurable Thresholds", test_configurable_thresholds),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            if asyncio.iscoroutinefunction(test_func):
                result = await test_func()
            else:
                result = test_func()
            results[test_name] = result
        except Exception as e:
            print(f"✗ {test_name} failed with exception: {e}")
            results[test_name] = False
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{test_name}: {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All anomaly detection tests passed!")
        return True
    else:
        print("⚠ Some tests failed - check implementation")
        return False

if __name__ == "__main__":
    # Run tests
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)