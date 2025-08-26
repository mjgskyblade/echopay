package errors

import (
	"errors"
	"testing"
)

func TestNewError(t *testing.T) {
	err := NewError(ErrInvalidTransaction, "Test error message", "test-service")
	
	if err.Code != ErrInvalidTransaction {
		t.Errorf("Expected code %s, got %s", ErrInvalidTransaction, err.Code)
	}
	
	if err.Message != "Test error message" {
		t.Errorf("Expected message 'Test error message', got %s", err.Message)
	}
	
	if err.Service != "test-service" {
		t.Errorf("Expected service 'test-service', got %s", err.Service)
	}
	
	if err.StackTrace == "" {
		t.Error("Expected stack trace to be populated")
	}
}

func TestWrapError(t *testing.T) {
	originalErr := errors.New("original error")
	wrappedErr := WrapError(originalErr, ErrDatabaseConnection, "Database error", "test-service")
	
	if wrappedErr.Code != ErrDatabaseConnection {
		t.Errorf("Expected code %s, got %s", ErrDatabaseConnection, wrappedErr.Code)
	}
	
	if wrappedErr.Cause != originalErr {
		t.Error("Expected cause to be set to original error")
	}
}

func TestWithContext(t *testing.T) {
	err := NewError(ErrInvalidTransaction, "Test error", "test-service")
	err = err.WithContext("trace-123", "user-456", "req-789")
	
	if err.TraceID != "trace-123" {
		t.Errorf("Expected trace ID 'trace-123', got %s", err.TraceID)
	}
	
	if err.UserID != "user-456" {
		t.Errorf("Expected user ID 'user-456', got %s", err.UserID)
	}
	
	if err.RequestID != "req-789" {
		t.Errorf("Expected request ID 'req-789', got %s", err.RequestID)
	}
}

func TestIsRetryable(t *testing.T) {
	retryableErr := NewError(ErrServiceUnavailable, "Service down", "test-service")
	if !retryableErr.IsRetryable() {
		t.Error("Expected service unavailable error to be retryable")
	}
	
	nonRetryableErr := NewError(ErrInvalidTransaction, "Bad request", "test-service")
	if nonRetryableErr.IsRetryable() {
		t.Error("Expected invalid transaction error to not be retryable")
	}
}

func TestIsUserError(t *testing.T) {
	userErr := NewError(ErrInsufficientFunds, "Not enough money", "test-service")
	if !userErr.IsUserError() {
		t.Error("Expected insufficient funds error to be a user error")
	}
	
	systemErr := NewError(ErrDatabaseConnection, "DB down", "test-service")
	if systemErr.IsUserError() {
		t.Error("Expected database connection error to not be a user error")
	}
}

func TestGetHTTPStatus(t *testing.T) {
	tests := []struct {
		code           string
		expectedStatus int
	}{
		{ErrInsufficientFunds, 402},
		{ErrInvalidTransaction, 400},
		{ErrTransactionNotFound, 404},
		{ErrAuthenticationFailed, 401},
		{ErrServiceUnavailable, 503},
		{"UNKNOWN_ERROR", 500},
	}
	
	for _, test := range tests {
		err := NewError(test.code, "Test message", "test-service")
		status := err.GetHTTPStatus()
		
		if status != test.expectedStatus {
			t.Errorf("Expected HTTP status %d for code %s, got %d", 
				test.expectedStatus, test.code, status)
		}
	}
}

func TestErrorString(t *testing.T) {
	err := NewError(ErrInvalidTransaction, "Test error message", "test-service")
	expected := "[test-service] INVALID_TRANSACTION: Test error message"
	
	if err.Error() != expected {
		t.Errorf("Expected error string '%s', got '%s'", expected, err.Error())
	}
}