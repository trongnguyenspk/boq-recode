import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeSaveToStorage } from '../App';

describe('Storage Safety Wrapper', () => {
  let setItemSpy: any;

  beforeEach(() => {
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully save item if quota is not exceeded', () => {
    const result = safeSaveToStorage('test_key', 'test_value');
    expect(result).toBe(true);
    expect(setItemSpy).toHaveBeenCalledWith('test_key', 'test_value');
  });

  it('should not throw exception and return false when QuotaExceededError is thrown', () => {
    setItemSpy.mockImplementation(() => {
      // Simulate QuotaExceededError
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // This should throw if safeSaveToStorage is not wrapped in a try-catch, failing the test.
    const result = safeSaveToStorage('test_key', 'test_value');
    
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
