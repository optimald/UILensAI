/**
 * AI Provider Circuit Breaker
 * 
 * Prevents continuous retries against a completely failed provider API to save time/costs.
 * If a provider fails continuously, the circuit opens and requests are immediately routed
 * to fallbacks without waiting for timeout cycles.
 */
class CircuitBreaker {
    constructor(failureThreshold = 3, resetTimeoutMs = 300000 /* 5 mins */) {
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
        this.providers = new Map(); // { providerName: { failures: 0, nextTryAllowed: 0 } }
    }

    /**
     * Check if a provider is currently blocked by the circuit breaker.
     * @param {string} providerName 
     * @returns {boolean} true if the provider is OPEN (should be skipped)
     */
    isBlocked(providerName) {
        const state = this.providers.get(providerName?.toLowerCase());
        if (!state) return false;

        if (state.failures >= this.failureThreshold) {
            const now = Date.now();
            if (now >= state.nextTryAllowed) {
                // HALF-OPEN state: timeout expired, allow a test request
                return false;
            }
            return true; // OPEN state: still blocked
        }
        return false; // CLOSED state: healthy
    }

    /**
     * Record a failure for a provider.
     * @param {string} providerName 
     */
    recordFailure(providerName) {
        const pName = providerName?.toLowerCase();
        let state = this.providers.get(pName);
        
        if (!state) {
            state = { failures: 0, nextTryAllowed: 0 };
            this.providers.set(pName, state);
        }

        state.failures += 1;
        
        // If we just hit the threshold, open the circuit
        if (state.failures === this.failureThreshold) {
            state.nextTryAllowed = Date.now() + this.resetTimeoutMs;
            console.warn(`[CircuitBreaker] ⚠️ Provider '${pName}' circuit is now OPEN after ${this.failureThreshold} failures. Blocked for ${this.resetTimeoutMs / 1000}s.`);
        } else if (state.failures > this.failureThreshold) {
            // If we are in HALF-OPEN state and fail again, immediately reset the timeout window
            state.nextTryAllowed = Date.now() + this.resetTimeoutMs;
        }
    }

    /**
     * Record a success for a provider. Resets failures to 0.
     * @param {string} providerName 
     */
    recordSuccess(providerName) {
        const pName = providerName?.toLowerCase();
        const state = this.providers.get(pName);
        
        if (state && state.failures > 0) {
            if (state.failures >= this.failureThreshold) {
                console.info(`[CircuitBreaker] ✅ Provider '${pName}' circuit is now CLOSED again. Communication restored.`);
            }
            state.failures = 0;
            state.nextTryAllowed = 0;
        }
    }
    /**
     * Reset all circuit breakers. Used between pipeline phases
     * (e.g., clearing module-phase breakers before debate/CEO phase).
     */
    resetAll() {
        const wasOpen = [];
        for (const [name, state] of this.providers.entries()) {
            if (state.failures >= this.failureThreshold) {
                wasOpen.push(name);
            }
        }
        this.providers.clear();
        if (wasOpen.length > 0) {
            console.info(`[CircuitBreaker] 🔄 Reset all circuits. Previously OPEN: ${wasOpen.join(', ')}`);
        }
    }
}

// Global singleton instance
const circuitBreaker = new CircuitBreaker();

module.exports = {
    circuitBreaker,
    CircuitBreaker // Export class strictly for unit testing
};
