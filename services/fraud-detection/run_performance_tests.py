#!/usr/bin/env python3
"""
Performance Test Runner
Executes all performance tests for the fraud detection service
"""

import subprocess
import sys
import os
import time
from datetime import datetime

def run_command(command, description):
    """Run a command and return success status"""
    print(f"\n{'='*60}")
    print(f"Running: {description}")
    print(f"Command: {command}")
    print(f"{'='*60}")
    
    start_time = time.time()
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            cwd=os.path.dirname(__file__)
        )
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"✓ {description} completed successfully in {duration:.2f}s")
        
        if result.stdout:
            print("STDOUT:")
            print(result.stdout)
        
        return True
        
    except subprocess.CalledProcessError as e:
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"✗ {description} failed after {duration:.2f}s")
        print(f"Return code: {e.returncode}")
        
        if e.stdout:
            print("STDOUT:")
            print(e.stdout)
        
        if e.stderr:
            print("STDERR:")
            print(e.stderr)
        
        return False

def main():
    """Main function to run all performance tests"""
    print("EchoPay Fraud Detection - Performance Test Suite")
    print(f"Started at: {datetime.now().isoformat()}")
    print("="*60)
    
    # Change to the fraud detection service directory
    os.chdir(os.path.dirname(__file__))
    
    # Test commands to run
    tests = [
        {
            "command": "python -m pytest src/tests/test_risk_engine_performance.py -v -s",
            "description": "Risk Engine Performance Tests"
        },
        {
            "command": "python -m pytest src/tests/test_fraud_detection_integration.py::TestFraudDetectionIntegration::test_analyze_transaction_performance -v -s",
            "description": "API Performance Tests"
        },
        {
            "command": "python -m pytest src/tests/test_fraud_detection_integration.py::TestFraudDetectionIntegration::test_concurrent_requests -v -s",
            "description": "Concurrent Request Tests"
        },
        {
            "command": "python -m pytest src/tests/test_fraud_detection_integration.py::TestFraudDetectionLoadTest::test_sustained_load -v -s",
            "description": "Load Tests"
        },
        {
            "command": "python test_latency_requirements.py",
            "description": "Latency Requirements Validation"
        }
    ]
    
    # Track results
    results = []
    
    # Run each test
    for test in tests:
        success = run_command(test["command"], test["description"])
        results.append({
            "test": test["description"],
            "success": success
        })
    
    # Summary
    print(f"\n{'='*60}")
    print("PERFORMANCE TEST SUMMARY")
    print(f"{'='*60}")
    
    total_tests = len(results)
    passed_tests = sum(1 for r in results if r["success"])
    failed_tests = total_tests - passed_tests
    
    for result in results:
        status = "✓ PASSED" if result["success"] else "✗ FAILED"
        print(f"  {result['test']}: {status}")
    
    print(f"\nTotal: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
    
    print(f"\nCompleted at: {datetime.now().isoformat()}")
    
    # Exit with appropriate code
    if failed_tests == 0:
        print("\n🎉 All performance tests passed!")
        sys.exit(0)
    else:
        print(f"\n❌ {failed_tests} performance test(s) failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()