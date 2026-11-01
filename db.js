const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'finance_user',        // <-- change this
  password: process.env.DB_PASSWORD || '',   // <-- change this
  database: process.env.DB_NAME || 'finance_tracker',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // dates come back as 'YYYY-MM-DD'
  decimalNumbers: true,   // DECIMAL columns come back as numbers
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(60)  NOT NULL,
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL,
      type       ENUM('income','expense') NOT NULL,
      category   VARCHAR(50) NOT NULL,
      amount     DECIMAL(14,2) NOT NULL,
      note       VARCHAR(200) NOT NULL DEFAULT '',
      date       DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tx_user_date (user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      user_id       INT NOT NULL,
      category      VARCHAR(50) NOT NULL,
      monthly_limit DECIMAL(14,2) NOT NULL,
      PRIMARY KEY (user_id, category),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS savings_goals (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      name          VARCHAR(80) NOT NULL,
      target_amount DECIMAL(14,2) NOT NULL,
      saved_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
      deadline      DATE NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id       INT AUTO_INCREMENT PRIMARY KEY,
      user_id  INT NOT NULL,
      kind     ENUM('crypto','stock') NOT NULL,
      asset_id VARCHAR(60) NOT NULL,
      label    VARCHAR(100) NOT NULL,
      UNIQUE KEY uq_watch (user_id, kind, asset_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS holdings (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      user_id   INT NOT NULL,
      kind      ENUM('crypto','stock') NOT NULL,
      asset_id  VARCHAR(60) NOT NULL,
      label     VARCHAR(100) NOT NULL,
      quantity  DECIMAL(24,8) NOT NULL,
      buy_price DECIMAL(20,8) NOT NULL,
      buy_date  DATE NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { pool, init };