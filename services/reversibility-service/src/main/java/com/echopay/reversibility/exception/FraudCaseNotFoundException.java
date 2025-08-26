package com.echopay.reversibility.exception;

/**
 * Exception thrown when a fraud case is not found.
 */
public class FraudCaseNotFoundException extends RuntimeException {
    
    public FraudCaseNotFoundException(String message) {
        super(message);
    }
    
    public FraudCaseNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}