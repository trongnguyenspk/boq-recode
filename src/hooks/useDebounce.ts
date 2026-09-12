/**
 * useDebounce Hook
 * Part of E5: Search & Filter feature
 * 
 * Debounces a value to prevent excessive updates during rapid input.
 * Following react-patterns skill recommendations.
 */

import { useState, useEffect } from 'react';

/**
 * Debounce a value with a specified delay
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Set up the timeout
        const timeoutId = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // Clean up on value change or unmount
        return () => {
            clearTimeout(timeoutId);
        };
    }, [value, delay]);

    return debouncedValue;
}

export default useDebounce;
