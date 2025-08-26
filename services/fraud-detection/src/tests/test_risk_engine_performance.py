"""
Performance tests for real-time risk scoring and decision engine
Tests ensure <100ms latency requirement is met
"""

import pytest
import asyncio
import time
import statistics
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any
import redis
from unittest.mock import Mock, AsyncMock

from models.risk_engine import (
    RealTimeRiskEngine, RiskScoreCalculator, DecisionEngine,
    RiskAssessment, RiskLevel, TransactionAction, DecisionRule
)

class TestRiskEnginePerformance:
    """Performance tests for risk engine components"""
    
    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client"""
        mock_redis = Mock(spec=redis.Redis)
        mock_redis.get.return_value = None
        mock_redis.setex.return_value = True
        mock_redis.incr.return_value = 1
        mock_redis.expire.return_value = True
        return mock_redis
    
    @pytest.fixture
    def risk_calculator(self):
        """Risk score calculator instance"""
        return RiskScoreCalculator()
    
    @pytest.fixture
    def decision_engine(self, mock_redis):
        """Decision engine instance"""
        return DecisionEngine(mock_redis)
    
    @pytest.fixture
    def risk_engine(self, mock_redis):
        """Risk engine instance"""
        return RealTimeRiskEngine(mock_redis)
    
    @pytest.fixture
    def sample_component_scores(self):
        """Sample component scores for testing"""
        return {
            'behavioral': 0.3,
            'graph': 0.2,
            'anomaly': 0.4,
            'rule_based': 0.1
        }
    
    @pytest.fixture
    def sample_transaction_context(self):
        """Sample transaction context"""
        return {
            'amount': 1000.0,
            'user_id': 'user123',
            'user_age_days': 30,
            'recent_transactions_1h': 2,
            'is_new_location': False,
            'currency': 'USD-CBDC'
        }
    
    def test_risk_calculator_performance(self, risk_calculator, sample_component_scores, sample_transaction_context):
        """Test risk score calculation performance"""
        # Warm up
        for _ in range(10):
            risk_calculator.calculate_ensemble_score(sample_component_scores, sample_transaction_context)
        
        # Performance test
        times = []
        iterations = 1000
        
        for _ in range(iterations):
            start_time = time.perf_counter()
            score, confidence = risk_calculator.calculate_ensemble_score(
                sample_component_scores, sample_transaction_context
            )
            end_time = time.perf_counter()
            
            times.append((end_time - start_time) * 1000)  # Convert to milliseconds
            
            # Validate results
            assert 0.0 <= score <= 1.0
            assert 0.0 <= confidence <= 1.0
        
        # Performance assertions
        avg_time = statistics.mean(times)
        p95_time = np.percentile(times, 95)
        p99_time = np.percentile(times, 99)
        max_time = max(times)
        
        print(f"Risk Calculator Performance:")
        print(f"  Average: {avg_time:.2f}ms")
        print(f"  P95: {p95_time:.2f}ms")
        print(f"  P99: {p99_time:.2f}ms")
        print(f"  Max: {max_time:.2f}ms")
        
        # Performance requirements
        assert avg_time < 5.0, f"Average calculation time {avg_time:.2f}ms exceeds 5ms"
        assert p95_time < 10.0, f"P95 calculation time {p95_time:.2f}ms exceeds 10ms"
        assert max_time < 20.0, f"Max calculation time {max_time:.2f}ms exceeds 20ms"
    
    def test_decision_engine_performance(self, decision_engine, sample_component_scores, sample_transaction_context):
        """Test decision engine performance"""
        risk_assessment = {
            'overall_risk_score': 0.6,
            'confidence': 0.8,
            'component_scores': sample_component_scores,
            'risk_factors': ['medium_risk']
        }
        
        # Warm up
        for _ in range(10):
            decision_engine.make_decision(risk_assessment, sample_transaction_context)
        
        # Performance test
        times = []
        iterations = 1000
        
        for _ in range(iterations):
            start_time = time.perf_counter()
            action = decision_engine.make_decision(risk_assessment, sample_transaction_context)
            end_time = time.perf_counter()
            
            times.append((end_time - start_time) * 1000)  # Convert to milliseconds
            
            # Validate result
            assert isinstance(action, TransactionAction)
        
        # Performance assertions
        avg_time = statistics.mean(times)
        p95_time = np.percentile(times, 95)
        p99_time = np.percentile(times, 99)
        max_time = max(times)
        
        print(f"Decision Engine Performance:")
        print(f"  Average: {avg_time:.2f}ms")
        print(f"  P95: {p95_time:.2f}ms")
        print(f"  P99: {p99_time:.2f}ms")
        print(f"  Max: {max_time:.2f}ms")
        
        # Performance requirements
        assert avg_time < 2.0, f"Average decision time {avg_time:.2f}ms exceeds 2ms"
        assert p95_time < 5.0, f"P95 decision time {p95_time:.2f}ms exceeds 5ms"
        assert max_time < 10.0, f"Max decision time {max_time:.2f}ms exceeds 10ms"
    
    @pytest.mark.asyncio
    async def test_risk_engine_end_to_end_performance(self, risk_engine, sample_component_scores, sample_transaction_context):
        """Test end-to-end risk engine performance"""
        # Warm up
        for i in range(10):
            await risk_engine.assess_transaction_risk(
                f"warmup_{i}", sample_component_scores, sample_transaction_context
            )
        
        # Performance test
        times = []
        iterations = 500  # Fewer iterations for async test
        
        for i in range(iterations):
            transaction_id = f"test_tx_{i}"
            
            start_time = time.perf_counter()
            assessment = await risk_engine.assess_transaction_risk(
                transaction_id, sample_component_scores, sample_transaction_context
            )
            end_time = time.perf_counter()
            
            processing_time = (end_time - start_time) * 1000  # Convert to milliseconds
            times.append(processing_time)
            
            # Validate assessment
            assert isinstance(assessment, RiskAssessment)
            assert assessment.transaction_id == transaction_id
            assert 0.0 <= assessment.overall_risk_score <= 1.0
            assert isinstance(assessment.risk_level, RiskLevel)
            assert isinstance(assessment.recommended_action, TransactionAction)
            assert assessment.processing_time_ms > 0
        
        # Performance assertions
        avg_time = statistics.mean(times)
        p95_time = np.percentile(times, 95)
        p99_time = np.percentile(times, 99)
        max_time = max(times)
        
        print(f"End-to-End Risk Engine Performance:")
        print(f"  Average: {avg_time:.2f}ms")
        print(f"  P95: {p95_time:.2f}ms")
        print(f"  P99: {p99_time:.2f}ms")
        print(f"  Max: {max_time:.2f}ms")
        
        # Critical performance requirements
        assert avg_time < 50.0, f"Average processing time {avg_time:.2f}ms exceeds 50ms"
        assert p95_time < 80.0, f"P95 processing time {p95_time:.2f}ms exceeds 80ms"
        assert p99_time < 100.0, f"P99 processing time {p99_time:.2f}ms exceeds 100ms"
        assert max_time < 150.0, f"Max processing time {max_time:.2f}ms exceeds 150ms"
    
    @pytest.mark.asyncio
    async def test_concurrent_risk_assessments(self, risk_engine, sample_component_scores, sample_transaction_context):
        """Test concurrent risk assessments performance"""
        concurrent_requests = 50
        
        async def assess_transaction(tx_id: str):
            """Assess a single transaction"""
            start_time = time.perf_counter()
            assessment = await risk_engine.assess_transaction_risk(
                tx_id, sample_component_scores, sample_transaction_context
            )
            end_time = time.perf_counter()
            return (end_time - start_time) * 1000, assessment
        
        # Create concurrent tasks
        tasks = [
            assess_transaction(f"concurrent_tx_{i}")
            for i in range(concurrent_requests)
        ]
        
        # Execute all tasks concurrently
        start_time = time.perf_counter()
        results = await asyncio.gather(*tasks)
        end_time = time.perf_counter()
        
        total_time = (end_time - start_time) * 1000
        times = [result[0] for result in results]
        assessments = [result[1] for result in results]
        
        # Validate all assessments
        assert len(assessments) == concurrent_requests
        for assessment in assessments:
            assert isinstance(assessment, RiskAssessment)
            assert 0.0 <= assessment.overall_risk_score <= 1.0
        
        # Performance metrics
        avg_time = statistics.mean(times)
        p95_time = np.percentile(times, 95)
        max_time = max(times)
        throughput = concurrent_requests / (total_time / 1000)  # requests per second
        
        print(f"Concurrent Risk Assessment Performance ({concurrent_requests} requests):")
        print(f"  Total time: {total_time:.2f}ms")
        print(f"  Average per request: {avg_time:.2f}ms")
        print(f"  P95 per request: {p95_time:.2f}ms")
        print(f"  Max per request: {max_time:.2f}ms")
        print(f"  Throughput: {throughput:.1f} requests/second")
        
        # Performance requirements for concurrent processing
        assert avg_time < 100.0, f"Average concurrent processing time {avg_time:.2f}ms exceeds 100ms"
        assert p95_time < 150.0, f"P95 concurrent processing time {p95_time:.2f}ms exceeds 150ms"
        assert throughput > 100, f"Throughput {throughput:.1f} req/s is below 100 req/s"
    
    @pytest.mark.asyncio
    async def test_batch_assessment_performance(self, risk_engine, sample_component_scores, sample_transaction_context):
        """Test batch assessment performance"""
        batch_size = 100
        
        # Create batch of transactions
        transactions = []
        for i in range(batch_size):
            transactions.append({
                'transaction_id': f'batch_tx_{i}',
                'component_scores': sample_component_scores.copy(),
                'transaction_context': sample_transaction_context.copy()
            })
        
        # Batch assessment
        start_time = time.perf_counter()
        assessments = await risk_engine.batch_assess_transactions(transactions)
        end_time = time.perf_counter()
        
        total_time = (end_time - start_time) * 1000
        avg_time_per_tx = total_time / batch_size
        throughput = batch_size / (total_time / 1000)
        
        # Validate results
        assert len(assessments) == batch_size
        for assessment in assessments:
            assert isinstance(assessment, RiskAssessment)
            assert 0.0 <= assessment.overall_risk_score <= 1.0
        
        print(f"Batch Assessment Performance ({batch_size} transactions):")
        print(f"  Total time: {total_time:.2f}ms")
        print(f"  Average per transaction: {avg_time_per_tx:.2f}ms")
        print(f"  Throughput: {throughput:.1f} transactions/second")
        
        # Performance requirements for batch processing
        assert avg_time_per_tx < 50.0, f"Average batch processing time {avg_time_per_tx:.2f}ms exceeds 50ms"
        assert throughput > 200, f"Batch throughput {throughput:.1f} tx/s is below 200 tx/s"
    
    def test_memory_usage_under_load(self, risk_engine, sample_component_scores, sample_transaction_context):
        """Test memory usage under sustained load"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Simulate sustained load
        iterations = 1000
        for i in range(iterations):
            # Create assessment (synchronous version for this test)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            assessment = loop.run_until_complete(
                risk_engine.assess_transaction_risk(
                    f"memory_test_{i}", sample_component_scores, sample_transaction_context
                )
            )
            
            loop.close()
            
            # Check memory every 100 iterations
            if i % 100 == 0:
                current_memory = process.memory_info().rss / 1024 / 1024  # MB
                memory_increase = current_memory - initial_memory
                
                print(f"Iteration {i}: Memory usage {current_memory:.1f}MB (+{memory_increase:.1f}MB)")
                
                # Memory should not grow excessively
                assert memory_increase < 100, f"Memory usage increased by {memory_increase:.1f}MB"
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        total_increase = final_memory - initial_memory
        
        print(f"Memory Usage Test:")
        print(f"  Initial: {initial_memory:.1f}MB")
        print(f"  Final: {final_memory:.1f}MB")
        print(f"  Increase: {total_increase:.1f}MB")
        
        # Memory leak check
        assert total_increase < 50, f"Total memory increase {total_increase:.1f}MB suggests memory leak"
    
    def test_decision_rule_performance_with_many_rules(self, mock_redis):
        """Test decision engine performance with many rules"""
        decision_engine = DecisionEngine(mock_redis)
        
        # Add many custom rules
        for i in range(100):
            rule = DecisionRule(
                name=f"custom_rule_{i}",
                condition=f"risk_score > {i/100.0}",
                action=TransactionAction.FLAG,
                priority=i,
                description=f"Custom rule {i}"
            )
            decision_engine.add_custom_rule(rule)
        
        # Test performance with many rules
        risk_assessment = {
            'overall_risk_score': 0.5,
            'confidence': 0.8,
            'component_scores': {'behavioral': 0.5},
            'risk_factors': ['test']
        }
        
        times = []
        iterations = 1000
        
        for _ in range(iterations):
            start_time = time.perf_counter()
            action = decision_engine.make_decision(risk_assessment, {})
            end_time = time.perf_counter()
            
            times.append((end_time - start_time) * 1000)
        
        avg_time = statistics.mean(times)
        max_time = max(times)
        
        print(f"Decision Engine with Many Rules Performance:")
        print(f"  Rules count: {len(decision_engine.decision_rules)}")
        print(f"  Average: {avg_time:.2f}ms")
        print(f"  Max: {max_time:.2f}ms")
        
        # Should still be fast even with many rules
        assert avg_time < 5.0, f"Average decision time {avg_time:.2f}ms with many rules exceeds 5ms"
        assert max_time < 15.0, f"Max decision time {max_time:.2f}ms with many rules exceeds 15ms"

