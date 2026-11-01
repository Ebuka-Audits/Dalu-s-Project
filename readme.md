# Ledgerly: Personal Finance Tracker

A web-based finance tracker built as a final year project. Users record income and
spending in naira, set budgets and savings goals, follow crypto and stock prices,
track an investment portfolio, and download a monthly PDF report.

## Tech stack
- Node.js and Express
- MySQL (mysql2)
- EJS templates, plain JavaScript, Chart.js
- bcryptjs, express-session
- PDFKit
- CoinPaprika API (crypto) and Tiingo API (stocks)

## Features
- Register, log in and log out
- Income and expense transactions: add, edit, delete, search, filter by month
- Monthly budgets per category with 80% and over-budget warnings
- Savings goals with deadlines and monthly saving suggestions
- Crypto and stock price charts (1 month to 1 year)
- Watchlist and investment portfolio with gain or loss
- PDF monthly report and CSV export
- Landing page with FAQ

## Setup
1. Install Node.js (v20 or newer) and MySQL.
2. Create the database:
   ```sql
   CREATE DATABASE finance_tracker CHARACTER SET utf8mb4;
   CREATE USER 'finance_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON finance_tracker.* TO 'finance_user'@'localhost';
Install packages:
npm install
Create a .env file in the project root:
DB_HOST=localhost
DB_USER=finance_user
DB_PASSWORD=your_password
DB_NAME=finance_tracker
SESSION_SECRET=a-long-random-string
TIINGO_KEY=your_tiingo_token
PORT=3000
A free Tiingo token comes from tiingo.com. Crypto charts need no key.
Start the app:
npm run dev
Open http://localhost:3000. Tables are created automatically on first start.
Project structure
server.js          app setup, sessions, page routes
db.js              MySQL pool and table creation
categories.js      income and expense categories
middleware.js      login guards and async wrapper
routes/auth.js     register, login, logout
routes/api.js      transactions, budgets, summary, CSV export
routes/market.js   crypto and stock price data (cached)
routes/features.js goals, watchlist, portfolio, PDF report
views/             home, auth and dashboard pages (EJS)
public/            CSS and browser JavaScript
Security measures
Passwords hashed with bcrypt
Parameterised SQL queries (prevents SQL injection)
Every record is scoped to the logged-in user
Server-side validation of all inputs
Output escaped in the browser (prevents XSS)
HTTP-only, same-site session cookies; session ID regenerated on login
Login attempt throttling
API keys and database credentials kept in environment variables
CSV export protected against spreadsheet formula injection
Limitations and future work
Market data covers crypto and US stocks only, in US dollars, and may be delayed
Free API plans limit how many price lookups are possible per hour
Add CSRF tokens, a persistent session store and HTTPS for production
Add NGX (Nigerian stock) prices, currency conversion and recurring transactions
Add automated tests
Disclaimer
Market prices are for information only and are not investment advice.
## 3. Defence checklist

**Screenshots to take (save these for your report):**
1. Home page (top and FAQ)
2. Registration page and login page, including a login error
3. Dashboard with real sample data (balance, charts)
4. Add and edit transaction form
5. Budget with a warning and an over-budget bar
6. A savings goal in progress
7. Crypto chart and stock chart
8. Watchlist and portfolio with gain and loss
9. The downloaded PDF report
10. The MySQL tables (`SHOW TABLES;` and a `SELECT * FROM users;` showing hashed passwords)

**Demo order (about 5 minutes):**
1. Show the home page and create a new account.
2. Add an income and two or three expenses.
3. Set a food budget and push it over the limit.
4. Create a savings goal and add money to it.
5. Chart Bitcoin and `AAPL`, add one to the watchlist and record a purchase.
6. Download the PDF report.
7. Show the MySQL database and the hashed passwords.

Before the defence, fill the app with believable data and check that every feature works. Have your Tiingo token and internet ready, because the market charts need both.

**Questions examiners often ask:**
- **Why this stack?** Node.js lets one language run on server and browser, and MySQL is a reliable relational database for linked user and transaction data.
- **How is it secure?** Hashed passwords, parameterised queries, per-user data scoping, validation and session cookies.
- **Why are API calls made from the server?** It keeps the API key hidden and lets you cache results to respect free limits.
- **What are its limits?** US dollars only for markets, free-tier rate limits, and no Nigerian stocks.
- **What would you add next?** CSRF protection, automated tests, NGX data and currency conversion.
-