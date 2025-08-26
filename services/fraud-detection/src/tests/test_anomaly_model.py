"""
Unit tests for anomaly detection using isolation forests
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock
import json
import redis
import time

from models.anomaly_model import (
    TransactionFeatureExtractor,
    IsolationForestAnomalyDetector,
    EnsembleAnomalyDetector,
    StatisticalAnomalyDetector,
    RuleBasedAnomalyDetector,
    AnomalyAnalysisService
)

class TestTransactionFeatureExtractor:
    """Test transaction feature extraction for anomaly detection"""
    
    def setup_method(self):
        self.extractor = TransactionFeatureExtractor()
        
    def test_extract_basic_features(self):
        """Test basic transaction feature extraction"""
        transaction = {
            'amount': 100.50,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        features = self.extractor.extract_transaction_features(transaction)
        
        assert 'amount' in features
        assert 'amount_log' in features
        assert 'amount_sqrt' in features
        assert 'is_round_amount' in features
        assert 'amount_digits' in features
        
        assert features['amount'] == 100.50
        assert features['amount_log'] == np.log1p(100.50)
        assert features['amount_sqrt'] == np.sqrt(100.50)
        assert features['is_round_amount'] == 0.0  # 100.50 is not round
        assert features['amount_digits'] == 3  # 100
        
    def test_extract_temporal_features(self):
        """Test temporal feature extraction"""
        # Test with specific time
        test_time = datetime(2025, 1, 8, 14, 30, 0)  # Wednesday 2:30 PM
        transaction = {
            'amount': 100.0,
            'timestamp': test_time.isoformat(),
            'toWallet': 'wallet123'
        }
        
        features = self.extractor.extract_transaction_features(transaction)
        
        assert features['hour'] == 14.0
        assert features['day_of_week'] == 2.0  # Wednesday
        assert features['is_weekend'] == 0.0
        assert features['is_night'] == 0.0
        assert features['is_business_hours'] == 1.0
        assert features['month'] == 1.0
        assert features['day_of_month'] == 8.0
        
    def test_extract_user_context_features_no_history(self):
        """Test user context features with no history"""
        transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        features = self.extractor.extract_transaction_features(transaction, user_history=None)
        
        # Should have default user features
        assert features['user_avg_amount'] == 0.0
        assert features['user_transaction_count'] == 0.0
        assert features['amount_vs_user_avg'] == 1.0
        assert features['is_new_recipient'] == 1.0
        
    def test_extract_user_context_features_with_history(self):
        """Test user context features with transaction history"""
        user_history = [
            {'amount': 50.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'wallet1'},
            {'amount': 150.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'wallet2'},
            {'amount': 100.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'wallet1'},
        ]
        
        transaction = {
            'amount': 200.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet3'  # New recipient
        }
        
        features = self.extractor.extract_transaction_features(transaction, user_history)
        
        assert features['user_avg_amount'] == 100.0  # (50 + 150 + 100) / 3
        assert features['user_transaction_count'] == 3.0
        assert features['amount_vs_user_avg'] == 2.0  # 200 / 100
        assert features['is_new_recipient'] == 1.0  # wallet3 is new
        assert features['unique_recipients'] == 2.0  # wallet1, wallet2
        
    def test_extract_velocity_features(self):
        """Test velocity feature extraction"""
        now = datetime.utcnow()
        user_history = [
            {'amount': 50.0, 'timestamp': (now - timedelta(minutes=30)).isoformat(), 'toWallet': 'w1'},
            {'amount': 100.0, 'timestamp': (now - timedelta(hours=2)).isoformat(), 'toWallet': 'w2'},
            {'amount': 200.0, 'timestamp': (now - timedelta(hours=12)).isoformat(), 'toWallet': 'w3'},
            {'amount': 75.0, 'timestamp': (now - timedelta(days=2)).isoformat(), 'toWallet': 'w4'},
        ]
        
        transaction = {
            'amount': 300.0,
            'timestamp': now.isoformat(),
            'toWallet': 'wallet5'
        }
        
        features = self.extractor.extract_transaction_features(transaction, user_history)
        
        assert features['transactions_last_1h'] == 1.0  # Only the 30-minute one
        assert features['transactions_last_24h'] == 3.0  # All except the 2-day old one
        assert features['transactions_last_7d'] == 4.0  # All transactions
        assert 'avg_time_between_tx' in features
        assert 'velocity_score' in features
        
    def test_extract_amount_features(self):
        """Test amount-based feature extraction"""
        transaction = {
            'amount': 1000.0,  # Power of 10
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        features = self.extractor.extract_transaction_features(transaction)
        
        assert features['amount_is_power_of_10'] == 1.0
        assert features['amount_ends_in_zeros'] == True
        assert features['amount_is_very_small'] == 0.0
        assert features['amount_is_very_large'] == 0.0
        
    def test_feature_consistency(self):
        """Test that feature extraction produces consistent results"""
        transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        features1 = self.extractor.extract_transaction_features(transaction)
        features2 = self.extractor.extract_transaction_features(transaction)
        
        assert features1 == features2
        
    def test_gini_coefficient_calculation(self):
        """Test Gini coefficient calculation"""
        # Test with equal distribution (should be 0)
        equal_values = np.array([1, 1, 1, 1])
        gini_equal = self.extractor._calculate_gini_coefficient(equal_values)
        assert abs(gini_equal) < 0.1  # Should be close to 0
        
        # Test with unequal distribution
        unequal_values = np.array([1, 1, 1, 10])
        gini_unequal = self.extractor._calculate_gini_coefficient(unequal_values)
        assert gini_unequal > 0.2  # Should be significantly > 0

class TestIsolationForestAnomalyDetector:
    """Test Isolation Forest anomaly detector"""
    
    def setup_method(self):
        self.detector = IsolationForestAnomalyDetector(contamination=0.1, n_estimators=10, random_state=42)
        
    def test_initialization(self):
        """Test detector initialization"""
        assert self.detector.contamination == 0.1
        assert self.detector.n_estimators == 10
        assert self.detector.random_state == 42
        assert not self.detector.is_trained
        
    def test_train_model(self):
        """Test model training"""
        # Create synthetic training data
        np.random.seed(42)
        X = np.random.normal(0, 1, (100, 10))  # Normal data
        X = np.vstack([X, np.random.normal(5, 1, (10, 10))])  # Add some outliers
        
        feature_names = [f'feature_{i}' for i in range(10)]
        
        results = self.detector.train(X, feature_names)
        
        assert self.detector.is_trained
        assert 'samples_trained' in results
        assert 'features_count' in results
        assert 'anomalies_detected' in results
        assert 'threshold' in results
        assert results['samples_trained'] == 110
        assert results['features_count'] == 10
        
    def test_predict_untrained_model(self):
        """Test prediction with untrained model"""
        features = {f'feature_{i}': float(i) for i in range(10)}
        
        score = self.detector.predict_anomaly_score(features)
        
        assert score == 0.5  # Default score for untrained model
        
    def test_predict_trained_model(self):
        """Test prediction with trained model"""
        # Train model first
        np.random.seed(42)
        X = np.random.normal(0, 1, (100, 5))
        feature_names = [f'feature_{i}' for i in range(5)]
        
        self.detector.train(X, feature_names)
        
        # Test normal transaction
        normal_features = {f'feature_{i}': 0.0 for i in range(5)}
        normal_score = self.detector.predict_anomaly_score(normal_features)
        
        # Test anomalous transaction
        anomalous_features = {f'feature_{i}': 10.0 for i in range(5)}
        anomalous_score = self.detector.predict_anomaly_score(anomalous_features)
        
        assert 0.0 <= normal_score <= 1.0
        assert 0.0 <= anomalous_score <= 1.0
        assert anomalous_score > normal_score  # Anomalous should have higher score
        
    def test_save_and_load_model(self):
        """Test model saving and loading"""
        # Train a model
        np.random.seed(42)
        X = np.random.normal(0, 1, (50, 5))
        feature_names = [f'feature_{i}' for i in range(5)]
        
        self.detector.train(X, feature_names)
        
        # Test features
        test_features = {f'feature_{i}': 1.0 for i in range(5)}
        original_score = self.detector.predict_anomaly_score(test_features)
        
        # Save model
        with patch('joblib.dump') as mock_dump, \
             patch('pickle.dump') as mock_pickle_dump, \
             patch('builtins.open', create=True):
            
            self.detector.save_model("/tmp/test_model")
            
            # Should save model, scaler, and config
            assert mock_dump.call_count == 2  # model and scaler
            mock_pickle_dump.assert_called_once()  # config
        
        # Load model
        with patch('joblib.load') as mock_load, \
             patch('pickle.load') as mock_pickle_load, \
             patch('builtins.open', create=True):
            
            # Mock loaded objects
            mock_load.side_effect = [self.detector.model, self.detector.scaler]
            mock_pickle_load.return_value = {
                'feature_names': feature_names,
                'threshold': self.detector.threshold,
                'contamination': self.detector.contamination,
                'n_estimators': self.detector.n_estimators,
                'is_trained': True
            }
            
            new_detector = IsolationForestAnomalyDetector()
            new_detector.load_model("/tmp/test_model")
            
            assert new_detector.is_trained
            assert new_detector.feature_names == feature_names

class TestStatisticalAnomalyDetector:
    """Test statistical anomaly detector"""
    
    def setup_method(self):
        self.detector = StatisticalAnomalyDetector()
        
    def test_train_statistical_model(self):
        """Test statistical model training"""
        features_list = [
            {'feature_1': 1.0, 'feature_2': 2.0},
            {'feature_1': 2.0, 'feature_2': 3.0},
            {'feature_1': 3.0, 'feature_2': 4.0},
            {'feature_1': 1.5, 'feature_2': 2.5},
        ]
        
        results = self.detector.train(features_list)
        
        assert self.detector.is_trained
        assert 'features_analyzed' in results
        assert 'samples_used' in results
        assert results['features_analyzed'] == 2
        assert results['samples_used'] == 4
        
        # Check computed statistics
        assert 'feature_1' in self.detector.feature_stats
        assert 'feature_2' in self.detector.feature_stats
        
        stats_f1 = self.detector.feature_stats['feature_1']
        assert stats_f1['mean'] == 1.875  # (1 + 2 + 3 + 1.5) / 4
        assert stats_f1['median'] == 1.75  # median of [1, 1.5, 2, 3]
        
    def test_predict_statistical_anomaly(self):
        """Test statistical anomaly prediction"""
        # Train with normal data
        features_list = [
            {'feature_1': i, 'feature_2': i * 2} for i in range(1, 11)
        ]
        
        self.detector.train(features_list)
        
        # Test normal value
        normal_features = {'feature_1': 5.0, 'feature_2': 10.0}
        normal_score = self.detector.predict_anomaly_score(normal_features)
        
        # Test anomalous value
        anomalous_features = {'feature_1': 100.0, 'feature_2': 200.0}
        anomalous_score = self.detector.predict_anomaly_score(anomalous_features)
        
        assert 0.0 <= normal_score <= 1.0
        assert 0.0 <= anomalous_score <= 1.0
        assert anomalous_score > normal_score
        
    def test_predict_untrained_model(self):
        """Test prediction with untrained model"""
        features = {'feature_1': 1.0, 'feature_2': 2.0}
        score = self.detector.predict_anomaly_score(features)
        
        assert score == 0.5  # Default score

class TestRuleBasedAnomalyDetector:
    """Test rule-based anomaly detector"""
    
    def setup_method(self):
        self.detector = RuleBasedAnomalyDetector()
        
    def test_round_amount_pattern(self):
        """Test round amount pattern detection"""
        # Test suspicious round amount
        transaction = {'amount': 1000.0}
        features = {'amount': 1000.0}
        
        score = self.detector.predict_anomaly_score(transaction, features)
        
        assert score > 0.0  # Should detect as suspicious
        
    def test_velocity_pattern(self):
        """Test velocity pattern detection"""
        transaction = {'amount': 100.0}
        features = {'velocity_score': 0.9}  # High velocity
        
        score = self.detector.predict_anomaly_score(transaction, features)
        
        assert score >= 0.8  # Should detect high velocity as very suspicious
        
    def test_amount_pattern(self):
        """Test amount pattern detection"""
        # Test micro amount
        transaction = {'amount': 0.01}
        features = {'amount': 0.01}
        
        score = self.detector.predict_anomaly_score(transaction, features)
        
        assert score > 0.0  # Should detect micro amounts as suspicious
        
    def test_timing_pattern(self):
        """Test timing pattern detection"""
        transaction = {'amount': 100.0}
        features = {'is_night': 1.0}  # Night transaction
        
        score = self.detector.predict_anomaly_score(transaction, features)
        
        assert score > 0.0  # Should detect night transactions as slightly suspicious
        
    def test_recipient_pattern(self):
        """Test recipient pattern detection"""
        transaction = {'amount': 5000.0}
        features = {'is_new_recipient': 1.0}  # New recipient with large amount
        
        score = self.detector.predict_anomaly_score(transaction, features)
        
        assert score > 0.0  # Should detect new recipient + large amount as suspicious

class TestEnsembleAnomalyDetector:
    """Test ensemble anomaly detector"""
    
    def setup_method(self):
        self.detector = EnsembleAnomalyDetector()
        
    def test_ensemble_initialization(self):
        """Test ensemble detector initialization"""
        assert hasattr(self.detector, 'isolation_forest')
        assert hasattr(self.detector, 'statistical_detector')
        assert hasattr(self.detector, 'rule_based_detector')
        assert hasattr(self.detector, 'weights')
        assert not self.detector.is_trained
        
    def test_ensemble_training(self):
        """Test ensemble training"""
        # Create synthetic training data
        training_data = []
        for i in range(50):
            transaction = {
                'amount': np.random.normal(100, 20),
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'wallet_{i % 10}'
            }
            training_data.append(transaction)
        
        results = self.detector.train(training_data)
        
        assert self.detector.is_trained
        assert 'isolation_forest' in results
        assert 'statistical' in results
        assert 'rule_based' in results
        assert 'ensemble_trained' in results
        
    def test_ensemble_prediction_untrained(self):
        """Test ensemble prediction with untrained model"""
        transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        score, component_scores = self.detector.predict_anomaly_score(transaction)
        
        assert score == 0.5  # Default score for untrained model
        assert 'isolation_forest' in component_scores
        assert 'statistical' in component_scores
        assert 'rule_based' in component_scores
        
    def test_update_weights(self):
        """Test ensemble weight updating"""
        original_weights = self.detector.weights.copy()
        
        # Update with performance metrics
        performance_metrics = {
            'isolation_forest': 0.8,
            'statistical': 0.6,
            'rule_based': 0.4
        }
        
        self.detector.update_weights(performance_metrics)
        
        # Weights should be updated and normalized
        assert sum(self.detector.weights.values()) == pytest.approx(1.0, rel=1e-6)
        assert self.detector.weights != original_weights

class TestAnomalyAnalysisService:
    """Test anomaly analysis service"""
    
    def setup_method(self):
        self.mock_redis = Mock(spec=redis.Redis)
        self.service = AnomalyAnalysisService(redis_client=self.mock_redis)
        
    @pytest.mark.asyncio
    async def test_analyze_transaction_anomaly_basic(self):
        """Test basic transaction anomaly analysis"""
        transaction = {
            'id': 'tx123',
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        score, result = await self.service.analyze_transaction_anomaly(transaction)
        
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0
        assert isinstance(result, dict)
        assert 'anomaly_score' in result
        assert 'is_anomaly' in result
        assert 'risk_level' in result
        assert 'component_scores' in result
        assert 'anomaly_indicators' in result
        assert 'processing_time_ms' in result
        
    @pytest.mark.asyncio
    async def test_analyze_transaction_anomaly_with_history(self):
        """Test anomaly analysis with user history"""
        user_history = [
            {'amount': 50.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'},
            {'amount': 75.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w2'},
        ]
        
        transaction = {
            'id': 'tx123',
            'amount': 1000.0,  # Much larger than history
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        score, result = await self.service.analyze_transaction_anomaly(transaction, user_history)
        
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0
        assert result['is_anomaly'] in [True, False]
        assert result['risk_level'] in ['low', 'medium', 'high', 'critical']
        
    @pytest.mark.asyncio
    async def test_analyze_transaction_performance(self):
        """Test that analysis meets performance requirements"""
        transaction = {
            'id': 'tx123',
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        start_time = time.time()
        score, result = await self.service.analyze_transaction_anomaly(transaction)
        end_time = time.time()
        
        analysis_time = (end_time - start_time) * 1000  # Convert to ms
        
        # Should complete within reasonable time (< 100ms for this test)
        assert analysis_time < 100, f"Analysis took {analysis_time:.1f}ms, expected < 100ms"
        assert result['processing_time_ms'] > 0
        
    @pytest.mark.asyncio
    async def test_batch_analyze_transactions(self):
        """Test batch transaction analysis"""
        transactions = [
            {
                'id': f'tx{i}',
                'amount': 100.0 + i * 10,
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'wallet{i}'
            }
            for i in range(5)
        ]
        
        results = await self.service.batch_analyze_transactions(transactions)
        
        assert len(results) == 5
        for score, result in results:
            assert isinstance(score, float)
            assert 0.0 <= score <= 1.0
            assert isinstance(result, dict)
            assert 'anomaly_score' in result
            
    def test_train_models(self):
        """Test model training"""
        training_data = [
            {
                'amount': np.random.normal(100, 20),
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'wallet_{i % 10}'
            }
            for i in range(100)
        ]
        
        with patch('os.makedirs'), \
             patch.object(self.service.ensemble_detector.isolation_forest, 'save_model'):
            
            results = self.service.train_models(training_data)
            
            assert 'isolation_forest' in results or 'error' in results
            
    def test_update_thresholds(self):
        """Test threshold updating"""
        original_anomaly_threshold = self.service.anomaly_threshold
        original_high_risk_threshold = self.service.high_risk_threshold
        
        self.service.update_thresholds(anomaly_threshold=0.7, high_risk_threshold=0.9)
        
        assert self.service.anomaly_threshold == 0.7
        assert self.service.high_risk_threshold == 0.9
        assert self.service.anomaly_threshold != original_anomaly_threshold
        assert self.service.high_risk_threshold != original_high_risk_threshold
        
    def test_get_performance_metrics(self):
        """Test performance metrics retrieval"""
        # Add some mock performance data
        self.service.processing_times = [10.0, 15.0, 20.0, 12.0, 18.0]
        self.service.detection_counts = {'anomaly': 2, 'normal': 8}
        
        metrics = self.service.get_performance_metrics()
        
        assert 'avg_processing_time_ms' in metrics
        assert 'p95_processing_time_ms' in metrics
        assert 'p99_processing_time_ms' in metrics
        assert 'total_analyses' in metrics
        assert 'anomaly_detection_rate' in metrics
        assert 'detection_distribution' in metrics
        assert 'current_thresholds' in metrics
        
        assert metrics['total_analyses'] == 5
        assert metrics['anomaly_detection_rate'] == 0.2  # 2/10
        
    @pytest.mark.asyncio
    async def test_cache_anomaly_result(self):
        """Test caching of anomaly results"""
        transaction = {
            'id': 'tx123',
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        await self.service._cache_anomaly_result(transaction, 0.7, {'isolation_forest': 0.8})
        
        # Should call Redis setex
        self.mock_redis.setex.assert_called_once()
        
    def test_determine_risk_level(self):
        """Test risk level determination"""
        assert self.service._determine_risk_level(0.9) == 'critical'
        assert self.service._determine_risk_level(0.7) == 'high'
        assert self.service._determine_risk_level(0.5) == 'medium'
        assert self.service._determine_risk_level(0.2) == 'low'
        
    def test_extract_anomaly_indicators(self):
        """Test anomaly indicator extraction"""
        transaction = {
            'amount': 15000.0,  # Large amount
            'timestamp': datetime(2025, 1, 8, 3, 0, 0).isoformat()  # Night time
        }
        
        component_scores = {
            'isolation_forest': 0.8,
            'statistical': 0.6,
            'rule_based': 0.7
        }
        
        indicators = self.service._extract_anomaly_indicators(transaction, component_scores, 0.85)
        
        assert 'isolation_forest_anomaly' in indicators
        assert 'large_amount' in indicators
        assert 'unusual_timing' in indicators
        assert 'high_anomaly_score' in indicators

class TestAnomalyModelIntegration:
    """Integration tests for anomaly detection components"""
    
    def test_end_to_end_anomaly_detection(self):
        """Test complete anomaly detection pipeline"""
        # Create feature extractor and ensemble detector
        extractor = TransactionFeatureExtractor()
        ensemble = EnsembleAnomalyDetector()
        
        # Create realistic transaction data
        normal_transactions = [
            {
                'amount': np.random.normal(100, 20),
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'wallet_{i % 5}'
            }
            for i in range(50)
        ]
        
        # Add some anomalous transactions
        anomalous_transactions = [
            {
                'amount': 10000.0,  # Very large
                'timestamp': datetime.utcnow().replace(hour=3).isoformat(),  # Night
                'toWallet': 'new_wallet'
            },
            {
                'amount': 0.01,  # Very small
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': 'another_new_wallet'
            }
        ]
        
        all_transactions = normal_transactions + anomalous_transactions
        
        # Train ensemble
        training_results = ensemble.train(all_transactions)
        
        # Test predictions
        test_transaction = {
            'amount': 5000.0,  # Moderately large
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'test_wallet'
        }
        
        score, component_scores = ensemble.predict_anomaly_score(test_transaction)
        
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0
        assert isinstance(component_scores, dict)
        assert len(component_scores) >= 3  # Should have at least 3 components
        
    def test_feature_extraction_consistency(self):
        """Test that feature extraction is consistent across different scenarios"""
        extractor = TransactionFeatureExtractor()
        
        # Test same transaction multiple times
        transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        features1 = extractor.extract_transaction_features(transaction)
        features2 = extractor.extract_transaction_features(transaction)
        
        assert features1 == features2
        
        # Test with different user histories
        history1 = [{'amount': 50.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'}]
        history2 = [{'amount': 150.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w2'}]
        
        features_h1 = extractor.extract_transaction_features(transaction, history1)
        features_h2 = extractor.extract_transaction_features(transaction, history2)
        
        # Should have same keys but different values
        assert set(features_h1.keys()) == set(features_h2.keys())
        assert features_h1 != features_h2  # Values should be different
        
    @pytest.mark.asyncio
    async def test_service_performance_benchmark(self):
        """Test that anomaly analysis service meets performance requirements"""
        service = AnomalyAnalysisService()
        
        # Test multiple transactions to get average performance
        transactions = [
            {
                'id': f'tx{i}',
                'amount': 100.0 + i,
                'timestamp': datetime.utcnow().isoformat(),
                'toWallet': f'wallet{i}'
            }
            for i in range(10)
        ]
        
        start_time = time.time()
        
        for transaction in transactions:
            await service.analyze_transaction_anomaly(transaction)
        
        end_time = time.time()
        
        avg_time_per_transaction = ((end_time - start_time) / len(transactions)) * 1000  # ms
        
        # Should average less than 50ms per transaction
        assert avg_time_per_transaction < 50, f"Average time {avg_time_per_transaction:.1f}ms > 50ms"
        
        # Check performance metrics
        metrics = service.get_performance_metrics()
        assert metrics['avg_processing_time_ms'] < 50
        
    def test_ensemble_weight_adaptation(self):
        """Test that ensemble weights adapt based on performance"""
        ensemble = EnsembleAnomalyDetector()
        
        original_weights = ensemble.weights.copy()
        
        # Simulate performance feedback
        performance_metrics = {
            'isolation_forest': 0.9,  # Very good
            'statistical': 0.5,       # Poor
            'rule_based': 0.7         # Good
        }
        
        ensemble.update_weights(performance_metrics)
        
        # Weights should change and still sum to 1
        assert ensemble.weights != original_weights
        assert abs(sum(ensemble.weights.values()) - 1.0) < 1e-6
        
        # Better performing components should get higher weights
        assert ensemble.weights['isolation_forest'] > ensemble.weights['statistical']

if __name__ == "__main__":
    pytest.main([__file__, "-v"])