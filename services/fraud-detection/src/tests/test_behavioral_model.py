"""
Unit tests for behavioral pattern analysis system
"""

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock
import json
import redis

from models.behavioral_model import (
    BehavioralFeatureExtractor,
    BehavioralLSTMModel,
    BehavioralAnalysisService
)

class TestBehavioralFeatureExtractor:
    """Test behavioral feature extraction"""
    
    def setup_method(self):
        self.extractor = BehavioralFeatureExtractor()
        
    def test_extract_user_features_empty_transactions(self):
        """Test feature extraction with empty transaction list"""
        features = self.extractor.extract_user_features([], "user123")
        
        assert isinstance(features, dict)
        assert len(features) > 0
        assert features['avg_transaction_amount'] == 0.0
        assert features['transaction_count_7d'] == 0
        assert features['unique_recipients'] == 0
        
    def test_extract_user_features_single_transaction(self):
        """Test feature extraction with single transaction"""
        transactions = [{
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }]
        
        features = self.extractor.extract_user_features(transactions, "user123")
        
        assert features['avg_transaction_amount'] == 100.0
        assert features['max_transaction_amount'] == 100.0
        assert features['min_transaction_amount'] == 100.0
        assert features['transaction_count_7d'] == 1
        assert features['unique_recipients'] == 1
        
    def test_extract_spending_patterns(self):
        """Test spending pattern feature extraction"""
        now = datetime.utcnow()
        transactions = [
            {'amount': 50.0, 'timestamp': now - timedelta(days=1), 'toWallet': 'w1'},
            {'amount': 100.0, 'timestamp': now - timedelta(days=2), 'toWallet': 'w2'},
            {'amount': 200.0, 'timestamp': now - timedelta(days=3), 'toWallet': 'w3'},
            {'amount': 75.0, 'timestamp': now - timedelta(days=5), 'toWallet': 'w4'},
        ]
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        features = self.extractor._extract_spending_patterns(df)
        
        assert features['avg_transaction_amount'] == 106.25
        assert features['max_transaction_amount'] == 200.0
        assert features['min_transaction_amount'] == 50.0
        assert features['median_transaction_amount'] == 87.5
        assert 'amount_skewness' in features
        assert 'amount_kurtosis' in features
        
    def test_extract_timing_patterns(self):
        """Test timing pattern feature extraction"""
        now = datetime.utcnow()
        transactions = [
            {'amount': 50.0, 'timestamp': now.replace(hour=9), 'toWallet': 'w1'},  # Business hours
            {'amount': 100.0, 'timestamp': now.replace(hour=14), 'toWallet': 'w2'},  # Business hours
            {'amount': 200.0, 'timestamp': now.replace(hour=23), 'toWallet': 'w3'},  # Night
            {'amount': 75.0, 'timestamp': now.replace(hour=6), 'toWallet': 'w4'},  # Early morning
        ]
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        features = self.extractor._extract_timing_patterns(df)
        
        assert 'avg_hour' in features
        assert 'std_hour' in features
        assert 'business_hours_ratio' in features
        assert 'night_transactions_ratio' in features
        assert features['business_hours_ratio'] == 0.5  # 2 out of 4 transactions
        
    def test_extract_velocity_features(self):
        """Test transaction velocity feature extraction"""
        now = datetime.utcnow()
        transactions = [
            {'amount': 50.0, 'timestamp': now - timedelta(minutes=30), 'toWallet': 'w1'},
            {'amount': 100.0, 'timestamp': now - timedelta(hours=2), 'toWallet': 'w2'},
            {'amount': 200.0, 'timestamp': now - timedelta(hours=12), 'toWallet': 'w3'},
            {'amount': 75.0, 'timestamp': now - timedelta(days=2), 'toWallet': 'w4'},
        ]
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        features = self.extractor._extract_velocity_features(df)
        
        assert features['transactions_last_1h'] == 1
        assert features['transactions_last_24h'] == 3
        assert features['transactions_last_7d'] == 4
        assert 'velocity_1h_vs_avg' in features
        assert 'velocity_24h_vs_avg' in features
        
    def test_extract_recipient_patterns(self):
        """Test recipient pattern feature extraction"""
        transactions = [
            {'amount': 50.0, 'timestamp': datetime.utcnow(), 'toWallet': 'wallet1'},
            {'amount': 100.0, 'timestamp': datetime.utcnow(), 'toWallet': 'wallet2'},
            {'amount': 200.0, 'timestamp': datetime.utcnow(), 'toWallet': 'wallet1'},  # Repeat
            {'amount': 75.0, 'timestamp': datetime.utcnow(), 'toWallet': 'wallet3'},
        ]
        
        df = pd.DataFrame(transactions)
        
        features = self.extractor._extract_recipient_patterns(df)
        
        assert features['unique_recipients'] == 3
        assert features['repeat_recipient_ratio'] == 0.25  # 1 - (3/4)
        
    def test_feature_consistency(self):
        """Test that feature extraction produces consistent results"""
        transactions = [
            {'amount': 100.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'}
        ]
        
        features1 = self.extractor.extract_user_features(transactions, "user123")
        features2 = self.extractor.extract_user_features(transactions, "user123")
        
        assert features1 == features2
        
    def test_feature_keys_consistency(self):
        """Test that all feature extractions return the same keys"""
        empty_features = self.extractor.extract_user_features([], "user123")
        
        transactions = [
            {'amount': 100.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'}
        ]
        single_features = self.extractor.extract_user_features(transactions, "user123")
        
        assert set(empty_features.keys()) == set(single_features.keys())

class TestBehavioralLSTMModel:
    """Test LSTM model for behavioral analysis"""
    
    def setup_method(self):
        self.model = BehavioralLSTMModel(sequence_length=5, feature_dim=10)
        
    def test_model_initialization(self):
        """Test model initialization"""
        assert self.model.sequence_length == 5
        assert self.model.feature_dim == 10
        assert self.model.model is None
        assert not self.model.is_trained
        
    def test_build_model(self):
        """Test model architecture building"""
        model = self.model.build_model()
        
        assert model is not None
        assert len(model.layers) > 0
        assert model.input_shape == (None, 5, 10)
        assert model.output_shape == (None, 1)
        
    def test_prepare_sequences_sufficient_data(self):
        """Test sequence preparation with sufficient data"""
        features_list = [
            {f'feature_{i}': float(i + j) for i in range(10)}
            for j in range(7)  # 7 feature sets
        ]
        
        sequences = self.model.prepare_sequences(features_list)
        
        assert sequences.shape == (1, 5, 10)  # Last 5 sequences
        
    def test_prepare_sequences_insufficient_data(self):
        """Test sequence preparation with insufficient data (padding)"""
        features_list = [
            {f'feature_{i}': float(i + j) for i in range(10)}
            for j in range(3)  # Only 3 feature sets
        ]
        
        sequences = self.model.prepare_sequences(features_list)
        
        assert sequences.shape == (1, 5, 10)  # Padded to 5 sequences
        
    def test_predict_untrained_model(self):
        """Test prediction with untrained model"""
        features_list = [
            {f'feature_{i}': float(i) for i in range(10)}
            for _ in range(5)
        ]
        
        score = self.model.predict(features_list)
        
        assert score == 0.5  # Default score for untrained model
        
    @patch('tensorflow.keras.models.Model.predict')
    def test_predict_trained_model(self, mock_predict):
        """Test prediction with trained model"""
        # Mock trained model
        self.model.is_trained = True
        self.model.model = Mock()
        mock_predict.return_value = np.array([[0.8]])
        
        features_list = [
            {f'feature_{i}': float(i) for i in range(10)}
            for _ in range(5)
        ]
        
        score = self.model.predict(features_list)
        
        assert score == 0.8
        mock_predict.assert_called_once()
        
    def test_train_model_with_mock_data(self):
        """Test model training with mock data"""
        # Create mock training data
        X = np.random.random((100, 5, 10))
        y = np.random.randint(0, 2, (100,))
        
        with patch('tensorflow.keras.models.Model.fit') as mock_fit, \
             patch('tensorflow.keras.models.Model.evaluate') as mock_evaluate:
            
            # Mock training history
            mock_fit.return_value.history = {'loss': [0.5, 0.4, 0.3]}
            mock_evaluate.return_value = [0.3, 0.85, 0.8, 0.9]  # loss, accuracy, precision, recall
            
            results = self.model.train(X, y)
            
            assert self.model.is_trained
            assert 'val_accuracy' in results
            assert 'val_precision' in results
            assert 'val_recall' in results
            assert results['epochs_trained'] == 3
            
    def test_save_and_load_model(self):
        """Test model saving and loading"""
        with patch('tensorflow.keras.models.Model.save') as mock_save, \
             patch('tensorflow.keras.models.load_model') as mock_load, \
             patch('pickle.dump') as mock_pickle_dump, \
             patch('pickle.load') as mock_pickle_load, \
             patch('builtins.open', create=True):
            
            # Mock model and scaler
            self.model.model = Mock()
            self.model.is_trained = True
            
            # Test save
            self.model.save_model("/tmp/test_model")
            mock_save.assert_called_once()
            assert mock_pickle_dump.call_count == 2  # scaler + config
            
            # Test load
            mock_load.return_value = Mock()
            mock_pickle_load.side_effect = [Mock(), {'sequence_length': 5, 'feature_dim': 10, 'is_trained': True}]
            
            new_model = BehavioralLSTMModel()
            new_model.load_model("/tmp/test_model")
            
            mock_load.assert_called_once()
            assert new_model.is_trained

class TestBehavioralAnalysisService:
    """Test behavioral analysis service"""
    
    def setup_method(self):
        self.mock_redis = Mock(spec=redis.Redis)
        self.service = BehavioralAnalysisService(redis_client=self.mock_redis)
        
    @pytest.mark.asyncio
    async def test_analyze_user_behavior_no_history(self):
        """Test behavioral analysis with no user history"""
        self.mock_redis.get.return_value = None
        
        current_transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        score = await self.service.analyze_user_behavior("user123", current_transaction)
        
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0
        
    @pytest.mark.asyncio
    async def test_analyze_user_behavior_with_history(self):
        """Test behavioral analysis with user history"""
        # Mock cached history
        history = [
            {'amount': 50.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'}
        ]
        self.mock_redis.get.side_effect = [
            json.dumps(history),  # user_history
            None, None, None, None, None, None, None, None, None, None  # feature cache misses
        ]
        
        current_transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        score = await self.service.analyze_user_behavior("user123", current_transaction)
        
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0
        
    @pytest.mark.asyncio
    async def test_analyze_user_behavior_redis_error(self):
        """Test behavioral analysis when Redis fails"""
        self.mock_redis.get.side_effect = Exception("Redis connection error")
        
        current_transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        score = await self.service.analyze_user_behavior("user123", current_transaction)
        
        assert score == 0.5  # Default score on error
        
    @pytest.mark.asyncio
    async def test_cache_user_features(self):
        """Test caching of user features"""
        features = {'feature_1': 1.0, 'feature_2': 2.0}
        
        await self.service._cache_user_features("user123", features)
        
        # Should call setex for shifting old features and storing new ones
        assert self.mock_redis.setex.called
        
    @pytest.mark.asyncio
    async def test_get_feature_sequence_with_cache(self):
        """Test getting feature sequence from cache"""
        cached_features = {'feature_1': 1.0, 'feature_2': 2.0}
        self.mock_redis.get.return_value = json.dumps(cached_features)
        
        current_features = {'feature_1': 3.0, 'feature_2': 4.0}
        sequence = await self.service._get_feature_sequence("user123", current_features)
        
        assert len(sequence) == 10
        assert sequence[-1] == current_features  # Last item should be current features
        
    def test_update_model_with_feedback(self):
        """Test model feedback update"""
        feedback_data = [
            {'transaction_id': 'tx1', 'actual_fraud': True},
            {'transaction_id': 'tx2', 'actual_fraud': False}
        ]
        
        # Should not raise exception
        self.service.update_model_with_feedback(feedback_data)

class TestBehavioralModelIntegration:
    """Integration tests for behavioral model components"""
    
    def test_end_to_end_feature_extraction_and_prediction(self):
        """Test complete pipeline from transactions to prediction"""
        extractor = BehavioralFeatureExtractor()
        model = BehavioralLSTMModel(sequence_length=3, feature_dim=23)
        
        # Create realistic transaction data
        now = datetime.utcnow()
        transactions = [
            {
                'amount': 50.0,
                'timestamp': (now - timedelta(days=2)).isoformat(),
                'toWallet': 'wallet1'
            },
            {
                'amount': 100.0,
                'timestamp': (now - timedelta(days=1)).isoformat(),
                'toWallet': 'wallet2'
            },
            {
                'amount': 200.0,
                'timestamp': now.isoformat(),
                'toWallet': 'wallet1'
            }
        ]
        
        # Extract features for each transaction context
        feature_sequence = []
        for i in range(len(transactions)):
            features = extractor.extract_user_features(transactions[:i+1], "user123")
            feature_sequence.append(features)
        
        # Test prediction (should return default score for untrained model)
        score = model.predict(feature_sequence)
        assert score == 0.5
        
    def test_feature_dimension_consistency(self):
        """Test that feature extraction produces consistent dimensions"""
        extractor = BehavioralFeatureExtractor()
        
        # Test with different transaction scenarios
        scenarios = [
            [],  # No transactions
            [{'amount': 100.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'}],  # Single
            [  # Multiple transactions
                {'amount': 50.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'},
                {'amount': 100.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w2'},
            ]
        ]
        
        feature_dims = []
        for scenario in scenarios:
            features = extractor.extract_user_features(scenario, "user123")
            feature_dims.append(len(features))
        
        # All scenarios should produce the same number of features
        assert len(set(feature_dims)) == 1, f"Inconsistent feature dimensions: {feature_dims}"
        
    def test_model_input_shape_compatibility(self):
        """Test that feature extraction output is compatible with model input"""
        extractor = BehavioralFeatureExtractor()
        
        # Extract features
        transactions = [
            {'amount': 100.0, 'timestamp': datetime.utcnow().isoformat(), 'toWallet': 'w1'}
        ]
        features = extractor.extract_user_features(transactions, "user123")
        
        # Create model with matching feature dimension
        model = BehavioralLSTMModel(sequence_length=5, feature_dim=len(features))
        
        # Test sequence preparation
        feature_sequence = [features] * 5
        sequences = model.prepare_sequences(feature_sequence)
        
        assert sequences.shape == (1, 5, len(features))
        
    @pytest.mark.asyncio
    async def test_service_performance_benchmark(self):
        """Test that behavioral analysis meets performance requirements"""
        import time
        
        service = BehavioralAnalysisService()
        
        current_transaction = {
            'amount': 100.0,
            'timestamp': datetime.utcnow().isoformat(),
            'toWallet': 'wallet123'
        }
        
        # Measure analysis time
        start_time = time.time()
        score = await service.analyze_user_behavior("user123", current_transaction)
        end_time = time.time()
        
        analysis_time = end_time - start_time
        
        # Should complete within reasonable time (< 100ms for this test)
        assert analysis_time < 0.1, f"Analysis took {analysis_time:.3f}s, expected < 0.1s"
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0

if __name__ == "__main__":
    pytest.main([__file__, "-v"])