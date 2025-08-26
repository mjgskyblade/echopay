#!/usr/bin/env python3
"""
Latency Requirements Validation Script
Validates that fraud detection meets <100ms latency requirement
"""

import asyncio
import time
import statistics
import json
import sys
import os
from datetime import datetime
from typing import List, Dict, Any
import numpy as np

# Add src to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from models.risk_engine import RealTimeRiskEngine
from models.behavioral_model import BehavioralAnalysisService
from models.graph_model import GraphAnalysisService
from models.anomaly_model import AnomalyAnalysisService

class LatencyValidator:
    """Validates latency requirements for fraud detection"""
    
    def __init__(self):
        self.risk_engine = RealTimeRiskEngine()
        self.behavioral_service = BehavioralAnalysisService()
        self.graph_service = GraphAnalysisService()
        self.anomaly_service = AnomalyAnalysisService()
        
        # Latency requirements
        self.max_latency_ms = 100.0
        self.target_p95_ms = 80.0
        self.target_avg_ms = 50.0
        
        # Test results
        self.results = {
            'risk_engine': [],
            'behavioral': [],
            'graph': [],
            'anomaly': [],
            'end_to_end': []
        }
    
    def generate_test_transaction(self, tx_id: str) -> Dict[str, Any]:
        """Generate a test transaction"""
        return {
            'transactionId': tx_id,
            'fromWallet': f'wallet_{tx_id}',
            'toWallet': f'merchant_{tx_id}',
            'amount': np.random.uniform(10.0, 5000.0),
            'currency': 'USD-CBDC',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'metadata': {
                'user_age_days': np.random.randint(1, 365),
                'recent_transactions_1h': np.random.randint(0, 10),
                'is_new_location': np.random.choice([True, False])
            }
        }
    
    def generate_component_scores(self) -> Dict[str, float]:
        """Generate realistic component scores"""
        return {
            'behavioral': np.random.beta(2, 5),  # Skewed towards lower scores
            'graph': np.random.beta(1.5, 8),     # Even more skewed
            'anomaly': np.random.beta(2, 6),     # Moderate skew
            'rule_based': np.random.beta(1, 9)   # Heavily skewed towards low
        }
    
    async def test_risk_engine_latency(self, iterations: int = 1000) -> Dict[str, float]:
        """Test risk engine latency"""
        print(f"Testing Risk Engine latency ({iterations} iterations)...")
        
        times = []
        
        for i in range(iterations):
            tx_id = f"risk_test_{i}"
            component_scores = self.generate_component_scores()
            transaction_context = {
                'amount': np.random.uniform(10.0, 5000.0),
                'user_id': f'user_{i}',
                'user_age_days': np.random.randint(1, 365),
                'recent_transactions_1h': np.random.randint(0, 10),
                'is_new_location': np.random.choice([True, False])
            }
            
            start_time = time.perf_counter()
            assessment = await self.risk_engine.assess_transaction_risk(
                tx_id, component_scores, transaction_context
            )
            end_time = time.perf_counter()
            
            latency_ms = (end_time - start_time) * 1000
            times.append(latency_ms)
            
            # Validate assessment
            assert 0.0 <= assessment.overall_risk_score <= 1.0
            assert assessment.processing_time_ms > 0
        
        self.results['risk_engine'] = times
        return self._calculate_metrics(times, "Risk Engine")
    
    async def test_behavioral_analysis_latency(self, iterations: int = 500) -> Dict[str, float]:
        """Test behavioral analysis latency"""
        print(f"Testing Behavioral Analysis latency ({iterations} iterations)...")
        
        times = []
        
        for i in range(iterations):
            user_id = f"user_{i}"
            transaction = self.generate_test_transaction(f"behavioral_test_{i}")
            
            start_time = time.perf_counter()
            score = await self.behavioral_service.analyze_user_behavior(user_id, transaction)
            end_time = time.perf_counter()
            
            latency_ms = (end_time - start_time) * 1000
            times.append(latency_ms)
            
            # Validate score
            assert 0.0 <= score <= 1.0
        
        self.results['behavioral'] = times
        return self._calculate_metrics(times, "Behavioral Analysis")
    
    def test_graph_analysis_latency(self, iterations: int = 500) -> Dict[str, float]:
        """Test graph analysis latency"""
        print(f"Testing Graph Analysis latency ({iterations} iterations)...")
        
        times = []
        
        for i in range(iterations):
            user_id = f"user_{i}"
            transaction = self.generate_test_transaction(f"graph_test_{i}")
            
            start_time = time.perf_counter()
            score = self.graph_service.analyze_transaction_network(user_id, transaction)
            end_time = time.perf_counter()
            
            latency_ms = (end_time - start_time) * 1000
            times.append(latency_ms)
            
            # Validate score
            assert 0.0 <= score <= 1.0
        
        self.results['graph'] = times
        return self._calculate_metrics(times, "Graph Analysis")
    
    def test_anomaly_detection_latency(self, iterations: int = 500) -> Dict[str, float]:
        """Test anomaly detection latency"""
        print(f"Testing Anomaly Detection latency ({iterations} iterations)...")
        
        times = []
        
        for i in range(iterations):
            transaction = self.generate_test_transaction(f"anomaly_test_{i}")
            user_history = []  # Empty history for speed
            
            start_time = time.perf_counter()
            score, _ = self.anomaly_service.ensemble_detector.predict_anomaly_score(
                transaction, user_history
            )
            end_time = time.perf_counter()
            
            latency_ms = (end_time - start_time) * 1000
            times.append(latency_ms)
            
            # Validate score
            assert 0.0 <= score <= 1.0
        
        self.results['anomaly'] = times
        return self._calculate_metrics(times, "Anomaly Detection")
    
    async def test_end_to_end_latency(self, iterations: int = 200) -> Dict[str, float]:
        """Test complete end-to-end latency"""
        print(f"Testing End-to-End latency ({iterations} iterations)...")
        
        times = []
        
        for i in range(iterations):
            user_id = f"user_{i}"
            transaction = self.generate_test_transaction(f"e2e_test_{i}")
            
            start_time = time.perf_counter()
            
            # Simulate complete pipeline
            # 1. Behavioral analysis
            behavioral_score = await self.behavioral_service.analyze_user_behavior(user_id, transaction)
            
            # 2. Graph analysis
            graph_score = self.graph_service.analyze_transaction_network(user_id, transaction)
            
            # 3. Anomaly detection
            anomaly_score, _ = self.anomaly_service.ensemble_detector.predict_anomaly_score(
                transaction, []
            )
            
            # 4. Risk engine assessment
            component_scores = {
                'behavioral': behavioral_score,
                'graph': graph_score,
                'anomaly': anomaly_score,
                'rule_based': np.random.uniform(0.0, 0.3)
            }
            
            transaction_context = {
                'amount': transaction['amount'],
                'user_id': user_id,
                'user_age_days': transaction['metadata']['user_age_days'],
                'recent_transactions_1h': transaction['metadata']['recent_transactions_1h'],
                'is_new_location': transaction['metadata']['is_new_location']
            }
            
            assessment = await self.risk_engine.assess_transaction_risk(
                transaction['transactionId'], component_scores, transaction_context
            )
            
            end_time = time.perf_counter()
            
            latency_ms = (end_time - start_time) * 1000
            times.append(latency_ms)
            
            # Validate assessment
            assert 0.0 <= assessment.overall_risk_score <= 1.0
        
        self.results['end_to_end'] = times
        return self._calculate_metrics(times, "End-to-End")
    
    def _calculate_metrics(self, times: List[float], component_name: str) -> Dict[str, float]:
        """Calculate performance metrics"""
        if not times:
            return {}
        
        metrics = {
            'avg_ms': statistics.mean(times),
            'median_ms': statistics.median(times),
            'p95_ms': np.percentile(times, 95),
            'p99_ms': np.percentile(times, 99),
            'max_ms': max(times),
            'min_ms': min(times),
            'std_ms': statistics.stdev(times) if len(times) > 1 else 0.0,
            'sla_compliance': sum(1 for t in times if t <= self.max_latency_ms) / len(times)
        }
        
        print(f"\n{component_name} Performance Metrics:")
        print(f"  Average: {metrics['avg_ms']:.2f}ms")
        print(f"  Median: {metrics['median_ms']:.2f}ms")
        print(f"  P95: {metrics['p95_ms']:.2f}ms")
        print(f"  P99: {metrics['p99_ms']:.2f}ms")
        print(f"  Max: {metrics['max_ms']:.2f}ms")
        print(f"  Min: {metrics['min_ms']:.2f}ms")
        print(f"  Std Dev: {metrics['std_ms']:.2f}ms")
        print(f"  SLA Compliance (<{self.max_latency_ms}ms): {metrics['sla_compliance']:.1%}")
        
        return metrics
    
    def validate_requirements(self, metrics: Dict[str, Dict[str, float]]) -> bool:
        """Validate that all components meet latency requirements"""
        print("\n" + "="*60)
        print("LATENCY REQUIREMENTS VALIDATION")
        print("="*60)
        
        all_passed = True
        
        for component, component_metrics in metrics.items():
            if not component_metrics:
                continue
                
            print(f"\n{component.upper()} Requirements:")
            
            # Check average latency
            avg_passed = component_metrics['avg_ms'] <= self.target_avg_ms
            print(f"  Average latency: {component_metrics['avg_ms']:.2f}ms <= {self.target_avg_ms}ms: {'✓' if avg_passed else '✗'}")
            
            # Check P95 latency
            p95_passed = component_metrics['p95_ms'] <= self.target_p95_ms
            print(f"  P95 latency: {component_metrics['p95_ms']:.2f}ms <= {self.target_p95_ms}ms: {'✓' if p95_passed else '✗'}")
            
            # Check maximum latency (SLA)
            max_passed = component_metrics['max_ms'] <= self.max_latency_ms
            print(f"  Max latency: {component_metrics['max_ms']:.2f}ms <= {self.max_latency_ms}ms: {'✓' if max_passed else '✗'}")
            
            # Check SLA compliance
            sla_passed = component_metrics['sla_compliance'] >= 0.99
            print(f"  SLA compliance: {component_metrics['sla_compliance']:.1%} >= 99%: {'✓' if sla_passed else '✗'}")
            
            component_passed = avg_passed and p95_passed and max_passed and sla_passed
            all_passed = all_passed and component_passed
            
            print(f"  Overall: {'✓ PASSED' if component_passed else '✗ FAILED'}")
        
        print(f"\n{'='*60}")
        print(f"OVERALL RESULT: {'✓ ALL REQUIREMENTS MET' if all_passed else '✗ REQUIREMENTS NOT MET'}")
        print(f"{'='*60}")
        
        return all_passed
    
    async def run_comprehensive_test(self) -> bool:
        """Run comprehensive latency validation"""
        print("Starting Comprehensive Latency Validation...")
        print(f"Target Requirements:")
        print(f"  Average latency: <{self.target_avg_ms}ms")
        print(f"  P95 latency: <{self.target_p95_ms}ms")
        print(f"  Maximum latency: <{self.max_latency_ms}ms")
        print(f"  SLA compliance: >99%")
        
        metrics = {}
        
        try:
            # Test individual components
            metrics['risk_engine'] = await self.test_risk_engine_latency()
            metrics['behavioral'] = await self.test_behavioral_analysis_latency()
            metrics['graph'] = self.test_graph_analysis_latency()
            metrics['anomaly'] = self.test_anomaly_detection_latency()
            
            # Test end-to-end pipeline
            metrics['end_to_end'] = await self.test_end_to_end_latency()
            
            # Validate requirements
            requirements_met = self.validate_requirements(metrics)
            
            # Save detailed results
            self._save_results(metrics)
            
            return requirements_met
            
        except Exception as e:
            print(f"Error during latency testing: {e}")
            return False
    
    def _save_results(self, metrics: Dict[str, Dict[str, float]]):
        """Save detailed results to file"""
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'requirements': {
                'max_latency_ms': self.max_latency_ms,
                'target_p95_ms': self.target_p95_ms,
                'target_avg_ms': self.target_avg_ms
            },
            'metrics': metrics,
            'raw_data': self.results
        }
        
        with open('latency_test_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\nDetailed results saved to: latency_test_results.json")

async def main():
    """Main function to run latency validation"""
    validator = LatencyValidator()
    
    print("EchoPay Fraud Detection - Latency Requirements Validation")
    print("="*60)
    
    success = await validator.run_comprehensive_test()
    
    if success:
        print("\n🎉 All latency requirements have been met!")
        sys.exit(0)
    else:
        print("\n❌ Some latency requirements were not met. Check the results above.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())