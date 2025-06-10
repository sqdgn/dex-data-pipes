import matplotlib.pyplot as plt
import pandas as pd

df_prices = pd.read_csv("~/Downloads/toshinme-1748836644033.csv")

print(len(df_prices))

token_df = df_prices
token_df = token_df.dropna(subset=["timestamp", "price_token_usdc"])
#token_df = token_df[token_df["price_token_usdc"] <= 2]
token_df = token_df.iloc[::6]  # take every 4th row
token_df = token_df.sort_values(by="timestamp")

plt.figure(figsize=(12, 6))
plt.plot(token_df["timestamp"], token_df["price_token_usdc"], marker=".", linestyle="-")
#plt.title(f"Price chart for token {token}")
plt.xlabel("Timestamp")
plt.ylabel("Price (USD)")
plt.grid(True)
plt.tight_layout()
plt.show()
