import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime
from plotly.subplots import make_subplots

# 
# df = pd.read_csv('~/Downloads/holders-20_35.csv')
# df_swaps = pd.read_csv('~/Downloads/swaps_total-21_35.csv')

# 0x2fe318e688262ab88b220f773223570e18c4d29f
df = pd.read_csv('~/Downloads/holders-2.csv')
df_swaps = pd.read_csv('~/Downloads/swaps_total-2.csv')



df['timestamp'] = pd.to_datetime(df['timestamp'])
df_swaps['timestamp'] = pd.to_datetime(df_swaps['timestamp'])

# For a secondary y-axis version:
fig = make_subplots(specs=[[{"secondary_y": True}]])

fig.add_trace(
    go.Scatter(
        x=df['timestamp'],
        y=df['holders'],
        name='Holders',
        mode='lines+markers'
    ),
    secondary_y=False
)

fig.add_trace(
    go.Scatter(
        x=df_swaps['timestamp'],
        y=df_swaps['total_swaps'],
        name='Total Swaps',
        mode='lines',
        line=dict(color='red')
    ),
    secondary_y=True
)

fig.update_layout(
    title='Token Holders and Swaps Over Time: ' + df['token'].iloc[0],
    xaxis_title='Time',
    template='plotly_white',
    hovermode='x unified'
)

fig.update_yaxes(title_text="Number of Holders", secondary_y=False)
fig.update_yaxes(title_text="Number of Swaps", secondary_y=True)

fig.show()
fig.write_html("token_holders_and_swaps_over_time.html")

# Here are the SQL queries for this script:
# ------ holders:
# SELECT timestamp , token, holders FROM _old_evm_erc20_holders
# --WHERE holders > 100000
# WHERE token = '0x88144b9ea94ff714147573b98165d2aca90efb11'
# ORDER BY timestamp

# ------ swaps_total:
# WITH swaps_hrs AS (
# 	SELECT 
# 		toStartOfFiveMinute(timestamp) AS timestamp,
# 		countIf(token_a = '0x88144b9ea94ff714147573b98165d2aca90efb11') AS swap_count
# 	FROM evm_swaps_raw_dupl_mv
# 	GROUP BY timestamp
# 	ORDER BY timestamp
# )
# SELECT
# 	timestamp,
# 	SUM (swap_count) OVER (ORDER BY timestamp ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS total_swaps
# FROM swaps_hrs
