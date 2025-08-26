"""
Integration tests for fraud detection service
Tests the complete pipeline including API endpoints and ML model integration
"""

import pytest
import asyncio
import time
import json
from datetime import datetime
from typing import Dict, Any
from unittest.mock import Mock, AsyncMock, patch
import redis

from fastapi.testclient import TestClient
from main import app
from models.behavioral_model import BehavioralAnalysisService
from models.graph_model import GraphAnalysisService
from models.anomaly_model import AnomalyAnalysisService
from models.risk_engine import RealTimeRiskEngine

class TestFraudDetectionIntegration:
    """Integration tests for fraud detection service"""
    
    @pytest.fixture
    def client(self):
        """Test client for FastAPI app"""
        return TestClient(app)
    
    @pytest.fixture
    def sample_transaction_request(self):
        """Sample transaction analysis request"""
        return {
            "transactionId": "tx_12345",
            "fromWallet": "wallet_user123",
            "toWallet": "wallet_merchant456",
            "amount": 1500.0,
            "currency": "USD-CBDC",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "userContext": {
                "user_age_days": 45,
                "recent_transactions_1h": 3,
                "is_new_location": False
            }
        }
    
    def test_health_endpoint(self, client):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["service"] == "fraud-detection"
        assert data["status"] == "healthy"
        assert "timestamp" in data
    
    def test_metrics_endpoint(self, client):
        """Test Prometheus metrics endpoint"""
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "fraud_analysis_total" in response.text
        assert "fraud_analysis_duration_seconds" in response.text
    
    @patch('main.behavioral_service')
    @patch('main.graph_service')
    @patch('main.anomaly_service')
    @patch('main.risk_engine')
    def test_analyze_transaction_endpoint(self, mock_risk_engine, mock_anomaly_service, 
                                        mock_graph_service, mock_behavioral_service, 
                                        client, sample_transaction_request):
        """Test transaction analysis endpoint"""
        # Mock service responses
        mock_behavioral_service.analyze_user_behavior = AsyncMock(return_value=0.3)
        mock_graph_service.analyze_transaction_network.return_value = 0.2
        mock_anomaly_service.ensemble_detector.predict_anomaly_score.return_value = (0.4, {})
        
        # Mock risk engine assessment
        mock_assessment = Mock()
        mock_assessment.overall_risk_score = 0.35
        mock_assessment.risk_factors = ['medium_risk']
        mock_assessment.confidence = 0.8
        mock_assessment.processing_time_ms = 45.0
        mock_assessment.recommended_action.value = 'flag'
        
        mock_risk_engine.assess_transaction_risk = AsyncMock(return_value=mock_assessment)
        
        # Make request
        response = client.post("/api/v1/analyze", json=sample_transaction_request)
        
        # Validate response
        assert response.status_code == 200
        data = response.json()
        
        assert data["transactionId"] == sample_transaction_request["transactionId"]
        assert "overallScore" in data
        assert "behavioralScore" in data
        assert "graphScore" in data
        assert "anomalyScore" in data
        assert "riskFactors" in data
        assert "timestamp" in data
        
        # Validate score ranges
        assert 0.0 <= data["overallScore"] <= 1.0
        assert 0.0 <= data["behavioralScore"] <= 1.0
        assert 0.0 <= data["graphScore"] <= 1.0
        assert 0.0 <= data["anomalyScore"] <= 1.0
    
    def test_analyze_transaction_performance(self, client, sample_transaction_request):
        """Test transaction analysis performance"""
        # Warm up
        for _ in range(5):
            client.post("/api/v1/analyze", json=sample_transaction_request)
        
        # Performance test
        times = []
        iterations = 50
        
        for i in range(iterations):
            # Modify transaction ID for each request
            request = sample_transaction_request.copy()
            request["transactionId"] = f"perf_tx_{i}"
            
            start_time = time.perf_counter()
            response = client.post("/api/v1/analyze", json=request)
            end_time = time.perf_counter()
            
            assert response.status_code == 200
            times.append((end_time - start_time) * 1000)  # Convert to milliseconds
        
        # Performance metrics
        avg_time = sum(times) / len(times)
        p95_time = sorted(times)[int(0.95 * len(times))]
        max_time = max(times)
        
        print(f"API Performance Test:")
        print(f"  Average: {avg_time:.2f}ms")
        print(f"  P95: {p95_time:.2f}ms")
        print(f"  Max: {max_time:.2f}ms")
        
        # Performance requirements (including HTTP overhead)
        assert avg_time < 200.0, f"Average API response time {avg_time:.2f}ms exceeds 200ms"
        assert p95_time < 300.0, f"P95 API response time {p95_time:.2f}ms exceeds 300ms"
        assert max_time < 500.0, f"Max API response time {max_time:.2f}ms exceeds 500ms"
    
    def test_concurrent_requests(self, client, sample_transaction_request):
        """Test concurrent request handling"""
        import concurrent.futures
        import threading
        
        def make_request(tx_id: str):
            """Make a single request"""
            request = sample_transaction_request.copy()
            request["transactionId"] = tx_id
            
            start_time = time.perf_counter()
            response = client.post("/api/v1/analyze", json=request)
            end_time = time.perf_counter()
            
            return response.status_code, (end_time - start_time) * 1000
        
        # Test with multiple concurrent requests
        concurrent_requests = 20
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrent_requests) as executor:
            futures = [
                executor.submit(make_request, f"concurrent_tx_{i}")
                for i in range(concurrent_requests)
            ]
            
            start_time = time.perf_counter()
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
            end_time = time.perf_counter()
        
        total_time = (end_time - start_time) * 1000
        successful_requests = sum(1 for status_code, _ in results if status_code == 200)
        response_times = [response_time for _, response_time in results]
        
        avg_response_time = sum(response_times) / len(response_times)
        throughput = concurrent_requests / (total_time / 1000)
        
        print(f"Concurrent Requests Test:")
        print(f"  Concurrent requests: {concurrent_requests}")
        print(f"  Successful: {successful_requests}")
        print(f"  Total time: {total_time:.2f}ms")
        print(f"  Average response time: {avg_response_time:.2f}ms")
        print(f"  Throughput: {throughput:.1f} req/s")
        
        # Validate concurrent performance
        assert successful_requests == concurrent_requests, "Not all concurrent requests succeeded"
        assert avg_response_time < 500.0, f"Average concurrent response time {avg_response_time:.2f}ms too high"
        assert throughput > 10, f"Throughput {throughput:.1f} req/s too low for concurrent requests"
    
    def test_invalid_request_handling(self, client):
        """Test handling of invalid requests"""
        # Missing required fields
        invalid_requests = [
            {},  # Empty request
            {"transactionId": "tx_123"},  # Missing other fields
            {
                "transactionId": "tx_123",
                "fromWallet": "wallet_123",
                "toWallet": "wallet_456",
                "amount": "invalid_amount",  # Invalid amount type
                "currency": "USD-CBDC",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            },
            {
                "transactionId": "tx_123",
                "fromWallet": "wallet_123",
                "toWallet": "wallet_456",
                "amount": -100.0,  # Negative amount
                "currency": "USD-CBDC",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        ]
        
        for i, invalid_request in enumerate(invalid_requests):
            response = client.post("/api/v1/analyze", json=invalid_request)
            
            # Should return 422 for validation errors
            assert response.status_code == 422, f"Invalid request {i} should return 422"
            
            # Should include error details
            error_data = response.json()
            assert "detail" in error_data
    
    @patch('main.risk_engine')
    def test_performance_metrics_endpoint(self, mock_risk_engine, client):
        """Test performance metrics endpoint"""
        # Mock performance metrics
        mock_metrics = {
            'avg_processing_time_ms': 45.2,
            'p95_processing_time_ms': 78.5,
            'p99_processing_time_ms': 95.1,
            'max_processing_time_ms': 120.3,
            'sla_compliance_rate': 0.98,
            'total_assessments': 1000,
            'decision_distribution': {
                'approve': 800,
                'flag': 150,
                'hold': 40,
                'block': 10
            }
        }
        
        mock_risk_engine.get_performance_metrics.return_value = mock_metrics
        
        response = client.get("/api/v1/performance")
        assert response.status_code == 200
        
        data = response.json()
        assert data["service"] == "fraud-detection"
        assert "metrics" in data
        assert data["metrics"]["avg_processing_time_ms"] == 45.2
        assert data["metrics"]["sla_compliance_rate"] == 0.98
    
    @patch('main.risk_engine')
    def test_configuration_update_endpoint(self, mock_risk_engine, client):
        """Test configuration update endpoint"""
        config_update = {
            "model_weights": {
                "behavioral": 0.4,
                "graph": 0.3,
                "anomaly": 0.2,
                "rule_based": 0.1
            },
            "max_processing_time_ms": 80
        }
        
        mock_risk_engine.update_configuration.return_value = None
        
        response = client.post("/api/v1/configuration", json=config_update)
        assert response.status_code == 200
        
        data = response.json()
        assert data["message"] == "Configuration updated successfully"
        
        # Verify the mock was called with correct parameters
        mock_risk_engine.update_configuration.assert_called_once_with(config_update)
    
    @patch('main.risk_engine')
    def test_decision_rules_endpoints(self, mock_risk_engine, client):
        """Test decision rules management endpoints"""
        # Test adding a decision rule
        new_rule = {
            "name": "test_rule",
            "condition": "risk_score > 0.8",
            "action": "block",
            "priority": 90,
            "description": "Test rule for high risk transactions"
        }
        
        mock_risk_engine.add_decision_rule.return_value = None
        
        response = client.post("/api/v1/decision-rules", json=new_rule)
        assert response.status_code == 200
        
        data = response.json()
        assert "test_rule" in data["message"]
        
        # Test removing a decision rule
        mock_risk_engine.remove_decision_rule.return_value = None
        
        response = client.delete("/api/v1/decision-rules/test_rule")
        assert response.status_code == 200
        
        data = response.json()
        assert "test_rule" in data["message"]
    
    def test_model_feedback_endpoint(self, client):
        """Test model feedback endpoint"""
        feedback = {
            "transactionId": "tx_12345",
            "actualFraud": True,
            "feedbackType": "fraud_confirmation"
        }
        
        response = client.post("/api/v1/models/update", json=feedback)
        assert response.status_code == 200
        
        data = response.json()
        assert data["message"] == "Model feedback processed successfully"
    
    def test_error_handling_and_recovery(self, client, sample_transaction_request):
        """Test error handling and service recovery"""
        # Test with service temporarily unavailable
        with patch('main.behavioral_service', None):
            response = client.post("/api/v1/analyze", json=sample_transaction_request)
            
            # Should still return a response with fallback scores
            assert response.status_code == 200
            data = response.json()
            assert "overallScore" in data
            
            # Behavioral score should be default value when service unavailable
            assert data["behavioralScore"] == 0.5
    
    @patch('main.redis_client')
    def test_redis_failure_handling(self, mock_redis, client, sample_transaction_request):
        """Test handling of Redis connection failures"""
        # Mock Redis failure
        mock_redis.get.side_effect = Exception("Redis connection failed")
        mock_redis.setex.side_effect = Exception("Redis connection failed")
        
        # Service should still work without Redis
        response = client.post("/api/v1/analyze", json=sample_transaction_request)
        assert response.status_code == 200
        
        data = response.json()
        assert "overallScore" in data
        assert 0.0 <= data["overallScore"] <= 1.0

class TestFraudDetectionLoadTest:
    """Load tests for fraud detection service"""
    
    @pytest.fixture
    def client(self):
        """Test client for load testing"""
        return TestClient(app)
    
    def test_sustained_load(self, client):
        """Test service under sustained load"""
        import concurrent.futures
        import random
        
        def generate_transaction():
            """Generate a random transaction for testing"""
            return {
                "transactionId": f"load_tx_{random.randint(1000, 9999)}",
                "fromWallet": f"wallet_{random.randint(100, 999)}",
                "toWallet": f"wallet_{random.randint(100, 999)}",
                "amount": random.uniform(10.0, 5000.0),
                "currency": "USD-CBDC",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "userContext": {
                    "user_age_days": random.randint(1, 365),
                    "recent_transactions_1h": random.randint(0, 20),
                    "is_new_location": random.choice([True, False])
                }
            }
        
        def make_request():
            """Make a single request"""
            transaction = generate_transaction()
            start_time = time.perf_counter()
            response = client.post("/api/v1/analyze", json=transaction)
            end_time = time.perf_counter()
            
            return {
                'status_code': response.status_code,
                'response_time': (end_time - start_time) * 1000,
                'success': response.status_code == 200
            }
        
        # Load test parameters
        total_requests = 200
        max_workers = 10
        
        # Execute load test
        start_time = time.perf_counter()
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(make_request) for _ in range(total_requests)]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        end_time = time.perf_counter()
        total_time = end_time - start_time
        
        # Analyze results
        successful_requests = sum(1 for r in results if r['success'])
        response_times = [r['response_time'] for r in results if r['success']]
        
        if response_times:
            avg_response_time = sum(response_times) / len(response_times)
            p95_response_time = sorted(response_times)[int(0.95 * len(response_times))]
            max_response_time = max(response_times)
        else:
            avg_response_time = p95_response_time = max_response_time = 0
        
        throughput = successful_requests / total_time
        success_rate = successful_requests / total_requests
        
        print(f"Load Test Results:")
        print(f"  Total requests: {total_requests}")
        print(f"  Successful requests: {successful_requests}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Total time: {total_time:.2f}s")
        print(f"  Throughput: {throughput:.1f} req/s")
        print(f"  Average response time: {avg_response_time:.2f}ms")
        print(f"  P95 response time: {p95_response_time:.2f}ms")
        print(f"  Max response time: {max_response_time:.2f}ms")
        
        # Load test assertions
        assert success_rate >= 0.95, f"Success rate {success_rate:.2%} below 95%"
        assert throughput >= 20, f"Throughput {throughput:.1f} req/s below 20 req/s"
        assert avg_response_time < 300, f"Average response time {avg_response_time:.2f}ms exceeds 300ms"
        assert p95_response_time < 500, f"P95 response time {p95_response_time:.2f}ms exceeds 500ms"

if __name__ == "__main__":
    # Run integration tests
    pytest.main([__file__, "-v", "-s"])