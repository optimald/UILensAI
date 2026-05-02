const { CircuitBreaker } = require('../utils/ai-providers/circuit-breaker');

describe('CircuitBreaker - Basic Operations', () => {
    it('initializes with closed circuit', () => {
        const cb = new CircuitBreaker();
        expect(cb.isBlocked('openrouter')).toBe(false);
    });

    it('records failures and opens circuit at threshold', () => {
        const cb = new CircuitBreaker(3, 60000);
        
        cb.recordFailure('openrouter');
        expect(cb.isBlocked('openrouter')).toBe(false, 'Should be closed after 1 failure');
        
        cb.recordFailure('openrouter');
        expect(cb.isBlocked('openrouter')).toBe(false, 'Should be closed after 2 failures');
        
        cb.recordFailure('openrouter');
        expect(cb.isBlocked('openrouter')).toBe(true, 'Should be open after 3 failures');
    });

    it('circuit opens per-provider independently', () => {
        const cb = new CircuitBreaker(2, 60000);
        
        cb.recordFailure('claude');
        cb.recordFailure('claude');
        
        cb.recordFailure('openai');
        
        expect(cb.isBlocked('claude')).toBe(true);
        expect(cb.isBlocked('openai')).toBe(false);
    });

    it('handles case sensitivity correctly', () => {
        const cb = new CircuitBreaker(2, 60000);
        cb.recordFailure('OpenRouter');
        cb.recordFailure('openrouter');
        
        expect(cb.isBlocked('OPENROUTER')).toBe(true);
    });

    it('success resets failure count', () => {
        const cb = new CircuitBreaker(3, 60000);
        
        cb.recordFailure('gemini');
        cb.recordFailure('gemini');
        expect(cb.providers.get('gemini').failures).toBe(2);
        
        cb.recordSuccess('gemini');
        expect(cb.providers.get('gemini').failures).toBe(0);
        expect(cb.isBlocked('gemini')).toBe(false);
    });
});

describe('CircuitBreaker - Timeouts and Half-Open State', () => {
    it('transitions to half-open after timeout', async () => {
        const resetTimeoutMs = 100;
        const cb = new CircuitBreaker(2, resetTimeoutMs);
        
        cb.recordFailure('deepseek');
        cb.recordFailure('deepseek');
        
        expect(cb.isBlocked('deepseek')).toBe(true, 'Circuit should be OPEN initially');
        
        // Wait for timeout to expire
        await new Promise(resolve => setTimeout(resolve, resetTimeoutMs + 10));
        
        // After timeout, isBlocked should return false (this is HALF-OPEN)
        expect(cb.isBlocked('deepseek')).toBe(false, 'Circuit should be HALF-OPEN after timeout');
        
        // If it fails again while HALF-OPEN, it should immediately re-open
        cb.recordFailure('deepseek');
        expect(cb.isBlocked('deepseek')).toBe(true, 'Circuit should re-open on failure in HALF-OPEN state');
    });

    it('fully closes if success in half-open state', async () => {
        const resetTimeoutMs = 100;
        const cb = new CircuitBreaker(2, resetTimeoutMs);
        
        cb.recordFailure('deepseek');
        cb.recordFailure('deepseek');
        
        await new Promise(resolve => setTimeout(resolve, resetTimeoutMs + 10));
        
        expect(cb.isBlocked('deepseek')).toBe(false, 'HALF-OPEN');
        cb.recordSuccess('deepseek');
        
        // Now it's fully closed, takes 2 failures to open again
        cb.recordFailure('deepseek');
        expect(cb.isBlocked('deepseek')).toBe(false, 'Should be CLOSED');
    });
});
