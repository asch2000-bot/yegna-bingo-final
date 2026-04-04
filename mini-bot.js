const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = '8632918540:AAFvCImPVs1iiEINeIqVkc3pditMwadfyl0';
const GAME_URL = 'https://yegna-bingo-final-1.onrender.com';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Yegna Bingo Mini Bot is running...');

// Start command with Mini App button
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, '🎮 *YEGNA BINGO* 🎮\n\nClick the button below to play inside Telegram!\n\n💰 Win up to 150 Birr!\n🎯 1-3 numbers (10 Birr each)\n📞 Telebirr: 0912791487 - Aschalew Tesfaye', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{
        text: '🎮 PLAY BINGO',
        web_app: { url: GAME_URL }
      }]]
    }
  });
});

// Play command
bot.onText(/\/play/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🎮 Play Yegna Bingo:', {
    reply_markup: {
      inline_keyboard: [[{
        text: '🎮 PLAY NOW',
        web_app: { url: GAME_URL }
      }]]
    }
  });
});

// Deposit command
bot.onText(/\/deposit/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💰 *DEPOSIT INSTRUCTIONS* 💰

1. Open Telebirr App
2. Send payment to:
   📞 *0912791487*
   👤 *Aschalew Tesfaye*

3. Amount: 10 - 500 Birr

4. Send transaction ID here for approval

*Min:* 10 Birr | *Max:* 500 Birr
`, { parse_mode: 'Markdown' });
});

// Withdraw command
bot.onText(/\/withdraw/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💸 *WITHDRAWAL REQUEST* 💸

Minimum withdrawal: 50 Birr

Send: /request [amount] [phone]

Example: /request 100 0912345678

Processing time: 5-30 minutes
`, { parse_mode: 'Markdown' });
});

// Balance command
bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `💰 Check your balance at:\n${GAME_URL}\n\nLogin with your phone number.`);
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
📋 *YEGNA BINGO COMMANDS* 📋

/start - Welcome with Mini App
/play - Get game link
/deposit - Deposit instructions
/withdraw - Withdrawal info
/balance - Check balance
/help - This help menu

🎮 Play now: ${GAME_URL}
`, { parse_mode: 'Markdown' });
});

console.log('✅ Bot is ready!');
console.log('📱 Bot: @Yegnabingo1_bot');
console.log('🎮 Game URL:', GAME_URL);