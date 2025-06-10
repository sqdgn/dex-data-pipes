import ErrorIcon from '@mui/icons-material/Error';
import {
  Box,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts/highstock';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useClickhouseData } from '../hooks/useClickhouseData';

// Define timeframe options
type Timeframe = '5m' | '15m' | '1h' | '1d';

const CandlestickChart: React.FC = () => {
  const [tokenA, setTokenA] = useState<string>('6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');
  const [tokenB, setTokenB] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [inputTokenA, setInputTokenA] = useState<string>(tokenA);
  const [inputTokenB, setInputTokenB] = useState<string>(tokenB);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const chartRef = useRef<HighchartsReact.RefObject>(null);
  const [isChartCreated, setIsChartCreated] = useState(false);

  const { chartData, loading, error } = useClickhouseData({ tokenA, tokenB, timeframe });

  // Create chart options with memoization to prevent unnecessary re-renders
  const options = useMemo(
    () => ({
      title: { text: '' },
      rangeSelector: {
        enabled: false, // Disable range selector
      },
      navigator: {
        enabled: true,
      },
      scrollbar: {
        enabled: true,
      },
      chart: {
        events: {
          load: function () {
            setIsChartCreated(true);
          },
        },
      },
      yAxis: {
        title: {
          text: 'Price (USDC)',
        },
        labels: {
          formatter: function () {
            return '$' + this.value.toFixed(2);
          },
        },
      },
      series: [
        {
          type: 'candlestick',
          name: tokenA, //`${tokenA} / ${tokenB}`,
          data: [],
        },
      ],
      plotOptions: {
        candlestick: {
          color: 'pink',
          lineColor: 'red',
          upColor: 'lightgreen',
          upLineColor: 'green',
        },
      },
      tooltip: {
        valueDecimals: 8,
        valuePrefix: '$',
        headerFormat: '<span style="font-size: 10px">{point.key}</span><br/>',
        pointFormat: `
        <span>{series.name}:<br /><br />
        Open: <b>{point.open}</b><br />
        High: <b>{point.high}</b><br />
        Low:  <b>{point.low}</b><br />
        Close: <b>{point.close}</b></span>`,
      },
      credits: {
        enabled: false, // Remove Highcharts credits
      },
    }),
    [tokenA, tokenB],
  );

  // Update chart data when chartData changes
  useEffect(() => {
    if (isChartCreated && chartRef.current?.chart && chartData.length > 0) {
      const chart = chartRef.current.chart;
      if (chart.series[0]) {
        // Update without animation and redraw
        chart.series[0].setData(chartData, true, true, true);
      }
    }
  }, [chartData, isChartCreated, timeframe]);

  const handleTokenABlur = () => {
    if (inputTokenA && inputTokenA !== tokenA) {
      setTokenA(inputTokenA);
    }
  };

  const handleTokenBBlur = () => {
    if (inputTokenB && inputTokenB !== tokenB) {
      setTokenB(inputTokenB);
    }
  };

  const handleTimeframeChange = (event: React.MouseEvent<HTMLElement>, newTimeframe: Timeframe) => {
    if (newTimeframe !== null) {
      setTimeframe(newTimeframe);
    }
  };

  return (
    <div>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <TextField
            label="Token"
            value={inputTokenA}
            onChange={(e) => setInputTokenA(e.target.value)}
            onBlur={handleTokenABlur}
            required
            fullWidth
            size="small"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            label="Token B"
            value={inputTokenB}
            onChange={(e) => setInputTokenB(e.target.value)}
            onBlur={handleTokenBBlur}
            required
            fullWidth
            size="small"
          />
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={timeframe}
          exclusive
          onChange={handleTimeframeChange}
          aria-label="timeframe"
          size="small"
        >
          <ToggleButton value="5m" aria-label="5 minutes">
            5m
          </ToggleButton>
          <ToggleButton value="15m" aria-label="15 minutes">
            15m
          </ToggleButton>
          <ToggleButton value="1h" aria-label="1 hour">
            1h
          </ToggleButton>
          <ToggleButton value="1d" aria-label="1 day">
            1d
          </ToggleButton>
        </ToggleButtonGroup>

        {loading && (
          <Box display="flex" alignItems="center" gap={1}>
            <CircularProgress size={16} />
            <Typography variant="caption">Loading...</Typography>
          </Box>
        )}
      </Box>

      {error && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            minHeight: '48px',
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Chip icon={<ErrorIcon />} label="Error" color="error" size="small" />
            <Typography variant="body2">{error}</Typography>
          </Box>
        </Paper>
      )}

      <HighchartsReact
        highcharts={Highcharts}
        constructorType="stockChart"
        options={options}
        ref={chartRef}
        immutable={false}
        callback={() => setIsChartCreated(true)}
      />
    </div>
  );
};

export default CandlestickChart;
