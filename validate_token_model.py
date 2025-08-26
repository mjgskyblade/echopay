#!/usr/bin/env python3
"""
Token Model Validation Script
Validates the Go token model implementation for correctness
"""

import os
import re
import sys

def validate_go_syntax(file_path):
    """Basic Go syntax validation"""
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Check for basic Go syntax elements
    checks = [
        (r'package\s+\w+', 'Package declaration'),
        (r'import\s*\(', 'Import statements'),
        (r'type\s+\w+\s+struct\s*{', 'Struct definitions'),
        (r'func\s+\w+\(.*\)\s*.*{', 'Function definitions'),
    ]
    
    results = []
    for pattern, description in checks:
        if re.search(pattern, content):
            results.append(f"✅ {description} found")
        else:
            results.append(f"❌ {description} missing")
    
    return results

def validate_token_model():
    """Validate the token model implementation"""
    model_file = 'services/token-management/src/models/token.go'
    test_file = 'services/token-management/src/models/token_test.go'
    
    print("🧪 Token Model Validation")
    print("=" * 30)
    
    # Check if files exist
    if not os.path.exists(model_file):
        print(f"❌ Model file not found: {model_file}")
        return False
    
    if not os.path.exists(test_file):
        print(f"❌ Test file not found: {test_file}")
        return False
    
    print(f"✅ Model file exists: {model_file}")
    print(f"✅ Test file exists: {test_file}")
    
    # Validate model file
    print("\n📋 Validating model file structure:")
    model_results = validate_go_syntax(model_file)
    for result in model_results:
        print(f"  {result}")
    
    # Validate test file
    print("\n🧪 Validating test file structure:")
    test_results = validate_go_syntax(test_file)
    for result in test_results:
        print(f"  {result}")
    
    # Check for required model components
    print("\n🔍 Checking required model components:")
    with open(model_file, 'r') as f:
        content = f.read()
    
    required_components = [
        ('type Token struct', 'Token struct definition'),
        ('type TokenStatus', 'TokenStatus type definition'),
        ('type CBDCType', 'CBDCType type definition'),
        ('func NewToken', 'NewToken constructor'),
        ('func.*ValidateStateTransition', 'State transition validation'),
        ('func.*ChangeStatus', 'Status change method'),
        ('func.*Freeze', 'Freeze method'),
        ('func.*Unfreeze', 'Unfreeze method'),
        ('func.*TransferOwnership', 'Transfer ownership method'),
        ('TokenStatusActive', 'Active status constant'),
        ('TokenStatusFrozen', 'Frozen status constant'),
        ('TokenStatusDisputed', 'Disputed status constant'),
        ('TokenStatusInvalid', 'Invalid status constant'),
    ]
    
    for pattern, description in required_components:
        if re.search(pattern, content):
            print(f"  ✅ {description}")
        else:
            print(f"  ❌ {description} missing")
    
    # Check for required test functions
    print("\n🧪 Checking test coverage:")
    with open(test_file, 'r') as f:
        test_content = f.read()
    
    required_tests = [
        ('func TestNewToken', 'Token creation tests'),
        ('func TestTokenStateTransitions', 'State transition tests'),
        ('func TestTokenStatusMethods', 'Status method tests'),
        ('func TestTokenTransferOwnership', 'Transfer ownership tests'),
        ('func TestTokenStatusCheckers', 'Status checker tests'),
        ('func TestUpdateComplianceFlags', 'Compliance flag tests'),
        ('func TestValidateCBDCType', 'CBDC type validation tests'),
        ('func TestValidateDenomination', 'Denomination validation tests'),
    ]
    
    for pattern, description in required_tests:
        if re.search(pattern, test_content):
            print(f"  ✅ {description}")
        else:
            print(f"  ❌ {description} missing")
    
    # Check for error handling
    print("\n⚠️  Checking