package errors

import (
	"fmt"
	"runtime"
	"time"
)

// EchoPayError represents a structured error with context
type EchoPayError struct {
	Code        string                 `json:"code"`
	Message     string                 `json:"message"`
	Service     string                 `json:"service"`
	Timestamp   time.Time              `json:"timestamp"`
	TraceID     string                 `json:"trace_id,omitempty"`
	UserID      string                 `json:"user_id,omitempty"`
	RequestID   string                 `json:"request_id,omitempty"`
	Details     map[string]interface{} `json:"details,omitempty"`
	StackTrace  string                 `json:"stack_trace,omitempty"`
	Cause       error                  `json:"cause,omitempty"`
}

func (e *EchoPayError) Error() string {
	return fmt.Sprintf("[%s] %s: %s", e.Service, e.Code, e.Message)
}

// Error codes for different services and scenarios
const (
	// Transaction Service Errors
	ErrInsufficientFunds    = "INSUFFICIENT_FUNDS"
	ErrInvalidTransaction   = "INVALID_TRANSACTION"
	ErrTransactionFailed    = "TRANSACTION_FAILED"
	ErrTransactionNotFound  = "TRANSACTION_NOT_FOUND"
	ErrDuplicateTransaction = "DUPLICATE_TRANSACTION"
	
	// Fraud Detection Errors
	ErrFraudDetectionFailed = "FRAUD_DETECTION_FAILED"
	ErrHighRiskTransaction  = "HIGH_RISK_TRANSACTION"
	ErrModelUnavailable     = "MODEL_UNAVAILABLE"
	ErrAnalysisTimeout      = "ANALYSIS_TIMEOUT"
	
	// Token Management Errors
	ErrTokenNotFound        = "TOKEN_NOT_FOUND"
	ErrTokenFrozen          = "TOKEN_FROZEN"
	ErrInvalidTokenState    = "INVALID_TOKEN_STATE"
	ErrTokenTransferFailed  = "TOKEN_TRANSFER_FAILED"
	
	// Reversibility Errors
	ErrCaseNotFound         = "CASE_NOT_FOUND"
	ErrReversalFailed       = "REVERSAL_FAILED"
	ErrInvalidCaseState     = "INVALID_CASE_STATE"
	ErrReversalTimeout      = "REVERSAL_TIMEOUT"
	
	// Compliance Errors
	ErrKYCFailed            = "KYC_FAILED"
	ErrAMLViolation         = "AML_VIOLATION"
	ErrComplianceCheck      = "COMPLIANCE_CHECK_FAILED"
	ErrRegulatoryReporting  = "REGULATORY_REPORTING_FAILED"
	
	// System Errors
	ErrDatabaseConnection   = "DATABASE_CONNECTION_ERROR"
	ErrServiceUnavailable   = "SERVICE_UNAVAILABLE"
	ErrRateLimitExceeded    = "RATE_LIMIT_EXCEEDED"
	ErrAuthenticationFailed = "AUTHENTICATION_FAILED"
	ErrAuthorizationFailed  = "AUTHORIZATION_FAILED"
)

// NewError creates a new EchoPayError with stack trace
func NewError(code, message, service string) *EchoPayError {
	return &EchoPayError{
		Code:       code,
		Message:    message,
		Service:    service,
		Timestamp:  time.Now(),
		StackTrace: getStackTrace(),
	}
}

// WrapError wraps an existing error with EchoPay context
func WrapError(err error, code, message, service string) *EchoPayError {
	return &EchoPayError{
		Code:       code,
		Message:    message,
		Service:    service,
		Timestamp:  time.Now(),
		StackTrace: getStackTrace(),
		Cause:      err,
	}
}

// WithContext adds context information to the error
func (e *EchoPayError) WithContext(traceID, userID, requestID string) *EchoPayError {
	e.TraceID = traceID
	e.UserID = userID
	e.RequestID = requestID
	return e
}

// WithDetails adds additional details to the error
func (e *EchoPayError) WithDetails(details map[string]interface{}) *EchoPayError {
	e.Details = details
	return e
}

// IsRetryable determines if an error condition is retryable
func (e *EchoPayError) IsRetryable() bool {
	retryableCodes := map[string]bool{
		ErrServiceUnavailable:   true,
		ErrDatabaseConnection:   true,
		ErrAnalysisTimeout:      true,
		ErrModelUnavailable:     true,
		ErrRegulatoryReporting:  true,
	}
	
	return retryableCodes[e.Code]
}

// IsUserError determines if an error is caused by user input
func (e *EchoPayError) IsUserError() bool {
	userErrorCodes := map[string]bool{
		ErrInsufficientFunds:    true,
		ErrInvalidTransaction:   true,
		ErrDuplicateTransaction: true,
		ErrTokenFrozen:          true,
		ErrInvalidTokenState:    true,
		ErrInvalidCaseState:     true,
		ErrKYCFailed:           true,
		ErrAuthenticationFailed: true,
		ErrAuthorizationFailed:  true,
	}
	
	return userErrorCodes[e.Code]
}

// GetHTTPStatus returns appropriate HTTP status code for the error
func (e *EchoPayError) GetHTTPStatus() int {
	statusMap := map[string]int{
		ErrInsufficientFunds:    402, // Payment Required
		ErrInvalidTransaction:   400, // Bad Request
		ErrTransactionNotFound:  404, // Not Found
		ErrDuplicateTransaction: 409, // Conflict
		ErrHighRiskTransaction:  403, // Forbidden
		ErrTokenFrozen:          423, // Locked
		ErrRateLimitExceeded:    429, // Too Many Requests
		ErrAuthenticationFailed: 401, // Unauthorized
		ErrAuthorizationFailed:  403, // Forbidden
		ErrServiceUnavailable:   503, // Service Unavailable
		ErrDatabaseConnection:   503, // Service Unavailable
	}
	
	if status, exists := statusMap[e.Code]; exists {
		return status
	}
	
	// Default to 500 for unknown errors
	return 500
}

// getStackTrace captures the current stack trace
func getStackTrace() string {
	buf := make([]byte, 1024)
	for {
		n := runtime.Stack(buf, false)
		if n < len(buf) {
			return string(buf[:n])
		}
		buf = make([]byte, 2*len(buf))
	}
}

// Common error constructors for each service
func NewTransactionError(code, message string) *EchoPayError {
	return NewError(code, message, "transaction-service")
}

func NewFraudDetectionError(code, message string) *EchoPayError {
	return NewError(code, message, "fraud-detection")
}

func NewTokenManagementError(code, message string) *EchoPayError {
	return NewError(code, message, "token-management")
}

func NewReversibilityError(code, message string) *EchoPayError {
	return NewError(code, message, "reversibility-service")
}

func NewComplianceError(code, message string) *EchoPayError {
	return NewError(code, message, "compliance-service")
}