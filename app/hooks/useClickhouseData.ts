import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@clickhouse/client-web';

interface CandleData {
  timestamp: number;
  token_a: string;
  token_b: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Timeframe = '5m' | '15m' | '1h' | '1d';

interface UseClickhouseDataProps {
  tokenA: string;
  tokenB: string;
  timeframe: Timeframe;
}

interface UseClickhouseDataReturn {
  chartData: ChartData[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

const client = createClient({
  // host: 'http://localhost:8123',
  // username: 'default',
  // password: '',
  clickhouse_settings: {
    date_time_output_format: 'unix_timestamp',
  },
});

type ChartData = {
  x: number; // Convert to milliseconds for Highcharts
  open: number;
  high: number;
  low: number;
  close: number;
};

// Helper function to get the appropriate time function based on timeframe
const getTimeFunction = (timeframe: Timeframe): string => {
  switch (timeframe) {
    case '5m':
      return 'toStartOfFiveMinute';
    case '15m':
      return 'toStartOfFifteenMinutes';
    case '1h':
      return 'toStartOfHour';
    case '1d':
      return 'toStartOfDay';
    default:
      return 'toStartOfHour';
  }
};

export const useClickhouseData = ({
  tokenA,
  tokenB,
  timeframe,
}: UseClickhouseDataProps): UseClickhouseDataReturn => {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<number>();
  const isFetchingRef = useRef<boolean>(false);
  const paramsRef = useRef({ tokenA, tokenB, timeframe });

  const clearError = () => setError(null);

  // Update the ref when params change
  useEffect(() => {
    paramsRef.current = { tokenA, tokenB, timeframe };
  }, [tokenA, tokenB, timeframe]);

  const fetchData = useCallback(async (): Promise<void> => {
    // If already fetching, don't start another request
    if (isFetchingRef.current) return;
    
    try {
      isFetchingRef.current = true;
      setError(null);
      setLoading(true);
      
      const { tokenA, tokenB, timeframe } = paramsRef.current;
      const timeFunction = getTimeFunction(timeframe);
      
      const query = `
        SELECT ${timeFunction}(timestamp) as timestamp,
               token_a,
               token_b,
               argMinMerge(open) as open,
               maxMerge(high)    as high,
               minMerge(low)     as low,
               argMaxMerge(close) as close
        from solana_dex_swaps_5m_candles
        WHERE token_a = '${tokenA}' AND token_b = '${tokenB}'
        GROUP BY timestamp, token_a, token_b
        ORDER BY timestamp ASC
      `;

      const resultSet = await client.query({
        query,
        format: 'JSONEachRow',
      });

      const data = await resultSet.json();
      setLoading(false);

      if (Array.isArray(data) && data.length > 0) {
        const formattedData = data.map((item: CandleData) => ({
          x: item.timestamp * 1000, // Convert to milliseconds for Highcharts
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        }));

        setChartData(formattedData);
      } else {
        setError(`No data found for token pair ${tokenA}/${tokenB}`);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(`Error fetching data: ${error instanceof Error ? error.message : String(error)}`);
      setLoading(false);
    } finally {
      isFetchingRef.current = false;
      
      // Schedule the next fetch after this one completes
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(fetchData, 10000);
    }
  }, []);

  useEffect(() => {
    // Clear any existing timeout when parameters change
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    
    if (tokenA && tokenB) {
      fetchData();
    }
    
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [tokenA, tokenB, timeframe, fetchData]);

  return { chartData, loading, error, clearError };
};