class TestRiskEngineStressTest:
    """Stress tests for risk engine under extreme conditions"""
    
    @pytest.fixture
    def risk_engine(self):
        """Risk engine for stress testing"""
        mock_redis = Mock(spec=redis.Redis)
        mock_redis.get.return_value = None
        mock_redis.setex.return_value = True
        return RealTimeRiskEngine(mock_redis)
    
    @pytest.mark.asyncio
    async def test_high_throughput_stress(self, risk_engine):
        """Stress test with very high throughput"""
        requests_per_second = 1000
        duration_seconds = 5
        total_requests = requests_per_second * duration_seconds
        
        component_scores = {
            'behavioral': 0.3,
            'graph': 0.2,
            'anomaly': 0.4,
            'rule_based': 0.1
        }
        
        transaction_context = {
            'amount': 1000.0,
            'user_id': 'stress_user',
            'user_age_days': 30,
            'recent_transactions_1h': 2,
            'is_new_location': False
        }
        
        # Create all tasks
        tasks = []
        for i in range(total_requests):
            task = risk_engine.assess_transaction_risk(
                f"stress_tx_{i}", component_scores, transaction_context
            )
            tasks.append(task)
        
        # Execute with controlled concurrency
        semaphore = asyncio.Semaphore(100)  # Limit concurrent requests
        
        async def limited_assess(task):
            async with semaphore:
                return await task
        
        limited_tasks = [limited_assess(task) for task in tasks]
        
        start_time = time.perf_counter()
        results = await asyncio.gather(*limited_tasks, return_exceptions=True)
        end_time = time.perf_counter()
        
        total_time = end_time - start_time
        actual_throughput = len(results) / total_time
        
        # Count successful assessments
        successful = sum(1 for r in results if isinstance(r, RiskAssessment))
        error_rate = (len(results) - successful) / len(results)
        
        print(f"High Throughput Stress Test:")
        print(f"  Target: {requests_per_second} req/s for {duration_seconds}s")
        print(f"  Actual throughput: {actual_throughput:.1f} req/s")
        print(f"  Total requests: {len(results)}")
        print(f"  Successful: {successful}")
        print(f"  Error rate: {error_rate:.2%}")
        print(f"  Total time: {total_time:.2f}s")
        
        # Stress test requirements
        assert actual_throughput > 500, f"Throughput {actual_throughput:.1f} req/s below minimum 500 req/s"
        assert error_rate < 0.01, f"Error rate {error_rate:.2%} exceeds 1%"
        assert successful > total_requests * 0.99, f"Success rate too low: {successful}/{total_requests}"
    
    @pytest.mark.asyncio
    async def test_extreme_score_values(self, risk_engine):
        """Test with extreme component score values"""
        extreme_cases = [
            # All zeros
            {'behavioral': 0.0, 'graph': 0.0, 'anomaly': 0.0, 'rule_based': 0.0},
            # All ones
            {'behavioral': 1.0, 'graph': 1.0, 'anomaly': 1.0, 'rule_based': 1.0},
            # Mixed extremes
            {'behavioral': 0.0, 'graph': 1.0, 'anomaly': 0.0, 'rule_based': 1.0},
            # Invalid values (should be handled gracefully)
            {'behavioral': -0.5, 'graph': 1.5, 'anomaly': float('nan'), 'rule_based': None},
        ]
        
        transaction_context = {'amount': 1000.0, 'user_id': 'extreme_test'}
        
        for i, scores in enumerate(extreme_cases):
            assessment = await risk_engine.assess_transaction_risk(
                f"extreme_tx_{i}", scores, transaction_context
            )
            
            # Should handle extreme values gracefully
            assert isinstance(assessment, RiskAssessment)
            assert 0.0 <= assessment.overall_risk_score <= 1.0
            assert 0.0 <= assessment.confidence <= 1.0
            assert assessment.processing_time_ms < 100.0
            
            print(f"Extreme case {i}: score={assessment.overall_risk_score:.3f}, "
                  f"confidence={assessment.confidence:.3f}")

if __name__ == "__main__":
    # Run performance tests
    pytest.main([__file__, "-v", "-s"])