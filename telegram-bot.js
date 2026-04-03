const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const BOT_TOKEN = '8533928458:AAHH5PUtQVgv5XKN7PrBqJP-LeyEP5B0Sio';
const ADMIN_ID = '5220704820';
const TELEBIRR_NUMBER = '0912791487';
const TELEBIRR_NAME = 'Aschalew Tesfaye';
const GAME_URL = 'https://yegna-bingo-final-1.onrender.com';

// Data storage
let users = {};
let withdrawals = [];
let deposits = [];

// Create data folder if not exists
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
try { users = JSON.parse(fs.readFileSync('./data/users.json')); } catch(e) { fs.writeFileSync('./data/users.json', '{}'); }
try { withdrawals = JSON.parse(fs.readFileSync('./data/withdrawals.json')); } catch(e) { fs.writeFileSync('./data/withdrawals.json', '[]'); }
try { deposits = JSON.parse(fs.readFileSync('./data/deposits.json')); } catch(e) { fs.writeFileSync('./data/deposits.json', '[]'); }

function saveUsers() { fs.writeFileSync('./data/users.json', JSON.stringify(users, null, 2)); }
function saveWithdrawals() { fs.writeFileSync('./data/withdrawals.json', JSON.stringify(withdrawals, null, 2)); }
function saveDeposits() { fs.writeFileSync('./data/deposits.json', JSON.stringify(deposits, null, 2)); }

// Bot with retry logic
let bot;
let reconnectAttempts = 0;

function startBot() {
  try {
    bot = new TelegramBot(BOT_TOKEN, { 
      polling: true,
      pollingOptions: {
        timeout: 30,
        interval: 300
      }
    });
    
    console.log("🤖 Bot attempting to connect...");
    
    bot.on('polling_error', (error) => {
      console.log('Polling error:', error.code);
      if (error.code === 'EFATAL' || error.code === 'ETIMEDOUT') {
        console.log('Connection issue, retrying in 10 seconds...');
        setTimeout(() => {
          bot.stopPolling();
          setTimeout(startBot, 5000);
        }, 10000);
      }
    });
    
    bot.on('error', (error) => {
      console.log('Bot error:', error);
    });
    
    // Your bot commands here (same as before)
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, "🎮 Welcome to Yegna Bingo!\n\nUse /help for commands");
    });
    
    console.log("✅ Bot is running!");
    
  } catch (error) {
    console.log("Failed to start bot:", error.message);
    setTimeout(startBot, 10000);
  }
}

// Start the bot
startBot();

// Keep the process alive
process.on('uncaughtException', (error) => {
  console.log('Uncaught exception:', error.message);
  setTimeout(startBot, 10000);
});

console.log("🤖 Yegna Bingo Bot starting...");