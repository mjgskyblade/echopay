package logging

import (
	"context"
	"log/slog"
	"os"
	"time"
)

type Logger struct {
	*slog.Logger
	serviceName string
}

type LogEntry struct {
	Timestamp   time.Time              `json:"timestamp"`
	Level       string                 `json:"level"`
	Service     string                 `json:"service"`
	Message     string                 `json:"message"`
	TraceID     string                 `json:"trace_id,omitempty"`
	UserID      string                 `json:"user_id,omitempty"`
	RequestID   string                 `json:"request_id,omitempty"`
	Fields      map[string]interface{} `json:"fields,omitempty"`
}

func NewLogger(serviceName string) *Logger {
	opts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}
	
	handler := slog.NewJSONHandler(os.Stdout, opts)
	logger := slog.New(handler)
	
	return &Logger{
		Logger:      logger,
		serviceName: serviceName,
	}
}

func (l *Logger) WithContext(ctx context.Context) *Logger {
	// Extract trace ID, user ID, request ID from context
	traceID := getTraceID(ctx)
	userID := getUserID(ctx)
	requestID := getRequestID(ctx)
	
	logger := l.Logger.With(
		"service", l.serviceName,
		"trace_id", traceID,
		"user_id", userID,
		"request_id", requestID,
	)
	
	return &Logger{
		Logger:      logger,
		serviceName: l.serviceName,
	}
}

func (l *Logger) LogTransaction(ctx context.Context, transactionID, action string, fields map[string]interface{}) {
	l.WithContext(ctx).Info("transaction_event",
		"transaction_id", transactionID,
		"action", action,
		"fields", fields,
	)
}

func (l *Logger) LogFraudDetection(ctx context.Context, transactionID string, riskScore float64, factors []string) {
	l.WithContext(ctx).Info("fraud_detection",
		"transaction_id", transactionID,
		"risk_score", riskScore,
		"risk_factors", factors,
	)
}

func (l *Logger) LogError(ctx context.Context, err error, message string, fields map[string]interface{}) {
	l.WithContext(ctx).Error(message,
		"error", err.Error(),
		"fields", fields,
	)
}

// Helper functions to extract context values
func getTraceID(ctx context.Context) string {
	if traceID := ctx.Value("trace_id"); traceID != nil {
		return traceID.(string)
	}
	return ""
}

func getUserID(ctx context.Context) string {
	if userID := ctx.Value("user_id"); userID != nil {
		return userID.(string)
	}
	return ""
}

func getRequestID(ctx context.Context) string {
	if requestID := ctx.Value("request_id"); requestID != nil {
		return requestID.(string)
	}
	return ""
}