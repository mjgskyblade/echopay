"""
Performance benchmarks for anomaly detection
Tests to ensure anomaly detection meets <100ms latency requirement
"""

import time
import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any
import statistics

from models.anomaly_model import (
    AnomalyAnalysisService,
    IsolationForestAnomalyDetector,
    EnsembleAnomalyDetector,
    TransactionFeatureExtractor
)

class AnomalyPerformanceBenchmark:
    """Performance benchmark suite for anomaly detection"""
    
    def __init__(self):
        self.service = AnomalyAnalysisService()
        self.feature_extractor = TransactionFeatureExtractor()
        self.isolation_forest = IsolationForestAnomalyDetector()
        self.ensemble = EnsembleAnomalyDetector()
        
        # Performance targets
        self.max_latency_ms = 100  # 100ms requirement
        self.target_p95_ms = 80    # 95th percentile should be under 80ms
        self.target_p99_ms = 95    # 99th percentile should be under 95ms
        
    def generate_test_transactions(self, count: int) -> List[Dict[str, Any]]:
        """Generate realistic test transactions"""
        transactions = []
        
        for i in range(count):
            # Generate realistic transaction amounts (log-normal distribution)
            amount = np.random.lognormal(mean=4.0, sigma=1.5)  # Mean ~$55, varied distribution
            amount = max(0.01, min(50000.0, amount))  # Clamp to reasonable range
            
            # Random timestamp within last 24 hours
            base_time = datetime.utcnow()
            random_offset = timedelta(seconds=np.random.randint(0, 86400))
            timestamp = base_time - random_offset
            
            transaction = {
                'id': f'tx_{i}',
                'amount': round(amount, 2),
                'timestamp': timestamp.isoformat(),
                'toWallet': f'wallet_{np.random.randint(1, 100)}',
                'fromWallet': f'user_{np.random.randint(1, 50)}'
            }
            
            transactions.append(transaction)
        
        return transactions
    
    def generate_user_history(self, user_id: str, transaction_count: int = 10) -> List[Dict[str, Any]]:
        """Generate realistic user transaction history"""
        history = []
        base_time = datetime.utcnow()
        
        # Generate consistent user behavior
        user_avg_amount = np.random.lognormal(mean=3.5, sigma=0.8)
        
        for i in range(transaction_count):
            # Amount varies around user's typical amount
            amount = max(0.01, np.random.normal(user_avg_amount, user_avg_amount * 0.3))
            
            # Timestamp going back in time
            time_offset = timedelta(days=np.random.exponential(2), hours=np.random.randint(0, 24))
            timestamp = base_time - time_offset
            
            transaction = {
                'amount': round(amount, 2),
                'timestamp': timestamp.isoformat(),
                'toWallet': f'wallet_{np.random.randint(1, 20)}',  # Smaller recipient pool for history
                'fromWallet': user_id
            }
            
            history.append(transaction)
        
        return sorted(history, key=lambda x: x['timestamp'])
    
    def benchmark_feature_extraction(self, iterations: int = 1000) -> Dict[str, float]:
        """Benchmark feature extraction performance"""
        print(f"Benchmarking feature extraction ({iterations} iterations)...")
        
        transactions = self.generate_test_transactions(iterations)
        times = []
        
        for transaction in transactions:
            # Generate some user history for realistic testing
            user_history = self.generate_user_history(transaction['fromWallet'], 5)
            
            start_time = time.perf_counter()
            features = self.feature_extractor.extract_transaction_features(transaction, user_history)
            end_time = time.perf_counter()
            
            processing_time_ms = (end_time - start_time) * 1000
            times.append(processing_time_ms)
        
        return self._calculate_performance_stats(times, "Feature Extraction")
    
    def benchmark_isolation_forest_prediction(self, iterations: int = 1000) -> Dict[str, float]:
        """Benchmark isolation forest prediction performance"""
        print(f"Benchmarking isolation forest prediction ({iterations} iterations)...")
        
        # Train a small model for testing
        np.random.seed(42)
        training_data = np.random.normal(0, 1, (100, 20))
        feature_names = [f'feature_{i}' for i in range(20)]
        
        self.isolation_forest.train(training_data, feature_names)
        
        # Generate test features
        test_transactions = self.generate_test_transactions(iterations)
        times = []
        
        for transaction in test_transactions:
            user_history = self.generate_user_history(transaction['fromWallet'], 3)
            features = self.feature_extractor.extract_transaction_features(transaction, user_history)
            
            start_time = time.perf_counter()
            score = self.isolation_forest.predict_anomaly_score(features)
            end_time = time.perf_counter()
            
            processing_time_ms = (end_time - start_time) * 1000
            times.append(processing_time_ms)
        
        return self._calculate_performance_stats(times, "Isolation Forest Prediction")
    
    def benchmark_ensemble_prediction(self, iterations: int = 1000) -> Dict[str, float]:
        """Benchmark ensemble prediction performance"""
        print(f"Benchmarking ensemble prediction ({iterations} iterations)...")
        
        # Train ensemble with minimal data for testing
        training_transactions = self.generate_test_transactions(50)
        self.ensemble.train(training_transactions)
        
        test_transactions = self.generate_test_transactions(iterations)
        times = []
        
        for transaction in test_transactions:
            user_history = self.generate_user_history(transaction['fromWallet'], 5)
            
            start_time = time.perf_counter()
            score, component_scores = self.ensemble.predict_anomaly_score(transaction, user_history)
            end_time = time.perf_counter()
            
            processing_time_ms = (end_time - start_time) * 1000
            times.append(processing_time_ms)
        
        return self._calculate_performance_stats(times, "Ensemble Prediction")
    
    async def benchmark_service_analysis(self, iterations: int = 1000) -> Dict[str, float]:
        """Benchmark full service analysis performance"""
        print(f"Benchmarking full service analysis ({iterations} iterations)...")
        
        test_transactions = self.generate_test_transactions(iterations)
        times = []
        
        for transaction in test_transactions:
            user_history = self.generate_user_history(transaction['fromWallet'], 8)
            
            start_time = time.perf_counter()
            score, result = await self.service.analyze_transaction_anomaly(transaction, user_history)
            end_time = time.perf_counter()
            
            processing_time_ms = (end_time - start_time) * 1000
            times.append(processing_time_ms)
        
        return self._calculate_performance_stats(times, "Full Service Analysis")
    
    async def benchmark_batch_analysis(self, batch_sizes: List[int] = [10, 50, 100]) -> Dict[str, Dict[str, float]]:
        """Benchmark batch analysis performance"""
        print("Benchmarking batch analysis performance...")
        
        results = {}
        
        for batch_size in batch_sizes:
            print(f"  Testing batch size: {batch_size}")
            
            # Generate batch of transactions
            transactions = []
            for i in range(batch_size):
                transaction = self.generate_test_transactions(1)[0]
                transaction['user_history'] = self.generate_user_history(transaction['fromWallet'], 5)
                transactions.append(transaction)
            
            # Measure batch processing time
            start_time = time.perf_counter()
            batch_results = await self.service.batch_analyze_transactions(transactions)
            end_time = time.perf_counter()
            
            total_time_ms = (end_time - start_time) * 1000
            avg_time_per_transaction = total_time_ms / batch_size
            
            results[f'batch_{batch_size}'] = {
                'total_time_ms': total_time_ms,
                'avg_time_per_transaction_ms': avg_time_per_transaction,
                'transactions_processed': len(batch_results),
                'throughput_per_second': (batch_size / total_time_ms) * 1000
            }
        
        return results
    
    def benchmark_concurrent_analysis(self, concurrent_requests: int = 10, iterations_per_request: int = 100) -> Dict[str, float]:
        """Benchmark concurrent analysis performance"""
        print(f"Benchmarking concurrent analysis ({concurrent_requests} concurrent, {iterations_per_request} each)...")
        
        async def analyze_batch():
            transactions = self.generate_test_transactions(iterations_per_request)
            times = []
            
            for transaction in transactions:
                user_history = self.generate_user_history(transaction['fromWallet'], 5)
                
                start_time = time.perf_counter()
                score, result = await self.service.analyze_transaction_anomaly(transaction, user_history)
                end_time = time.perf_counter()
                
                processing_time_ms = (end_time - start_time) * 1000
                times.append(processing_time_ms)
            
            return times
        
        # Run concurrent batches
        async def run_concurrent_test():
            tasks = [analyze_batch() for _ in range(concurrent_requests)]
            results = await asyncio.gather(*tasks)
            
            # Flatten all timing results
            all_times = []
            for batch_times in results:
                all_times.extend(batch_times)
            
            return all_times
        
        # Execute concurrent test
        all_times = asyncio.run(run_concurrent_test())
        
        return self._calculate_performance_stats(all_times, f"Concurrent Analysis ({concurrent_requests} concurrent)")
    
    def _calculate_performance_stats(self, times: List[float], test_name: str) -> Dict[str, float]:
        """Calculate performance statistics"""
        if not times:
            return {'error': 'No timing data'}
        
        times_array = np.array(times)
        
        stats = {
            'test_name': test_name,
            'iterations': len(times),
            'mean_ms': float(np.mean(times_array)),
            'median_ms': float(np.median(times_array)),
            'std_ms': float(np.std(times_array)),
            'min_ms': float(np.min(times_array)),
            'max_ms': float(np.max(times_array)),
            'p95_ms': float(np.percentile(times_array, 95)),
            'p99_ms': float(np.percentile(times_array, 99)),
            'p999_ms': float(np.percentile(times_array, 99.9)),
        }
        
        # Performance assessment
        stats['meets_latency_requirement'] = stats['p99_ms'] < self.max_latency_ms
        stats['meets_p95_target'] = stats['p95_ms'] < self.target_p95_ms
        stats['meets_p99_target'] = stats['p99_ms'] < self.target_p99_ms
        
        # Calculate percentage of requests meeting SLA
        stats['sla_compliance_rate'] = float(np.mean(times_array < self.max_latency_ms))
        
        # Print results
        print(f"\n{test_name} Performance Results:")
        print(f"  Iterations: {stats['iterations']}")
        print(f"  Mean: {stats['mean_ms']:.2f}ms")
        print(f"  Median: {stats['median_ms']:.2f}ms")
        print(f"  P95: {stats['p95_ms']:.2f}ms")
        print(f"  P99: {stats['p99_ms']:.2f}ms")
        print(f"  Max: {stats['max_ms']:.2f}ms")
        print(f"  SLA Compliance: {stats['sla_compliance_rate']:.1%}")
        print(f"  Meets Requirements: {stats['meets_latency_requirement']}")
        
        return stats
    
    def run_comprehensive_benchmark(self) -> Dict[str, Any]:
        """Run comprehensive performance benchmark suite"""
        print("=" * 60)
        print("ANOMALY DETECTION PERFORMANCE BENCHMARK")
        print("=" * 60)
        
        results = {}
        
        # 1. Feature extraction benchmark
        results['feature_extraction'] = self.benchmark_feature_extraction(1000)
        
        # 2. Isolation forest prediction benchmark
        results['isolation_forest'] = self.benchmark_isolation_forest_prediction(1000)
        
        # 3. Ensemble prediction benchmark
        results['ensemble_prediction'] = self.benchmark_ensemble_prediction(1000)
        
        # 4. Full service analysis benchmark
        results['service_analysis'] = asyncio.run(self.benchmark_service_analysis(1000))
        
        # 5. Batch analysis benchmark
        results['batch_analysis'] = asyncio.run(self.benchmark_batch_analysis([10, 50, 100]))
        
        # 6. Concurrent analysis benchmark
        results['concurrent_analysis'] = self.benchmark_concurrent_analysis(5, 100)
        
        # Overall assessment
        print("\n" + "=" * 60)
        print("OVERALL PERFORMANCE ASSESSMENT")
        print("=" * 60)
        
        # Check if all components meet requirements
        critical_components = ['service_analysis', 'ensemble_prediction']
        all_meet_requirements = True
        
        for component in critical_components:
            if component in results:
                meets_req = results[component].get('meets_latency_requirement', False)
                print(f"{component}: {'✓' if meets_req else '✗'} Meets <100ms requirement")
                if not meets_req:
                    all_meet_requirements = False
        
        results['overall_assessment'] = {
            'meets_all_requirements': all_meet_requirements,
            'max_latency_requirement_ms': self.max_latency_ms,
            'target_p95_ms': self.target_p95_ms,
            'target_p99_ms': self.target_p99_ms,
        }
        
        print(f"\nOverall Assessment: {'✓ PASS' if all_meet_requirements else '✗ FAIL'}")
        
        return results

def run_performance_tests():
    """Run performance tests"""
    benchmark = AnomalyPerformanceBenchmark()
    results = benchmark.run_comprehensive_benchmark()
    return results

if __name__ == "__main__":
    # Run performance benchmark
    results = run_performance_tests()
    
    # Save results to file for analysis
    import json
    with open('anomaly_performance_results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\nResults saved to anomaly_performance_results.json")