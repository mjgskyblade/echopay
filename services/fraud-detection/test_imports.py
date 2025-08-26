#!/usr/bin/env python3
"""
Test basic imports and functionality without external dependencies
"""

import sys
import os

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_imports():
    """Test if we can import the basic modules"""
    print("Testing imports...")
    
    try:
        import numpy as np
        print("✓ numpy imported successfully")
    except ImportError as e:
        print(f"✗ numpy import failed: {e}")
        return False
    
    try:
        import pandas as pd
        print("✓ pandas imported successfully")
    except ImportError as e:
        print(f"✗ pandas import failed: {e}")
        return False
    
    try:
        from datetime import datetime, timedelta
        from collections import defaultdict, deque
        print("✓ standard library imports successful")
    except ImportError as e:
        print(f"✗ standard library imports failed: {e}")
        return False
    
    # Test if we can create basic data structures
    try:
        test_dict = defaultdict(int)
        test_deque = deque(maxlen=100)
        test_time = datetime.utcnow()
        print("✓ basic data structures working")
    except Exception as e:
        print(f"✗ basic data structures failed: {e}")
        return False
    
    return True

if __name__ == "__main__":
    if test_imports():
        print("✅ Basic imports working")
    else:
        print("❌ Import issues detected")
        sys.exit(1)