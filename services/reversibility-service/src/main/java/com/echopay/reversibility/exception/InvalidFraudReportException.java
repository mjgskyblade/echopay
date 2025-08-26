package com.echopay.reversibility.exception;

/**
 * Exception thrown when a fraud report is invalid.
 */
public class InvalidFraudReportException extends RuntimeException {
    
    public InvalidFraudReportException(String message) {
        super(message);
    }
    
    public InvalidFraudReportException(String message, Throwable cause) {
        super(message, cause);
    }
}