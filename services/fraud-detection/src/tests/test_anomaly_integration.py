"""
Integration tests for anomaly detection ensemble model
Tests the complete integration of isolation forest, statistical, and rule-based detection
"""

import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any

from models.anomaly_model import (
    AnomalyAnalysisService,
    EnsembleAnomalyDetector,
    TransactionFeatureExtractor,
    IsolationForestAnomalyDetector,
    StatisticalAnomalyDetector,
    RuleBasedAnomalyDetector
)

class AnomalyIntegrationTest:
    """Integration test suite for anomaly detection"""
    
    def __init__(self):
        self.service = AnomalyAnalysisService()
        self.ensemble = EnsembleAnomalyDetector()
        
    def generate_normal_transactions(self, count: int = 100) -> List[Dict[str, Any]]:
        """Generate normal transaction patterns"""
        transactions = []
        
        for i in range(count):
            # Normal amounts: mostly between $10-$500
            amount = np.random.lognormal(mean=3.5, sigma=0.8)
            amount = max(10.0, min(500.0, amount))
            
            # Normal business hours (9 AM - 6 PM)
            hour = np.random.randint(9, 18)
            base_time = datetime.utcnow().replace(hour=hour, minute=np.random.randint(0, 60))
            
            transaction = {
                'id': f'normal_tx_{i}',
                'amount': round(amount, 2),
                'timestamp': base_time.isoformat(),
                'toWallet': f'wallet_{np.random.randint(1, 20)}',  # Limited recipient pool
                'fromWallet': f'user_{np.random.randint(1, 10)}'
            }
            
            transactions.append(transaction)
        
        return transactions
    
    def generate_anomalous_transactions(self, count: int = 20) -> List[Dict[str, Any]]:
        """Generate clearly anomalous transaction patterns"""
        transactions = []
        
        anomaly_patterns = [
            # Large amounts
            lambda i: {
                'id': f'anomaly_large_{i}',
                'amount': np.random.uniform(10000, 50000),
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'new_wallet_{i}',
                'fromWallet': f'user_{np.random.randint(1, 5)}'
            },
            # Micro amounts (potential testing)
            lambda i: {
                'id': f'anomaly_micro_{i}',
                'amount': np.random.uniform(0.01, 0.99),
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'test_wallet_{i}',
                'fromWallet': f'user_{np.random.randint(1, 5)}'
            },
            # Night transactions
            lambda i: {
                'id': f'anomaly_night_{i}',
                'amount': np.random.uniform(100, 1000),
                'timestamp': datetime.utcnow().replace(hour=3, minute=np.random.randint(0, 60)).isoformat(),
                'toWallet': f'night_wallet_{i}',
                'fromWallet': f'user_{np.random.randint(1, 5)}'
            },
            # Round amounts (potentially suspicious)
            lambda i: {
                'id': f'anomaly_round_{i}',
                'amount': float(np.random.choice([100, 500, 1000, 5000])),
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'round_wallet_{i}',
                'fromWallet': f'user_{np.random.randint(1, 5)}'
            }
        ]
        
        for i in range(count):
            pattern = np.random.choice(anomaly_patterns)
            transaction = pattern(i)
            transactions.append(transaction)
        
        return transactions
    
    def generate_user_history_for_transaction(self, transaction: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate realistic user history for a transaction"""
        user_id = transaction['fromWallet']
        current_amount = transaction['amount']
        
        # Generate history that makes current transaction more or less anomalous
        history = []
        base_time = datetime.utcnow()
        
        # For normal users, generate consistent patterns
        if 'normal' in transaction['id']:
            # Consistent spending pattern
            avg_amount = np.random.uniform(50, 200)
            for i in range(np.random.randint(5, 15)):
                amount = max(10.0, np.random.normal(avg_amount, avg_amount * 0.3))
                time_offset = timedelta(days=np.random.exponential(1), hours=np.random.randint(0, 24))
                
                history.append({
                    'amount': round(amount, 2),
                    'timestamp': (base_time - time_offset).isoformat(),
                    'toWallet': f'wallet_{np.random.randint(1, 10)}',
                    'fromWallet': user_id
                })
        
        # For anomalous transactions, generate contrasting history
        else:
            if current_amount > 1000:  # Large amount anomaly
                # History of small amounts
                for i in range(np.random.randint(3, 8)):
                    amount = np.random.uniform(20, 100)
                    time_offset = timedelta(days=np.random.exponential(2), hours=np.random.randint(0, 24))
                    
                    history.append({
                        'amount': round(amount, 2),
                        'timestamp': (base_time - time_offset).isoformat(),
                        'toWallet': f'wallet_{np.random.randint(1, 5)}',
                        'fromWallet': user_id
                    })
            
            elif current_amount < 1:  # Micro amount anomaly
                # History of normal amounts
                for i in range(np.random.randint(2, 6)):
                    amount = np.random.uniform(50, 300)
                    time_offset = timedelta(days=np.random.exponential(3), hours=np.random.randint(0, 24))
                    
                    history.append({
                        'amount': round(amount, 2),
                        'timestamp': (base_time - time_offset).isoformat(),
                        'toWallet': f'wallet_{np.random.randint(1, 8)}',
                        'fromWallet': user_id
                    })
        
        return sorted(history, key=lambda x: x['timestamp'])
    
    def test_ensemble_training(self) -> bool:
        """Test that ensemble can be trained successfully"""
        print("Testing ensemble training...")
        
        # Generate training data
        normal_transactions = self.generate_normal_transactions(80)
        anomalous_transactions = self.generate_anomalous_transactions(20)
        all_transactions = normal_transactions + anomalous_transactions
        
        # Train ensemble
        try:
            results = self.ensemble.train(all_transactions)
            
            # Check training results
            assert 'isolation_forest' in results
            assert 'statistical' in results
            assert 'rule_based' in results
            assert self.ensemble.is_trained
            
            print("✓ Ensemble training successful")
            return True
            
        except Exception as e:
            print(f"✗ Ensemble training failed: {e}")
            return False
    
    def test_anomaly_detection_accuracy(self) -> Dict[str, float]:
        """Test anomaly detection accuracy on known patterns"""
        print("Testing anomaly detection accuracy...")
        
        # Train ensemble first
        training_data = self.generate_normal_transactions(100) + self.generate_anomalous_transactions(20)
        self.ensemble.train(training_data)
        
        # Test on new data
        test_normal = self.generate_normal_transactions(50)
        test_anomalous = self.generate_anomalous_transactions(10)
        
        normal_scores = []
        anomalous_scores = []
        
        # Test normal transactions
        for transaction in test_normal:
            user_history = self.generate_user_history_for_transaction(transaction)
            score, _ = self.ensemble.predict_anomaly_score(transaction, user_history)
            normal_scores.append(score)
        
        # Test anomalous transactions
        for transaction in test_anomalous:
            user_history = self.generate_user_history_for_transaction(transaction)
            score, _ = self.ensemble.predict_anomaly_score(transaction, user_history)
            anomalous_scores.append(score)
        
        # Calculate metrics
        avg_normal_score = np.mean(normal_scores)
        avg_anomalous_score = np.mean(anomalous_scores)
        
        # Using threshold of 0.6 for anomaly detection
        threshold = 0.6
        
        # True positives: anomalous transactions correctly identified
        true_positives = sum(1 for score in anomalous_scores if score >= threshold)
        # False positives: normal transactions incorrectly flagged
        false_positives = sum(1 for score in normal_scores if score >= threshold)
        # True negatives: normal transactions correctly identified
        true_negatives = sum(1 for score in normal_scores if score < threshold)
        # False negatives: anomalous transactions missed
        false_negatives = sum(1 for score in anomalous_scores if score < threshold)
        
        # Calculate metrics
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        accuracy = (true_positives + true_negatives) / (len(normal_scores) + len(anomalous_scores))
        
        results = {
            'avg_normal_score': avg_normal_score,
            'avg_anomalous_score': avg_anomalous_score,
            'score_separation': avg_anomalous_score - avg_normal_score,
            'precision': precision,
            'recall': recall,
            'f1_score': f1_score,
            'accuracy': accuracy,
            'threshold_used': threshold
        }
        
        print(f"  Average normal score: {avg_normal_score:.3f}")
        print(f"  Average anomalous score: {avg_anomalous_score:.3f}")
        print(f"  Score separation: {results['score_separation']:.3f}")
        print(f"  Precision: {precision:.3f}")
        print(f"  Recall: {recall:.3f}")
        print(f"  F1 Score: {f1_score:.3f}")
        print(f"  Accuracy: {accuracy:.3f}")
        
        # Good performance indicators
        good_separation = results['score_separation'] > 0.2
        good_precision = precision > 0.7
        good_recall = recall > 0.6
        
        if good_separation and good_precision and good_recall:
            print("✓ Anomaly detection accuracy test passed")
        else:
            print("⚠ Anomaly detection accuracy could be improved")
        
        return results
    
    async def test_service_integration(self) -> bool:
        """Test full service integration"""
        print("Testing service integration...")
        
        try:
            # Test normal transaction
            normal_transaction = {
                'id': 'integration_test_normal',
                'amount': 150.0,
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': 'wallet_123',
                'fromWallet': 'user_test'
            }
            
            user_history = [
                {'amount': 100.0, 'timestamp': (datetime.utcnow() - timedelta(days=1)).isoformat(), 'toWallet': 'wallet_456'},
                {'amount': 200.0, 'timestamp': (datetime.utcnow() - timedelta(days=2)).isoformat(), 'toWallet': 'wallet_789'},
            ]
            
            score, result = await self.service.analyze_transaction_anomaly(normal_transaction, user_history)
            
            # Verify result structure
            assert isinstance(score, float)
            assert 0.0 <= score <= 1.0
            assert isinstance(result, dict)
            assert 'anomaly_score' in result
            assert 'is_anomaly' in result
            assert 'risk_level' in result
            assert 'component_scores' in result
            assert 'anomaly_indicators' in result
            
            print("✓ Service integration test passed")
            return True
            
        except Exception as e:
            print(f"✗ Service integration test failed: {e}")
            return False
    
    def test_component_integration(self) -> bool:
        """Test integration between different anomaly detection components"""
        print("Testing component integration...")
        
        try:
            # Test individual components
            isolation_forest = IsolationForestAnomalyDetector()
            statistical_detector = StatisticalAnomalyDetector()
            rule_based_detector = RuleBasedAnomalyDetector()
            
            # Generate test data
            test_transaction = {
                'amount': 5000.0,  # Large amount
                'timestamp': datetime.utcnow().replace(hour=3).isoformat(),  # Night time
                'toWallet': 'new_wallet',
                'fromWallet': 'user_test'
            }
            
            # Extract features
            extractor = TransactionFeatureExtractor()
            features = extractor.extract_transaction_features(test_transaction)
            
            # Test rule-based detector (should work without training)
            rule_score = rule_based_detector.predict_anomaly_score(test_transaction, features)
            assert isinstance(rule_score, float)
            assert 0.0 <= rule_score <= 1.0
            
            # Test statistical detector (needs training)
            training_features = [
                {f'feature_{i}': np.random.normal(0, 1) for i in range(len(features))}
                for _ in range(50)
            ]
            statistical_detector.train(training_features)
            stat_score = statistical_detector.predict_anomaly_score(features)
            assert isinstance(stat_score, float)
            assert 0.0 <= stat_score <= 1.0
            
            # Test isolation forest (needs training)
            training_data = np.random.normal(0, 1, (100, len(features)))
            feature_names = list(features.keys())
            isolation_forest.train(training_data, feature_names)
            if_score = isolation_forest.predict_anomaly_score(features)
            assert isinstance(if_score, float)
            assert 0.0 <= if_score <= 1.0
            
            print("✓ Component integration test passed")
            return True
            
        except Exception as e:
            print(f"✗ Component integration test failed: {e}")
            return False
    
    def test_ensemble_weight_adaptation(self) -> bool:
        """Test ensemble weight adaptation based on performance"""
        print("Testing ensemble weight adaptation...")
        
        try:
            # Get initial weights
            initial_weights = self.ensemble.weights.copy()
            
            # Simulate performance feedback
            performance_metrics = {
                'isolation_forest': 0.9,  # Excellent performance
                'statistical': 0.5,       # Poor performance
                'rule_based': 0.7         # Good performance
            }
            
            # Update weights
            self.ensemble.update_weights(performance_metrics)
            
            # Check that weights changed and are normalized
            assert self.ensemble.weights != initial_weights
            assert abs(sum(self.ensemble.weights.values()) - 1.0) < 1e-6
            
            # Better performing components should get higher weights
            assert self.ensemble.weights['isolation_forest'] > self.ensemble.weights['statistical']
            
            print("✓ Ensemble weight adaptation test passed")
            return True
            
        except Exception as e:
            print(f"✗ Ensemble weight adaptation test failed: {e}")
            return False
    
    async def run_integration_tests(self) -> Dict[str, Any]:
        """Run complete integration test suite"""
        print("=" * 60)
        print("ANOMALY DETECTION INTEGRATION TESTS")
        print("=" * 60)
        
        results = {}
        
        # Test 1: Ensemble training
        results['ensemble_training'] = self.test_ensemble_training()
        
        # Test 2: Component integration
        results['component_integration'] = self.test_component_integration()
        
        # Test 3: Anomaly detection accuracy
        results['accuracy_metrics'] = self.test_anomaly_detection_accuracy()
        
        # Test 4: Service integration
        results['service_integration'] = await self.test_service_integration()
        
        # Test 5: Weight adaptation
        results['weight_adaptation'] = self.test_ensemble_weight_adaptation()
        
        # Overall assessment
        print("\n" + "=" * 60)
        print("INTEGRATION TEST RESULTS")
        print("=" * 60)
        
        passed_tests = sum(1 for key, value in results.items() 
                          if key != 'accuracy_metrics' and value is True)
        total_tests = len(results) - 1  # Exclude accuracy_metrics from count
        
        print(f"Tests passed: {passed_tests}/{total_tests}")
        
        if 'accuracy_metrics' in results:
            accuracy = results['accuracy_metrics']
            print(f"Detection accuracy: {accuracy['accuracy']:.1%}")
            print(f"F1 Score: {accuracy['f1_score']:.3f}")
        
        all_passed = passed_tests == total_tests
        print(f"\nOverall result: {'✓ ALL TESTS PASSED' if all_passed else '✗ SOME TESTS FAILED'}")
        
        results['overall_success'] = all_passed
        
        return results

async def run_integration_tests():
    """Run integration tests"""
    test_suite = AnomalyIntegrationTest()
    results = await test_suite.run_integration_tests()
    return results

if __name__ == "__main__":
    # Run integration tests
    results = asyncio.run(run_integration_tests())
    
    # Save results
    import json
    with open('anomaly_integration_results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\nResults saved to anomaly_integration_results.json")