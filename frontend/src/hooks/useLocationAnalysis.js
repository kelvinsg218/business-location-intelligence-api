import { useCallback, useState } from 'react';
import { analyzeLocation } from '../services/locationApi.js';

// status: 'idle' | 'loading' | 'success' | 'error'
export function useLocationAnalysis() {
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const runAnalysis = useCallback(async (params) => {
    setStatus('loading');
    setError(null);
    try {
      const result = await analyzeLocation(params);
      setData(result);
      setStatus('success');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, []);

  return {
    status, data, error, runAnalysis,
  };
}
