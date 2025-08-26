package com.echopay.reversibility.exception;

/**
 * Exception thrown when reversal operations fail.
 */
public class ReversalException extends RuntimeException {
    
    public ReversalException(String message) {
        super(message);
    }
    
    public ReversalException(String message, Throwable cause) {
        super(message, cause);
    }
}