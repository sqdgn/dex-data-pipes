from dash import Dash, dcc, html, Input, Output
import plotly.graph_objects as go
import pandas as pd
import sys

# Get the CSV file path from command line arguments
if len(sys.argv) > 1:
    csv_file_path = sys.argv[1]
else:
    print("Error: Please provide a CSV file path as the first argument")
    print("Usage: python your_script.py path/to/your/file.csv")
    sys.exit(1)

app = Dash(__name__)

app.layout = html.Div([
    html.H4('Stock candlestick chart'),
    dcc.Checklist(
        id='toggle-rangeslider',
        options=[{'label': 'Include Rangeslider',
                  'value': 'slider'}],
        value=['slider']
    ),
    dcc.Graph(id="graph"),
])


@app.callback(
    Output("graph", "figure"),
    Input("toggle-rangeslider", "value"))
def display_candlestick(value):
    # Read the CSV file from the provided path
    try:
        df = pd.read_csv(csv_file_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Sort by timestamp and create sequential index for x-axis
        df = df.sort_values('timestamp')
        
        fig = go.Figure(go.Candlestick(
            x=list(range(len(df))),  # Convert range to list
            open=df['open_price_token_usd'],
            high=df['high_price_token_usd'],
            low=df['low_price_token_usd'],
            close=df['close_price_token_usd']
        ))

        # Create custom x-axis ticks with timestamps
        fig.update_layout(
            xaxis=dict(
                tickmode='array',
                ticktext=df['timestamp'].dt.strftime('%H:%M\n%b %d'),
                tickvals=list(range(len(df))),
                type='category'  # Use category type to ensure equal spacing
            ),
            height=600,
            margin=dict(l=50, r=50, t=50, b=50),
            yaxis=dict(
                autorange=True,
                fixedrange=False,
            ),
            xaxis_rangeslider_visible='slider' in value
        )

        return fig
    except Exception as e:
        print(f"Error reading or processing CSV file: {e}")
        return go.Figure()


if __name__ == '__main__':
    app.run(debug=True)
